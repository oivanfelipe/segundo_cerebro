import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listTasks, type TaskStatus } from '@/lib/tasks'

export const dynamic = 'force-dynamic'

// Lista unificada de tarefas: pendências das reuniões + tarefas manuais.
// ?status=open (padrão) | done | all  ·  ?client_id=<uuid>
export async function GET(req: NextRequest) {
  const status = (req.nextUrl.searchParams.get('status') || 'open') as TaskStatus
  const clientId = req.nextUrl.searchParams.get('client_id')

  try {
    return NextResponse.json(await listTasks(status, clientId))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao listar tarefas.' }, { status: 500 })
  }
}

// Cria tarefa manual.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Descreva a tarefa.' }, { status: 400 })

  const insert: Record<string, unknown> = { title, client_id: body.client_id || null }
  if (typeof body.task_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.task_date)) {
    insert.task_date = body.task_date
  }

  const { data, error } = await supabase.from('manual_tasks').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
