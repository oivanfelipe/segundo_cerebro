import type { Owners } from '@/lib/owners'

export type TaskClient = ({ id: string; name: string } & Owners) | null

// Tarefa unificada: pendência extraída de reunião (vive dentro do insight) ou tarefa manual.
export type Task = {
  key: string
  source: 'meeting' | 'manual'
  title: string
  done: boolean
  done_at: string | null
  date: string | null // data da reunião (YYYY-MM-DD) ou data da tarefa manual
  client: TaskClient
  // só reunião
  insight_id?: string
  index?: number
  meeting_id?: string | null
  meeting_name?: string | null
  // só manual
  id?: string
}
