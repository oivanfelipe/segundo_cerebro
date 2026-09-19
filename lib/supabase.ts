import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export type Client = {
  id: string
  name: string
  segment: string | null
  services: string[]
  status: 'active' | 'paused'
  notes: string | null
  contact: string | null
  phone: string | null
  budget: string | null
  tag: string | null
  created_at: string
}

export type Task = {
  id: string
  title: string
  description: string | null
  priority: 'alta' | 'media' | 'baixa'
  deadline: string | null
  status: 'pendente' | 'em_andamento' | 'concluida'
  responsible: string | null
  meeting_insight_id: string | null
  client_id: string | null
  notes: string | null
  created_at: string
}

export type MeetingInsight = {
  id: string
  call_summary_id: string | null
  client_id: string | null
  doc_name: string
  meeting_date: string | null
  key_decisions: string[]
  open_items: string[]
  context: string | null
  created_at: string
}

export type CallSummary = {
  id: string
  doc_id: string
  doc_name: string
  summary: string
  participants: string | null
  key_points: string[]
  action_items_count: number
  meeting_date: string | null
  created_at: string
}

export type TeamMember = {
  id: string
  name: string
  role: string | null
  email: string | null
  created_at: string
}

export type ClientNote = {
  id: string
  client_id: string | null
  content: string
  source: 'chat' | 'audio' | 'file'
  file_name: string | null
  created_at: string
}
