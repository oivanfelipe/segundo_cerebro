import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listDriveFiles, readDocContent } from '@/lib/google'
import { analyzeMeeting } from '@/lib/groq'

export async function POST() {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    // Fetch all docs from Drive folder
    const driveFiles = await listDriveFiles(folderId)

    // Get already-processed doc IDs
    const { data: processed } = await supabase
      .from('processed_docs')
      .select('doc_id')

    const processedIds = new Set((processed || []).map((r: any) => r.doc_id))

    const newFiles = driveFiles.filter((f: any) => !processedIds.has(f.id))

    if (newFiles.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Nenhum documento novo encontrado.' })
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

    for (const file of newFiles) {
      try {
        const content = await readDocContent(file.id as string)
        if (!content || content.length < 100) {
          // Mark as processed even if empty to avoid re-checking
          await supabase.from('processed_docs').insert({
            doc_id: file.id,
            doc_name: file.name,
            tasks_extracted: 0,
          })
          continue
        }

        const analysis = await analyzeMeeting(content, clientNames as string[])

        // Save call_summary
        const { data: callSummary } = await supabase
          .from('call_summaries')
          .insert({
            doc_id: file.id,
            doc_name: file.name,
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
          // Match client by name (case-insensitive substring)
          const matched = clientList.find(
            (c) =>
              c.name.toLowerCase().includes(clientData.name.toLowerCase()) ||
              clientData.name.toLowerCase().includes(c.name.toLowerCase())
          )

          const clientId = matched?.id || null

          // Save meeting insight
          const { data: insight } = await supabase
            .from('client_meeting_insights')
            .insert({
              call_summary_id: callSummary?.id || null,
              client_id: clientId,
              doc_name: file.name,
              meeting_date: analysis.meeting_date,
              key_decisions: clientData.key_decisions,
              open_items: clientData.action_items.map((a) => a.title),
              context: clientData.summary,
            })
            .select('id')
            .single()

          // Create tasks for each action item
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

        // Mark as processed
        await supabase.from('processed_docs').insert({
          doc_id: file.id,
          doc_name: file.name,
          tasks_extracted: docTaskCount,
        })

        totalSynced++
        totalTasks += docTaskCount
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`)
      }
    }

    return NextResponse.json({
      synced: totalSynced,
      tasks_created: totalTasks,
      skipped: newFiles.length - totalSynced,
      errors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
