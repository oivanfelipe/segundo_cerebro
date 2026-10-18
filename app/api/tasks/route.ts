import { NextRequest, NextResponse } from 'next/server'
import { supabase, type OpenItem } from '@/lib/supabase'
import type { Task } from '@/lib/tasks'

export const dynamic = 'force-dynamic'

const CLIENT_COLS = 'id, name, account_manager, social_media, traffic_manager, designer'

// Lista unificada de tarefas: pendências das reuniões + tarefas manuais.
// ?status=open (padrão) | done | all  ·  ?client_id=<uuid>
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'open'
  const clientId = req.nextUrl.searchParams.get('client_id')

  let insightsQuery = supabase
    .from('client_meeting_insights')
    .select(`id, client_id, open_items, clients ( ${CLIENT_COLS} ), meeting_summaries ( id, doc_name, meeting_date )`)
  let manualQuery = supabase.from('manual_tasks').select(`*, clients ( ${CLIENT_COLS} )`)
  if (clientId) {
    insightsQuery = insightsQuery.eq('client_id', clientId)
    manualQuery = manualQuery.eq('client_id', clientId)
  }

  const [insightsRes, manualRes] = await Promise.all([insightsQuery, manualQuery])
  if (insightsRes.error) return NextResponse.json({ error: insightsRes.error.message }, { status: 500 })
  if (manualRes.error) return NextResponse.json({ error: manualRes.error.message }, { status: 500 })

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

  return NextResponse.json(filtered)
}

// Cria tarefa manual.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Descreva a tarefa.' }, { status: 400 })

  const insert: Record<string, unknown> = { title, client_id: body.client_id || null }
  if (typeof body.task_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.task_date)) {
    insert.task_date = body.task_date
  }

  const { data, error } = await supabase.from('manual_tasks').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
