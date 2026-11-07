import { NextRequest, NextResponse } from 'next/server'
import { supabase, type OpenItem } from '@/lib/supabase'
import { createVerificationTask } from '@/lib/ekyte'

export const dynamic = 'force-dynamic'

// Envia uma tarefa ao Ekyte como tarefa do tipo "Verificação", no workspace do cliente.
// Body: { source: 'manual', id } | { source: 'meeting', insight_id, index }  (+ due_date opcional YYYY-MM-DD)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dueDate =
    typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)
      ? body.due_date
      : new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)

  let title = ''
  let clientId: string | null = null
  let assigneeId: string | null = null
  let alreadySent: number | null = null
  let items: OpenItem[] = []

  if (body.source === 'manual') {
    const { data, error } = await supabase.from('manual_tasks').select('*').eq('id', body.id).single()
    if (error || !data) return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 })
    title = data.title
    clientId = data.client_id
    assigneeId = data.assignee_id
    alreadySent = data.ekyte_task_id
  } else if (body.source === 'meeting') {
    const { data, error } = await supabase
      .from('client_meeting_insights')
      .select('client_id, open_items')
      .eq('id', body.insight_id)
      .single()
    const index = Number(body.index)
    items = (data?.open_items || []) as OpenItem[]
    if (error || !data || !items[index]) return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 })
    title = items[index].text
    clientId = data.client_id
    assigneeId = items[index].assignee_id ?? null
    alreadySent = items[index].ekyte_task_id ?? null
  } else {
    return NextResponse.json({ error: 'Origem da tarefa inválida.' }, { status: 400 })
  }

  if (alreadySent) return NextResponse.json({ error: `Esta tarefa já foi enviada ao Ekyte (#${alreadySent}).` }, { status: 409 })
  if (!clientId) return NextResponse.json({ error: 'A tarefa não tem cliente — sem cliente não há workspace.' }, { status: 400 })
  if (!assigneeId) return NextResponse.json({ error: 'Escolha o responsável antes de enviar.' }, { status: 400 })

  const { data: client } = await supabase.from('clients').select('name, ekyte_workspace_id').eq('id', clientId).single()
  if (!client?.ekyte_workspace_id) {
    return NextResponse.json(
      { error: `O cliente "${client?.name ?? ''}" não tem workspace do Ekyte vinculado. Vincule em Editar cliente.` },
      { status: 400 }
    )
  }

  let ekyteId: number
  let warning: string | undefined
  try {
    const created = await createVerificationTask({
      title,
      description: `${title}\n\nOrigem: Segundo Cérebro — cliente ${client.name}.`,
      workspaceId: String(client.ekyte_workspace_id),
      executorId: assigneeId,
      dueDate,
    })
    ekyteId = created.id
    warning = created.warning
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao enviar ao Ekyte.' }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  if (body.source === 'manual') {
    await supabase.from('manual_tasks').update({ ekyte_task_id: ekyteId, ekyte_sent_at: sentAt }).eq('id', body.id)
  } else {
    const index = Number(body.index)
    items[index] = { ...items[index], ekyte_task_id: ekyteId, ekyte_sent_at: sentAt }
    await supabase.from('client_meeting_insights').update({ open_items: items }).eq('id', body.insight_id)
  }

  return NextResponse.json({ ok: true, ekyte_task_id: ekyteId, warning })
}
