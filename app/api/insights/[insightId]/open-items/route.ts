import { NextRequest, NextResponse } from 'next/server'
import { supabase, type OpenItem } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Marca/desmarca uma pendência (open_item) como feita, registrando a data da conclusão.
// Exclui uma pendência da reunião (remove o item da lista; os demais itens são reindexados).
export async function DELETE(req: NextRequest, { params }: { params: { insightId: string } }) {
  const body = await req.json().catch(() => ({}))
  const index = Number(body.index)

  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'Índice da pendência inválido.' }, { status: 400 })
  }

  const { data: insight, error: insightError } = await supabase
    .from('client_meeting_insights')
    .select('open_items')
    .eq('id', params.insightId)
    .single()

  if (insightError || !insight) {
    return NextResponse.json({ error: 'Reunião/cliente não encontrado.' }, { status: 404 })
  }

  const items = (insight.open_items || []) as OpenItem[]
  if (!items[index]) {
    return NextResponse.json({ error: 'Pendência não encontrada.' }, { status: 404 })
  }

  const remaining = items.filter((_, i) => i !== index)
  const { error: updateError } = await supabase
    .from('client_meeting_insights')
    .update({ open_items: remaining })
    .eq('id', params.insightId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { insightId: string } }) {
  const body = await req.json()
  const index = Number(body.index)

  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'Índice da pendência inválido.' }, { status: 400 })
  }

  const { data: insight, error: insightError } = await supabase
    .from('client_meeting_insights')
    .select('open_items')
    .eq('id', params.insightId)
    .single()

  if (insightError || !insight) {
    return NextResponse.json({ error: 'Reunião/cliente não encontrado.' }, { status: 404 })
  }

  const items = (insight.open_items || []) as OpenItem[]
  if (!items[index]) {
    return NextResponse.json({ error: 'Pendência não encontrada.' }, { status: 404 })
  }

  const next = { ...items[index] }
  if (typeof body.done === 'boolean') {
    next.done = body.done
    next.done_at = body.done ? new Date().toISOString() : null
  }
  if (typeof body.text === 'string' && body.text.trim()) next.text = body.text.trim()
  if ('assignee_id' in body) {
    next.assignee_id = body.assignee_id || null
    next.assignee_name = body.assignee_id ? body.assignee_name || null : null
  }
  items[index] = next

  const { error: updateError } = await supabase
    .from('client_meeting_insights')
    .update({ open_items: items })
    .eq('id', params.insightId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: items[index] })
}
