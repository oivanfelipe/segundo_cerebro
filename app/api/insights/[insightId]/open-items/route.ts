import { NextRequest, NextResponse } from 'next/server'
import { supabase, type OpenItem } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Marca/desmarca uma pendência (open_item) como feita, registrando a data da conclusão.
export async function PATCH(req: NextRequest, { params }: { params: { insightId: string } }) {
  const body = await req.json()
  const index = Number(body.index)
  const done = Boolean(body.done)

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

  items[index] = { ...items[index], done, done_at: done ? new Date().toISOString() : null }

  const { error: updateError } = await supabase
    .from('client_meeting_insights')
    .update({ open_items: items })
    .eq('id', params.insightId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: items[index] })
}
