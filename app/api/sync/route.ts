import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listMeetingFolders, findTranscriptionDoc, readDocContent } from '@/lib/google'
import { analyzeMeeting } from '@/lib/groq'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    // Get already-processed folder IDs
    const { data: processed } = await supabase
      .from('processed_docs')
      .select('doc_id')

    const processedIds = new Set((processed || []).map((r: any) => r.doc_id))

    // On first sync (no processed docs yet), restrict to last week only
    const isFirstSync = processedIds.size === 0
    const folders = isFirstSync
      ? await listMeetingFolders(folderId, '2026-09-14T00:00:00Z')
      : await listMeetingFolders(folderId)

    const newFolders = folders.filter((f: any) => !processedIds.has(f.id))

    if (newFolders.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Nenhuma reunião nova encontrada.' })
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

    for (const folder of newFolders) {
      try {
        // Find the transcription doc inside this meeting folder
        const doc = await findTranscriptionDoc(folder.id as string)

        if (!doc) {
          // No transcription found — mark folder as processed to skip next time
          await supabase.from('processed_docs').insert({
            doc_id: folder.id,
            doc_name: folder.name,
            tasks_extracted: 0,
          })
          continue
        }

        const content = await readDocContent(doc.id)
        if (!content || content.length < 100) {
          await supabase.from('processed_docs').insert({
            doc_id: folder.id,
            doc_name: folder.name,
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
            doc_name: folder.name,
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
              doc_name: folder.name,
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

        // Mark folder as processed
        await supabase.from('processed_docs').insert({
          doc_id: folder.id,
          doc_name: folder.name,
          tasks_extracted: docTaskCount,
        })

        totalSynced++
        totalTasks += docTaskCount
      } catch (err: any) {
        errors.push(`${folder.name}: ${err.message}`)
      }
    }

    return NextResponse.json({
      synced: totalSynced,
      tasks_created: totalTasks,
      skipped: newFolders.length - totalSynced,
      errors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
