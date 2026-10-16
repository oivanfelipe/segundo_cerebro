import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Detalhe da Reunião — resumo geral + cada cliente identificado com seu trecho relevante,
// disponível para reatribuição manual (ver AppFlow).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('meeting_summaries')
    .select(
      `id, doc_name, meeting_date, overall_summary, participants, created_at,
       client_meeting_insights ( id, client_id, context_summary, key_decisions, open_items, assigned_by, clients ( id, name ) )`
    )
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Reunião não encontrada.' }, { status: 404 })
  }

  return NextResponse.json(data)
}
