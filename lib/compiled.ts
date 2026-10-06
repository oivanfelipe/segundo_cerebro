import { supabase, type OpenItem } from '@/lib/supabase'
import { regenerateAccumulatedSummary, type ClientHistoryEntry } from '@/lib/groq'

// Recalcula o resumo geral acumulado de um cliente a partir de todo o seu histórico de
// insights. Chamado sempre que um insight é criado (sync) ou reatribuído (correção manual).
export async function refreshClientAccumulatedSummary(clientId: string): Promise<void> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single()

  if (clientError || !client) {
    console.error(`[compiled] cliente ${clientId} não encontrado:`, clientError?.message)
    return
  }

  const { data: insights, error: insightsError } = await supabase
    .from('client_meeting_insights')
    .select('context_summary, key_decisions, open_items, meeting_summaries(meeting_date)')
    .eq('client_id', clientId)

  if (insightsError) {
    console.error(`[compiled] falha ao buscar insights de ${client.name}:`, insightsError.message)
    return
  }

  const history: ClientHistoryEntry[] = (insights || []).map((i) => ({
    meeting_date:
      (i as unknown as { meeting_summaries: { meeting_date: string | null } | null })
        .meeting_summaries?.meeting_date ?? null,
    context_summary: i.context_summary,
    key_decisions: i.key_decisions || [],
    // só pendências ainda em aberto entram no resumo acumulado — uma tarefa marcada
    // como feita não é mais algo que o usuário precise lembrar antes da próxima reunião.
    open_items: ((i.open_items || []) as OpenItem[]).filter((o) => !o.done).map((o) => o.text),
  }))

  const summary = await regenerateAccumulatedSummary(client.name, history)

  const { error: updateError } = await supabase
    .from('clients')
    .update({
      accumulated_summary: summary || null,
      accumulated_summary_updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)

  if (updateError) {
    console.error(`[compiled] falha ao salvar resumo acumulado de ${client.name}:`, updateError.message)
  }
}
