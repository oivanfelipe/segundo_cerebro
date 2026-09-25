import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listTranscriptionDocs, readTranscriptionContent } from '@/lib/google'
import { analyzeMeeting } from '@/lib/groq'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Caps how many transcriptions are analyzed per invocation so a large backlog
// can't blow past the serverless function timeout or Groq rate limits —
// running the sync again picks up where it left off.
const BATCH_LIMIT = 15

export async function POST() {
  try {
    const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID!
    console.log(`[sync] iniciando. GOOGLE_SHARED_DRIVE_ID=${sharedDriveId}`)

    // Get already-processed doc IDs
    const { data: processed } = await supabase
      .from('processed_docs')
      .select('doc_id')

    const processedIds = new Set((processed || []).map((r: any) => r.doc_id))

    // On first sync (no processed docs yet), restrict to last week only
    const isFirstSync = processedIds.size === 0
    const docs = isFirstSync
      ? await listTranscriptionDocs(sharedDriveId, '2026-09-14T00:00:00Z')
      : await listTranscriptionDocs(sharedDriveId)

    const newDocs = docs
      .filter((d) => !processedIds.has(d.id))
      .slice(0, BATCH_LIMIT)
    console.log(`[sync] total transcrições=${docs.length} processedIds=${processedIds.size} novas=${newDocs.length}`)

    if (newDocs.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Nenhuma transcrição nova encontrada.' })
    }

    // Get known clients from Supabase
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('status', 'active')

    const clientList = (clients || []) as { id: string; name: string }[]
    const clientNames = clientList.map((c) => c.name)

    let totalSynced = 0
    let totalTasks = 0
    const errors: string[] = []

    for (const doc of newDocs) {
      try {
        const content = await readTranscriptionContent(doc)
        if (!content || content.length < 100) {
          await supabase.from('processed_docs').insert({
            doc_id: doc.id,
            doc_name: doc.name,
            tasks_extracted: 0,
          })
          continue
        }

        const analysis = await analyzeMeeting(content, clientNames as string[])

        // Save call_summary
        const { data: callSummary } = await supabase
          .from('call_summaries')
          .insert({
            doc_id: doc.id,
            doc_name: doc.name,
            summary: analysis.overall_summary,
            participants: analysis.participants,
            key_points: analysis.clients.flatMap((c) => c.key_decisions).slice(0, 10),
            action_items_count: analysis.clients.reduce((n, c) => n + c.action_items.length, 0),
            meeting_date: analysis.meeting_date,
            client_ids: [],
          })
          .select('id')
          .single()

        let docTaskCount = 0

        for (const clientData of analysis.clients) {
          const matched = clientList.find(
            (c) =>
              c.name.toLowerCase().includes(clientData.name.toLowerCase()) ||
              clientData.name.toLowerCase().includes(c.name.toLowerCase())
          )

          const clientId = matched?.id || null

          const { data: insight } = await supabase
            .from('client_meeting_insights')
            .insert({
              call_summary_id: callSummary?.id || null,
              client_id: clientId,
              doc_name: doc.name,
              meeting_date: analysis.meeting_date,
              key_decisions: clientData.key_decisions,
              open_items: clientData.action_items.map((a) => a.title),
              context: clientData.summary,
            })
            .select('id')
            .single()

          for (const item of clientData.action_items) {
            await supabase.from('tasks').insert({
              title: item.title,
              priority: item.priority,
              deadline: item.deadline || null,
              status: 'pendente',
              client_id: clientId,
              meeting_insight_id: insight?.id || null,
            })
            docTaskCount++
          }
        }

        // Mark doc as processed
        await supabase.from('processed_docs').insert({
          doc_id: doc.id,
          doc_name: doc.name,
          tasks_extracted: docTaskCount,
        })

        totalSynced++
        totalTasks += docTaskCount
      } catch (err: any) {
        errors.push(`${doc.name}: ${err.message}`)
      }
    }

    const remaining = docs.filter((d) => !processedIds.has(d.id)).length - newDocs.length

    return NextResponse.json({
      synced: totalSynced,
      tasks_created: totalTasks,
      skipped: newDocs.length - totalSynced,
      remaining,
      errors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
