import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { refreshClientAccumulatedSummary } from '@/lib/compiled'

export const dynamic = 'force-dynamic'

// Reatribuição manual de cliente numa reunião (ver AppFlow: "Reunião com cliente
// identificado errado"). Atualiza o vínculo e regenera o compilado do cliente antigo
// (se houver) e do novo.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; insightId: string } }
) {
  const body = await req.json()
  const newClientId: string | null = body.client_id || null

  const { data: current, error: currentError } = await supabase
    .from('client_meeting_insights')
    .select('id, client_id, meeting_summary_id')
    .eq('id', params.insightId)
    .single()

  if (currentError || !current || current.meeting_summary_id !== params.id) {
    return NextResponse.json({ error: 'Vínculo não encontrado para esta reunião.' }, { status: 404 })
  }

  const previousClientId = current.client_id

  const { data: updated, error: updateError } = await supabase
    .from('client_meeting_insights')
    .update({ client_id: newClientId, assigned_by: 'manual' })
    .eq('id', params.insightId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (previousClientId) await refreshClientAccumulatedSummary(previousClientId)
  if (newClientId) await refreshClientAccumulatedSummary(newClientId)

  return NextResponse.json(updated)
}
