import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  listMeetingFolders,
  listRecurringFolders,
  listRecurringDocs,
  isRecurringFolder,
  meetingNameFromDoc,
  findTranscriptionDoc,
  readDocContent,
} from '@/lib/google'
import { analyzeMeeting } from '@/lib/groq'
import { refreshClientAccumulatedSummary } from '@/lib/compiled'
import { parseMeetingDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// O sync olha só a última semana de reuniões (janela móvel de 7 dias).
const SYNC_WINDOW_DAYS = 7

// Pastas "(recurring)" só começaram a ser lidas em 03/11/2026: reuniões anteriores a essa data
// não entram retroativamente. A trava expira sozinha — passados 7 dias, a janela móvel acima já é
// mais recente que ela.
const RECURRING_DOCS_FROM = '2026-11-03T00:00:00-03:00'

// Uma reunião a processar. Pasta comum: a chave é o id da pasta e o doc é descoberto lá dentro.
// Pasta recorrente: a chave é `pasta:doc`, porque a mesma pasta acumula uma reunião por ocorrência.
type MeetingUnit = { key: string; name: string; doc?: { id: string; name: string } }

// Cada reunião envolve uma leitura no Drive + uma chamada à Groq — processar um lote
// grande numa chamada só estoura o limite de tempo da função serverless. Processa em
// lotes pequenos; o cliente (botão "Sincronizar agora") repete a chamada até zerar.
const BATCH_SIZE = 15

// Com o limite de tokens/minuto da Groq cada reunião pode esperar a janela liberar; para não
// estourar o maxDuration da função, para de abrir novas reuniões após esse orçamento de
// tempo — o que sobrar fica pendente e o botão "Sincronizar agora" repete a chamada.
const TIME_BUDGET_MS = 200_000

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
  const { data: processed } = await supabase.from('processed_docs').select('folder_id, status, processed_at')
  const doneIds = new Set((processed || []).filter((r) => r.status !== 'error').map((r) => r.folder_id))
  const erroredIds = new Set((processed || []).filter((r) => r.status === 'error').map((r) => r.folder_id))
  const processedAt = new Map(
    (processed || []).filter((r) => r.status !== 'error').map((r) => [r.folder_id, new Date(r.processed_at).getTime()])
  )

  const sinceMs = Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const since = new Date(sinceMs).toISOString()
  const folders = await listMeetingFolders(folderId, since)
  const pendingUnits: MeetingUnit[] = folders
    .filter((f) => f.id && !isRecurringFolder(f.name) && !doneIds.has(f.id))
    .map((f) => ({ key: f.id, name: f.name }))

  // Reuniões recorrentes: a pasta é antiga, então o que vale é a data de cada doc dentro dela.
  const recurringSince = new Date(Math.max(sinceMs, Date.parse(RECURRING_DOCS_FROM))).toISOString()
  const discoveryErrors: { folder: string; message: string }[] = []
  const recurringFolders = await listRecurringFolders(folderId)
  await Promise.all(
    recurringFolders.map(async (rf) => {
      try {
        for (const doc of await listRecurringDocs(rf.id, recurringSince)) {
          const key = `${rf.id}:${doc.id}`
          if (doneIds.has(key)) continue
          // Antes desta correção a pasta inteira era processada de uma vez (chave = id da pasta).
          // Se isso aconteceu depois de o doc existir, a reunião já está no banco: não duplicar.
          const legacy = processedAt.get(rf.id)
          if (legacy !== undefined && legacy >= Date.parse(doc.createdTime)) continue
          pendingUnits.push({ key, name: meetingNameFromDoc(doc.name), doc: { id: doc.id, name: doc.name } })
        }
      } catch (err) {
        discoveryErrors.push({ folder: rf.name, message: err instanceof Error ? err.message : 'Erro desconhecido' })
      }
    })
  )

  if (pendingUnits.length === 0) {
    return NextResponse.json({
      synced: 0,
      remaining: 0,
      errors: discoveryErrors,
      message: 'Nenhuma reunião nova nos últimos 7 dias.',
    })
  }

  // Prioriza reuniões nunca tentadas — se uma falha persistente (ex: permissão) sempre
  // caísse no topo do lote, travaria o progresso nas demais pendentes pra sempre.
  const neverAttempted = pendingUnits.filter((u) => !erroredIds.has(u.key))
  const previouslyErrored = pendingUnits.filter((u) => erroredIds.has(u.key))
  const ordered = [...neverAttempted, ...previouslyErrored]

  const newFolders = ordered.slice(0, BATCH_SIZE)
  const startedAt = Date.now()
  let attempted = 0

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('status', 'active')

  const clientList = (clients || []) as { id: string; name: string }[]
  const clientNames = clientList.map((c) => c.name)

  let synced = 0
  const errors: { folder: string; message: string }[] = [...discoveryErrors]
  const affectedClientIds = new Set<string>()

  for (const unit of newFolders) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
    attempted++
    const folderId = unit.key
    const folderName = unit.name || 'Reunião sem nome'

    try {
      // Outra execução do sync (segundo clique, outra aba) pode ter concluído esta reunião depois
      // de ela ser listada aqui. Reler o estado evita analisar de novo — e duplicar — o que já foi feito.
      const { data: current } = await supabase
        .from('processed_docs')
        .select('status')
        .eq('folder_id', folderId)
        .maybeSingle()
      if (current && current.status !== 'error') continue

      const lookup = unit.doc ? ({ ok: true, doc: unit.doc } as const) : await findTranscriptionDoc(folderId)

      // Sem doc legível NÃO é "no_transcript" definitivo: pode ser falta de acesso ao destino
      // do atalho ou doc ainda sendo gerado. Vira 'error' (reelegível no próximo sync).
      if (!lookup.ok) throw new Error(lookup.reason)
      const doc = lookup.doc

      const content = await readDocContent(doc.id).catch((err) => {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        throw new Error(`[docId=${doc.id}] ${message}`)
      })
      if (!content || content.length < 100) {
        throw new Error(`documento "${doc.name}" vazio ou curto demais (${content?.length ?? 0} caracteres)`)
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

      // Última barreira: a análise leva dezenas de segundos e outra execução pode ter gravado o
      // resumo desta reunião nesse intervalo.
      const { data: existingSummary } = await supabase
        .from('meeting_summaries')
        .select('id')
        .eq('processed_doc_id', processedDoc.id)
        .limit(1)
      if (existingSummary && existingSummary.length > 0) continue

      const { data: meetingSummary, error: meetingSummaryError } = await supabase
        .from('meeting_summaries')
        .insert({
          processed_doc_id: processedDoc.id,
          doc_name: folderName,
          // a data do nome do Doc/pasta é confiável; a da IA só entra se não houver data no nome
          meeting_date: parseMeetingDate(doc.name, folderName) ?? analysis.meeting_date,
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
          open_items: clientData.open_items.map((text) => ({ text, done: false, done_at: null })),
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
    skipped: attempted - synced - errors.length,
    remaining: ordered.length - attempted,
    errors,
  })
}
