import type Groq from 'groq-sdk'
import { chat, MODEL } from '@/lib/groq'
import { supabase } from '@/lib/supabase'
import { OWNER_FIELDS, type OwnerKey } from '@/lib/owners'
import { listTasks, type TaskStatus } from '@/lib/tasks'

type Msg = Groq.Chat.ChatCompletionMessageParam
type Tool = Groq.Chat.ChatCompletionTool

export interface HistoryMsg { role: 'user' | 'ai'; text: string }
export interface CreatedTask { id: string; title: string; client_name: string }
export interface AssistantResult { reply: string; created: CreatedTask[] }

interface ClientRow { id: string; name: string; status: string; account_manager: string | null; social_media: string | null; traffic_manager: string | null; designer: string | null }

const MAX_STEPS = 5
const MAX_LISTED = 25

const STATUS_MAP: Record<string, TaskStatus> = { abertas: 'open', concluidas: 'done', todas: 'all' }
const ROLE_KEYS: Record<string, OwnerKey> = {
  gestor: 'account_manager',
  social: 'social_media',
  trafego: 'traffic_manager',
  designer: 'designer',
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Match tolerante (acento, caixa, nome parcial). Útil porque o áudio transcrito erra nomes.
function findByName(names: string[], query: string) {
  const q = norm(query)
  const exact = names.find(n => norm(n) === q)
  if (exact) return { match: exact, candidates: [exact] }
  const tokens = q.split(/\s+/).filter(Boolean)
  const candidates = names.filter(n => tokens.every(t => norm(n).includes(t)))
  return { match: candidates.length === 1 ? candidates[0] : undefined, candidates }
}

const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Cria UMA tarefa para um cliente. Para várias tarefas, chame várias vezes.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Ação curta e clara, começando com verbo no infinitivo' },
          client: { type: 'string', description: 'Nome do cliente' },
        },
        required: ['title', 'client'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'Conta e lista tarefas (pendências de reuniões + manuais), com filtros opcionais. Use SEMPRE para perguntas de quantidade ou "quais tarefas".',
      parameters: {
        type: 'object',
        properties: {
          client: { type: 'string', description: 'Filtra por cliente' },
          person: {
            type: 'string',
            description: 'Filtra pelos clientes em que esta pessoa é responsável (gestor, social, tráfego ou designer)',
          },
          role: {
            type: 'string',
            enum: Object.keys(ROLE_KEYS),
            description: 'Só com person: considera apenas esta função da pessoa no cliente',
          },
          status: {
            type: 'string',
            enum: Object.keys(STATUS_MAP),
            description: 'Padrão: abertas',
          },
        },
      },
    },
  },
]

function systemPrompt(clients: ClientRow[], people: string[]) {
  return `Você é o assistente operacional do Ivan Felipe (marketing de performance). Você cria tarefas para clientes e responde perguntas sobre tarefas por cliente ou pessoa. Responda sempre em português, curto e direto.

Regras:
- Criar tarefa: use create_task, uma chamada por tarefa. Título começa com verbo no infinitivo (ex: "Subir campanha de remarketing"). Só existem título e cliente: não há prioridade, prazo nem responsável por tarefa. Se o pedido trouxer prazo ou responsável, deixe-os no título (ex: "Revisar criativos até sexta").
- Qualquer pergunta de quantidade ou lista de tarefas: SEMPRE use list_tasks e responda com o número que ele retornar. Nunca estime.
- Tarefas não têm responsável próprio. Ao perguntarem sobre uma pessoa, use o filtro person e deixe claro na resposta que são as tarefas dos clientes em que a pessoa atua.
- Se faltar o cliente ao criar tarefa, pergunte em vez de inventar.
- Se a ferramenta devolver erro ou ambiguidade, explique e pergunte; não tente adivinhar.
- Depois de criar, confirme em uma linha (cliente e título).
- Se não for sobre tarefas ou clientes, diga que só ajuda com isso.

Clientes: ${clients.filter(c => c.status === 'active').map(c => c.name).join(', ') || '(nenhum)'}
Pessoas (responsáveis pelos clientes): ${people.join(', ') || '(ninguém cadastrado)'}`
}

export async function runAssistant(message: string, history: HistoryMsg[]): Promise<AssistantResult> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, status, account_manager, social_media, traffic_manager, designer')
    .order('name')
  if (error) throw new Error(error.message)

  const clients: ClientRow[] = data || []
  const clientNames = clients.map(c => c.name)
  const people = Array.from(
    new Set(clients.flatMap(c => OWNER_FIELDS.map(f => c[f.key]?.trim() || '')).filter(Boolean))
  ).sort()
  const created: CreatedTask[] = []

  const resolveClient = (query: string) => {
    const r = findByName(clientNames, query)
    if (r.match) return { client: clients.find(c => c.name === r.match)! }
    return {
      error: r.candidates.length > 1
        ? { error: 'Cliente ambíguo.', opcoes: r.candidates }
        : { error: `Cliente "${query}" não encontrado.`, clientes: clientNames },
    }
  }

  async function createTask(a: any) {
    const title = String(a.title || '').trim()
    if (!title) return { error: 'Título vazio.' }

    const c = resolveClient(String(a.client || ''))
    if (!c.client) return c.error

    const { data: row, error: err } = await supabase
      .from('manual_tasks')
      .insert({ title, client_id: c.client.id })
      .select('id, title')
      .single()
    if (err || !row) return { error: `Falha ao salvar: ${err?.message}` }

    created.push({ id: row.id, title: row.title, client_name: c.client.name })
    return { ok: true, tarefa: { titulo: row.title, cliente: c.client.name } }
  }

  async function listTasksTool(a: any) {
    const status = STATUS_MAP[a.status] ? a.status : 'abertas'

    let clientFilter: ClientRow | undefined
    if (a.client) {
      const c = resolveClient(String(a.client))
      if (!c.client) return c.error
      clientFilter = c.client
    }

    let personFilter: string | undefined
    if (a.person) {
      const p = findByName(people, String(a.person))
      if (!p.match) {
        return p.candidates.length > 1
          ? { error: 'Pessoa ambígua.', opcoes: p.candidates }
          : { error: `Pessoa "${a.person}" não encontrada.`, pessoas: people }
      }
      personFilter = p.match
    }
    const roleKey = a.role ? ROLE_KEYS[a.role] : undefined

    let tasks = await listTasks(STATUS_MAP[status], clientFilter?.id)
    if (personFilter) {
      const who = norm(personFilter)
      const keys = roleKey ? [roleKey] : OWNER_FIELDS.map(f => f.key)
      tasks = tasks.filter(t => t.client && keys.some(k => norm(t.client![k] || '') === who))
    }

    const porCliente: Record<string, number> = {}
    for (const t of tasks) {
      const n = t.client?.name ?? 'sem cliente'
      porCliente[n] = (porCliente[n] || 0) + 1
    }

    return {
      filtros: {
        cliente: clientFilter?.name ?? 'todos',
        pessoa: personFilter ? `${personFilter} (responsável pelos clientes${a.role ? `, como ${a.role}` : ''})` : 'todas',
        status,
      },
      total: tasks.length,
      por_cliente: porCliente,
      tarefas: tasks.slice(0, MAX_LISTED).map(t => ({
        titulo: t.title,
        cliente: t.client?.name ?? 'sem cliente',
        origem: t.source === 'meeting' ? 'reunião' : 'manual',
        data: t.date,
        feita: t.done,
      })),
      truncado: tasks.length > MAX_LISTED,
    }
  }

  const messages: Msg[] = [
    { role: 'system', content: systemPrompt(clients, people) },
    ...history.slice(-10).map<Msg>(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text,
    })),
    { role: 'user', content: message },
  ]

  for (let step = 0; step < MAX_STEPS; step++) {
    const completion = await chat({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 1500,
      // gpt-oss é modelo de raciocínio: "low" mantém o orçamento de tokens (TPM baixo) sob controle
      reasoning_effort: 'low',
    })
    const msg = completion.choices[0]?.message
    if (!msg) break

    if (!msg.tool_calls?.length) {
      return { reply: msg.content?.trim() || 'Sem resposta.', created }
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })
    for (const call of msg.tool_calls) {
      let result: unknown
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        if (call.function.name === 'create_task') result = await createTask(args)
        else if (call.function.name === 'list_tasks') result = await listTasksTool(args)
        else result = { error: `Ferramenta desconhecida: ${call.function.name}` }
      } catch (e: any) {
        result = { error: e.message }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  return {
    reply: created.length
      ? `${created.length} tarefa(s) criada(s), mas não consegui finalizar a resposta.`
      : 'Não consegui concluir. Tente reformular.',
    created,
  }
}
