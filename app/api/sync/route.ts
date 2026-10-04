import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listMeetingFolders, findTranscriptionDoc, readDocContent } from '@/lib/google'
import { analyzeMeeting } from '@/lib/groq'
import { refreshClientAccumulatedSummary } from '@/lib/compiled'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Cada reunião envolve uma leitura no Drive + uma chamada à Groq — processar um lote
// grande numa chamada só estoura o limite de tempo da função serverless. Processa em
// lotes pequenos; o cliente (botão "Sincronizar agora") repete a chamada até zerar.
const BATCH_SIZE = 15

function matchClient(
  clientList: { id: string; name: string }[],
  name: string
): string | null {
  const found = clientList.find(
    (c) =>
      c.name.toLowerCase() === name.toLowerCase() ||
      c.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(c.name.toLowerCase())
  )
  return found?.id ?? null
}

// Sync manual (disparado pelo botão "Sincronizar agora" — sem cron na v1, ver TRD).
export async function POST() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'GOOGLE_DRIVE_FOLDER_ID não configurado.' }, { status: 500 })
  }

  // Pastas com status 'error' não contam como concluídas — ficam elegíveis para nova
  // tentativa automática no próximo sync (ex: falha temporária de API, chave inválida).
  const { data: processed } = await supabase.from('processed_docs').select('folder_id, status')
  const doneIds = new Set((processed || []).filter((r) => r.status !== 'error').map((r) => r.folder_id))
  const erroredIds = new Set((processed || []).filter((r) => r.status === 'error').map((r) => r.folder_id))

  const folders = await listMeetingFolders(folderId)
  const pendingFolders = folders.filter((f) => f.id && !doneIds.has(f.id))

  if (pendingFolders.length === 0) {
    return NextResponse.json({ synced: 0, remaining: 0, message: 'Nenhuma reunião nova encontrada.' })
  }

  // Prioriza pastas nunca tentadas — se uma falha persistente (ex: permissão) sempre
  // caísse no topo do lote, travaria o progresso nas demais pendentes pra sempre.
  const neverAttempted = pendingFolders.filter((f) => !erroredIds.has(f.id!))
  const previouslyErrored = pendingFolders.filter((f) => erroredIds.has(f.id!))
  const ordered = [...neverAttempted, ...previouslyErrored]

  const newFolders = ordered.slice(0, BATCH_SIZE)
  const remaining = ordered.length - newFolders.length

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('status', 'active')

  const clientList = (clients || []) as { id: string; name: string }[]
  const clientNames = clientList.map((c) => c.name)

  let synced = 0
  const errors: { folder: string; message: string }[] = []
  const affectedClientIds = new Set<string>()

  for (const folder of newFolders) {
    const folderId = folder.id!
    const folderName = folder.name || 'Reunião sem nome'

    try {
      const doc = await findTranscriptionDoc(folderId)

      if (!doc) {
        await supabase
          .from('processed_docs')
          .upsert(
            { folder_id: folderId, folder_name: folderName, status: 'no_transcript', error_message: null },
            { onConflict: 'folder_id' }
          )
        continue
      }

      const content = await readDocContent(doc.id).catch((err) => {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        throw new Error(`[docId=${doc.id}] ${message}`)
      })
      if (!content || content.length < 100) {
        await supabase
          .from('processed_docs')
          .upsert(
            { folder_id: folderId, folder_name: folderName, status: 'no_transcript', error_message: null },
            { onConflict: 'folder_id' }
          )
        continue
      }

      const analysis = await analyzeMeeting(content, clientNames)

      const { data: processedDoc, error: processedDocError } = await supabase
        .from('processed_docs')
        .upsert(
          { folder_id: folderId, folder_name: folderName, status: 'processed', error_message: null },
          { onConflict: 'folder_id' }
        )
        .select('id')
        .single()

      if (processedDocError || !processedDoc) throw new Error(processedDocError?.message)

      const { data: meetingSummary, error: meetingSummaryError } = await supabase
        .from('meeting_summaries')
        .insert({
          processed_doc_id: processedDoc.id,
          doc_name: folderName,
          meeting_date: analysis.meeting_date,
          overall_summary: analysis.overall_summary,
          participants: analysis.participants,
        })
        .select('id')
        .single()

      if (meetingSummaryError || !meetingSummary) throw new Error(meetingSummaryError?.message)

      for (const clientData of analysis.clients) {
        const clientId = matchClient(clientList, clientData.name)

        await supabase.from('client_meeting_insights').insert({
          meeting_summary_id: meetingSummary.id,
          client_id: clientId,
          context_summary: clientData.context_summary,
          key_decisions: clientData.key_decisions,
          open_items: clientData.open_items,
          assigned_by: 'ai',
        })

        if (clientId) affectedClientIds.add(clientId)
      }

      synced++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      errors.push({ folder: folderName, message })
      await supabase
        .from('processed_docs')
        .upsert(
          { folder_id: folderId, folder_name: folderName, status: 'error', error_message: message },
          { onConflict: 'folder_id' }
        )
    }
  }

  for (const clientId of Array.from(affectedClientIds)) {
    await refreshClientAccumulatedSummary(clientId)
  }

  return NextResponse.json({
    synced,
    skipped: newFolders.length - synced - errors.length,
    remaining,
    errors,
  })
}
