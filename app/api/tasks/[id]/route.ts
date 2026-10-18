import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Marca/desmarca uma tarefa manual como feita (ou edita título/cliente/data).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const update: Record<string, unknown> = {}

  if (typeof body.done === 'boolean') {
    update.done = body.done
    update.done_at = body.done ? new Date().toISOString() : null
  }
  if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim()
  if ('client_id' in body) update.client_id = body.client_id || null
  if (typeof body.task_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.task_date)) {
    update.task_date = body.task_date
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('manual_tasks').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('manual_tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
