import { supabase, type OpenItem } from '@/lib/supabase'
import type { Owners } from '@/lib/owners'

export type TaskClient = ({ id: string; name: string } & Owners) | null

// Tarefa unificada: pendência extraída de reunião (vive dentro do insight) ou tarefa manual.
export type Task = {
  key: string
  source: 'meeting' | 'manual'
  title: string
  done: boolean
  done_at: string | null
  date: string | null // data da reunião (YYYY-MM-DD) ou data da tarefa manual
  client: TaskClient
  // só reunião
  insight_id?: string
  index?: number
  meeting_id?: string | null
  meeting_name?: string | null
  // só manual
  id?: string
}

export type TaskStatus = 'open' | 'done' | 'all'

const CLIENT_COLS = 'id, name, account_manager, social_media, traffic_manager, designer'

// Lista unificada de tarefas: pendências das reuniões + tarefas manuais.
export async function listTasks(
  status: TaskStatus = 'open',
  clientId?: string | null
): Promise<Task[]> {
  let insightsQuery = supabase
    .from('client_meeting_insights')
    .select(`id, client_id, open_items, clients ( ${CLIENT_COLS} ), meeting_summaries ( id, doc_name, meeting_date )`)
  let manualQuery = supabase.from('manual_tasks').select(`*, clients ( ${CLIENT_COLS} )`)
  if (clientId) {
    insightsQuery = insightsQuery.eq('client_id', clientId)
    manualQuery = manualQuery.eq('client_id', clientId)
  }

  const [insightsRes, manualRes] = await Promise.all([insightsQuery, manualQuery])
  if (insightsRes.error) throw new Error(insightsRes.error.message)
  if (manualRes.error) throw new Error(manualRes.error.message)

  const tasks: Task[] = []

  for (const insight of insightsRes.data || []) {
    const meeting = Array.isArray(insight.meeting_summaries) ? insight.meeting_summaries[0] : insight.meeting_summaries
    const client = Array.isArray(insight.clients) ? insight.clients[0] : insight.clients
    ;((insight.open_items || []) as OpenItem[]).forEach((item, index) => {
      tasks.push({
        key: `m:${insight.id}:${index}`,
        source: 'meeting',
        title: item.text,
        done: Boolean(item.done),
        done_at: item.done_at ?? null,
        date: meeting?.meeting_date ?? null,
        client: client ?? null,
        insight_id: insight.id,
        index,
        meeting_id: meeting?.id ?? null,
        meeting_name: meeting?.doc_name ?? null,
      })
    })
  }

  for (const t of manualRes.data || []) {
    const client = Array.isArray(t.clients) ? t.clients[0] : t.clients
    tasks.push({
      key: `t:${t.id}`,
      source: 'manual',
      title: t.title,
      done: t.done,
      done_at: t.done_at,
      date: t.task_date,
      client: client ?? null,
      id: t.id,
    })
  }

  const filtered = tasks.filter((t) => (status === 'all' ? true : status === 'done' ? t.done : !t.done))

  // Em aberto: mais recentes primeiro. Concluídas: as concluídas mais recentemente primeiro.
  filtered.sort((a, b) =>
    status === 'done'
      ? (b.done_at || '').localeCompare(a.done_at || '')
      : (b.date || '').localeCompare(a.date || '')
  )

  return filtered
}
