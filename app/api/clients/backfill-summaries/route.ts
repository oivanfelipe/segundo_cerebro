import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { refreshClientAccumulatedSummary } from '@/lib/compiled'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Correção pontual: refreshClientAccumulatedSummary só é disparado para clientes
// afetados numa rodada de sync (ou numa reatribuição manual). Insights criados antes
// dessa lógica existir nunca tiveram o resumo acumulado gerado, pois suas pastas já
// ficaram marcadas como 'processed' e não voltam a passar pelo sync. Este endpoint
// roda o refresh uma vez para todo cliente que já tem insight, sem depender do sync.
export async function POST() {
  const { data: rows, error } = await supabase
    .from('client_meeting_insights')
    .select('client_id')
    .not('client_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const clientIds = Array.from(new Set((rows || []).map((r) => r.client_id as string)))

  let refreshed = 0
  const errors: { clientId: string; message: string }[] = []

  for (const clientId of clientIds) {
    try {
      await refreshClientAccumulatedSummary(clientId)
      refreshed++
    } catch (err) {
      errors.push({ clientId, message: err instanceof Error ? err.message : 'Erro desconhecido' })
    }
  }

  return NextResponse.json({ totalClients: clientIds.length, refreshed, errors })
}
