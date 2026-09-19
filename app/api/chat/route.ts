import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { chatWithContext, transcribeAudioNote } from '@/lib/groq'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, mode, clientId } = body as {
      message: string
      mode: 'q' | 'i'
      clientId?: string
    }

    if (mode === 'i') {
      // Informar mode: save note to database
      const cleanContent = await transcribeAudioNote(
        message,
        clientId ? 'cliente selecionado' : 'geral'
      )

      await supabase.from('client_notes').insert({
        client_id: clientId || null,
        content: cleanContent,
        source: 'chat',
      })

      return NextResponse.json({
        reply: `Anotação registrada com sucesso${clientId ? ' para este cliente' : ''}.`,
        saved: true,
      })
    }

    // Consultar mode: build context and answer
    const [clientsRes, tasksRes, insightsRes, notesRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, segment, services, status, notes, contact, budget, tag')
        .eq('status', 'active'),
      supabase
        .from('tasks')
        .select('id, title, priority, status, deadline, client_id, responsible')
        .neq('status', 'concluida')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('client_meeting_insights')
        .select('id, client_id, doc_name, meeting_date, key_decisions, context')
        .order('meeting_date', { ascending: false })
        .limit(50),
      supabase
        .from('client_notes')
        .select('client_id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    const clients = clientsRes.data || []
    const tasks = tasksRes.data || []
    const insights = insightsRes.data || []
    const notes = notesRes.data || []

    const clientMap = Object.fromEntries(clients.map((c: any) => [c.id, c.name]))

    const context = `
=== CLIENTES ATIVOS (${clients.length}) ===
${clients.map((c: any) => `- ${c.name} | ${c.segment || 'sem segmento'} | Orçamento: ${c.budget || 'n/a'} | Serviços: ${(c.services || []).join(', ')} | Obs: ${c.notes || 'nenhuma'}`).join('\n')}

=== TAREFAS PENDENTES (${tasks.length}) ===
${tasks.map((t: any) => `- [${t.priority?.toUpperCase()}] ${t.title} | Cliente: ${clientMap[t.client_id] || 'sem cliente'} | Prazo: ${t.deadline || 'sem prazo'} | Resp: ${t.responsible || 'não definido'}`).join('\n')}

=== ÚLTIMAS REUNIÕES (${insights.length}) ===
${insights.map((i: any) => `- ${i.doc_name} (${i.meeting_date || 'data desconhecida'}) | Cliente: ${clientMap[i.client_id] || 'sem cliente'} | ${i.context || ''}`).join('\n')}

=== NOTAS MANUAIS (${notes.length}) ===
${notes.map((n: any) => `- [${clientMap[n.client_id] || 'geral'}] ${n.content}`).join('\n')}
`.trim()

    const reply = await chatWithContext(message, context)

    return NextResponse.json({ reply })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
