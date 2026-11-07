// Cliente do Ekyte via endpoint MCP (JSON-RPC sobre HTTP). A URL já traz o token:
//   EKYTE_MCP_URL=https://api.ekyte.com/mcp?token=...
// Nunca versionar nem logar essa URL.

export type EkyteOption = { id: string; name: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>

async function callTool(name: string, args: Obj = {}): Promise<unknown> {
  const url = process.env.EKYTE_MCP_URL
  if (!url) throw new Error('Ekyte não configurado: defina EKYTE_MCP_URL.')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    cache: 'no-store',
  })
  const text = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Token do Ekyte inválido ou sem permissão.')
  if (!res.ok) throw new Error(`Ekyte ${res.status}: ${text.slice(0, 300)}`)

  let json: Obj
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('Resposta inesperada do Ekyte.')
  }
  if (json.error) throw new Error(`Ekyte (${name}): ${json.error.message || JSON.stringify(json.error)}`)

  const result: Obj = json.result || {}
  const content = (result.content || []).map((c: Obj) => c.text || '').join('')
  if (result.isError) throw new Error(`Ekyte (${name}): ${content.slice(0, 300)}`)
  if (result.structuredContent) return result.structuredContent.items ?? result.structuredContent
  try {
    return content ? JSON.parse(content) : {}
  } catch {
    return content
  }
}

function asList(v: unknown): Obj[] {
  if (Array.isArray(v)) return v as Obj[]
  const items = (v as Obj | null)?.items
  return Array.isArray(items) ? items : []
}

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export async function listWorkspaces(search?: string): Promise<EkyteOption[]> {
  const list = asList(await callTool('list_short_workspaces', { active: true, ...(search ? { textSearch: search } : {}) }))
  return list.map((w) => ({ id: String(w.id), name: String(w.name) }))
}

// Executores possíveis: usuários administradores e editores.
export async function listUsers(): Promise<EkyteOption[]> {
  const list = asList(await callTool('list_admin_editors_users'))
  return list
    .map((u) => ({ id: String(u.id), name: String(u.userName || u.email || '') }))
    .filter((u) => u.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// Modelo "[verificação]" (nome exato, sem os colchetes). EKYTE_VERIFICATION_TASK_TYPE_ID força outro tipo.
// Há dezenas de tipos que apenas começam com "Verificação de…"; esses não servem de modelo genérico.
async function verificationTaskTypeId(): Promise<number> {
  const forced = process.env.EKYTE_VERIFICATION_TASK_TYPE_ID
  if (forced) return Number(forced)

  const list = asList(await callTool('list_task_types_create_task', { textSearch: 'verifica' }))
  const exact = list.filter((t) => normalize(String(t.name)).replace(/[\[\]]/g, '').trim() === 'verificacao')
  if (exact.length === 1) return Number(exact[0].id)
  throw new Error(
    exact.length === 0
      ? 'Não achei o modelo "[verificação]" no Ekyte. Defina EKYTE_VERIFICATION_TASK_TYPE_ID.'
      : 'Há mais de um modelo "verificação" no Ekyte. Defina EKYTE_VERIFICATION_TASK_TYPE_ID.'
  )
}

// Cria a tarefa montando o fluxo pelo modelo (useTaskTypeFlow=1, que não aceita executor) e depois
// troca o executor da etapa atual. Se só a troca falhar, a tarefa existe e devolvemos um aviso.
export async function createVerificationTask(input: {
  title: string
  description: string
  workspaceId: string
  executorId: string
  dueDate: string // YYYY-MM-DD
}): Promise<{ id: number; warning?: string }> {
  const created = (await callTool('create_task', {
    title: input.title,
    description: input.description,
    workspaceId: Number(input.workspaceId),
    ctcTaskTypeId: await verificationTaskTypeId(),
    currentDueDate: `${input.dueDate}T18:00:00`,
    situation: 10,
    useTaskTypeFlow: 1,
  })) as Obj
  const raw = created.id ?? created.taskId ?? created.ctcTaskId ?? created.data?.id ?? created.items?.[0]?.id
  const id = Number(raw)
  if (!Number.isFinite(id)) throw new Error(`Ekyte criou a tarefa mas não devolveu o id: ${JSON.stringify(created).slice(0, 200)}`)

  try {
    const phases = asList(await callTool('list_task_flow_phases', { taskId: id }))
    const current = phases.find((p) => p.active !== 0 && p.active !== false && !p.concluded) ?? phases[0]
    const phaseId = Number(current?.phase?.id ?? current?.phaseId)
    if (!Number.isFinite(phaseId)) throw new Error('etapa atual não encontrada')
    await callTool('update_task_executor', {
      taskId: id,
      phaseId,
      patchDoc: [{ op: 'replace', path: '/executorId', value: input.executorId }],
    })
  } catch (err) {
    return {
      id,
      warning: `Tarefa criada (#${id}), mas não consegui definir o responsável: ${err instanceof Error ? err.message : 'erro'}. Ajuste no Ekyte.`,
    }
  }
  return { id }
}
