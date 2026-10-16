import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Lista de Reuniões — todas as reuniões já processadas pelo sync (ver AppFlow),
// incluindo as que falharam ou não tinham transcrição, com os clientes identificados.
export async function GET() {
  const { data, error } = await supabase
    .from('processed_docs')
    .select(
      `id, folder_id, folder_name, status, error_message, processed_at,
       meeting_summaries (
         id, doc_name, meeting_date, overall_summary,
         client_meeting_insights ( id, client_id, clients ( name ) )
       )`
    )
    .order('processed_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const meetings = (data || []).map((doc) => {
    const summary = Array.isArray(doc.meeting_summaries)
      ? doc.meeting_summaries[0]
      : doc.meeting_summaries

    const insights = summary?.client_meeting_insights || []
    const clientNames = insights
      .map((i: { clients: { name: string } | null }) => i.clients?.name)
      .filter(Boolean)

    return {
      processed_doc_id: doc.id,
      meeting_id: summary?.id ?? null,
      folder_name: doc.folder_name,
      status: doc.status,
      error_message: doc.error_message,
      processed_at: doc.processed_at,
      meeting_date: summary?.meeting_date ?? null,
      client_names: clientNames,
      has_unassigned: insights.some((i: { client_id: string | null }) => !i.client_id),
    }
  })

  return NextResponse.json(meetings)
}
