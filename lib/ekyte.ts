// Cliente da API interna do Ekyte (a mesma que o app.ekyte.com usa; não há API pública documentada).
// Auth: Bearer JWT copiado do navegador. Os formatos de resposta/payload abaixo seguem o que o MCP
// da Ekyte faz; se algum campo divergir, o erro devolvido pelo Ekyte é repassado na íntegra.

const BASE = 'https://api.ekyte.com'

export type EkyteOption = { id: string; name: string }

function config() {
  const token = process.env.EKYTE_BEARER_TOKEN
  const companyId = process.env.EKYTE_COMPANY_ID
  if (!token || !companyId) {
    throw new Error('Ekyte não configurado: defina EKYTE_BEARER_TOKEN e EKYTE_COMPANY_ID.')
  }
  return { token, companyId }
}

async function ekyte(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const { token, companyId } = config()
  const res = await fetch(`${BASE}/api/companies/${companyId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await res.text()
  if (res.status === 401) throw new Error('Token do Ekyte expirado ou inválido (401). Gere outro no navegador.')
  if (!res.ok) throw new Error(`Ekyte ${res.status}: ${text.slice(0, 300)}`)
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>

function asList(json: unknown): Obj[] {
  if (Array.isArray(json)) return json as Obj[]
  const o = (json || {}) as Obj
  for (const k of ['data', 'items', 'results', 'content']) {
    if (Array.isArray(o[k])) return o[k]
    if (o[k] && Array.isArray(o[k].data)) return o[k].data
  }
  return []
}

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export async function listWorkspaces(search?: string): Promise<EkyteOption[]> {
  const qs = new URLSearchParams()
  if (search) qs.set('search', search)
  const list = asList(await ekyte('GET', `/workspaces?${qs}`))
  return list.map((w) => ({ id: String(w.id), name: String(w.name ?? w.title ?? w.id) }))
}

export async function listUsers(): Promise<EkyteOption[]> {
  const list = asList(await ekyte('GET', '/users'))
  return list
    .map((u) => ({ id: String(u.id ?? u.uuid), name: String(u.name ?? u.fullName ?? u.email ?? '') }))
    .filter((u) => u.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// Tipo de tarefa "Verificação" (= modelo + workflow). Usa EKYTE_VERIFICATION_TASK_TYPE_ID ou busca pelo nome.
async function verificationTaskType(): Promise<{ id: string; workflowId: string }> {
  const list = asList(await ekyte('GET', '/task-types'))
  const wanted = process.env.EKYTE_VERIFICATION_TASK_TYPE_ID
  const t = wanted
    ? list.find((x) => String(x.id) === wanted)
    : list.find((x) => normalize(String(x.name ?? x.title ?? '')).startsWith('verifica'))
  if (!t) {
    throw new Error(
      wanted
        ? `Tipo de tarefa ${wanted} não encontrado no Ekyte.`
        : 'Não achei o tipo de tarefa "Verificação" no Ekyte. Defina EKYTE_VERIFICATION_TASK_TYPE_ID.'
    )
  }
  const workflowId = t.workflowId ?? t.workflow_id ?? t.workflow?.id
  if (workflowId == null) throw new Error('Tipo de tarefa "Verificação" sem workflow associado.')
  return { id: String(t.id), workflowId: String(workflowId) }
}

async function firstPhaseId(workflowId: string): Promise<string> {
  const wf = (await ekyte('GET', `/workflows/${workflowId}`)) as Obj
  const phases = (wf.phases ?? wf.data?.phases ?? []) as Obj[]
  const first = [...phases].sort((a, b) => (a.order ?? a.position ?? 0) - (b.order ?? b.position ?? 0))[0]
  if (!first) throw new Error('Workflow do tipo "Verificação" não tem fases.')
  return String(first.id)
}

export async function createVerificationTask(input: {
  title: string
  description?: string
  workspaceId: string
  executorId: string
  dueDate: string // YYYY-MM-DD
}): Promise<{ id: number }> {
  const type = await verificationTaskType()
  const phaseId = await firstPhaseId(type.workflowId)
  const today = new Date().toISOString().slice(0, 10)
  const created = (await ekyte('POST', '/ctc-tasks', {
    title: input.title,
    description: input.description || undefined,
    workspaceId: Number(input.workspaceId),
    taskTypeId: Number(type.id),
    executorId: input.executorId,
    phaseId: Number(phaseId),
    phaseStartDate: today,
    phaseDueDate: input.dueDate,
  })) as Obj
  const id = created.id ?? created.data?.id ?? created.taskId
  if (id == null) throw new Error('Ekyte criou a tarefa mas não devolveu o id.')
  return { id: Number(id) }
}
