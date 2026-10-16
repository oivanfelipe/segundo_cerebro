import { NextRequest, NextResponse } from 'next/server'
import { supabase, type OpenItem } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Compilado do cliente: linha do tempo de reuniões + decisões/pendências consolidadas +
// resumo geral acumulado (já mantido em clients.accumulated_summary pelo sync/reatribuição).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single()

  if (clientError || !client) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  const { data: insights, error: insightsError } = await supabase
    .from('client_meeting_insights')
    .select('*, meeting_summaries(id, doc_name, meeting_date)')
    .eq('client_id', params.id)

  if (insightsError) {
    return NextResponse.json({ error: insightsError.message }, { status: 500 })
  }

  const timeline = (insights || [])
    .map((i) => ({
      insight_id: i.id,
      meeting_id: i.meeting_summaries?.id ?? null,
      meeting_name: i.meeting_summaries?.doc_name ?? null,
      meeting_date: i.meeting_summaries?.meeting_date ?? null,
      context_summary: i.context_summary,
      key_decisions: i.key_decisions,
      open_items: i.open_items,
      assigned_by: i.assigned_by,
    }))
    .sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''))

  const openItems = timeline
    .flatMap((t) =>
      (t.open_items as OpenItem[]).map((item, index) => ({
        insight_id: t.insight_id,
        index,
        item: item.text,
        done: item.done,
        done_at: item.done_at,
        meeting_date: t.meeting_date,
      }))
    )
    // pendências em aberto primeiro — as concluídas ficam no fim, fora do caminho.
    .sort((a, b) => Number(a.done) - Number(b.done))
  const decisions = timeline.flatMap((t) =>
    t.key_decisions.map((item: string) => ({ item, meeting_date: t.meeting_date }))
  )

  return NextResponse.json({
    client,
    timeline,
    decisions,
    open_items: openItems,
  })
}
