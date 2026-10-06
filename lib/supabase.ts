import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

export const supabase = createClient(url, key)

export type ClientStatus = 'active' | 'paused'

export type Client = {
  id: string
  name: string
  contact: string | null
  segment: string | null
  status: ClientStatus
  accumulated_summary: string | null
  accumulated_summary_updated_at: string | null
  created_at: string
  updated_at: string
}

export type ProcessedDocStatus = 'processed' | 'no_transcript' | 'error'

export type ProcessedDoc = {
  id: string
  folder_id: string
  folder_name: string
  status: ProcessedDocStatus
  error_message: string | null
  processed_at: string
}

export type MeetingSummary = {
  id: string
  processed_doc_id: string
  doc_name: string
  meeting_date: string | null
  overall_summary: string
  participants: string | null
  created_at: string
}

export type AssignedBy = 'ai' | 'manual'

export type OpenItem = {
  text: string
  done: boolean
  done_at: string | null
}

export type ClientMeetingInsight = {
  id: string
  meeting_summary_id: string
  client_id: string | null
  context_summary: string
  key_decisions: string[]
  open_items: OpenItem[]
  assigned_by: AssignedBy
  created_at: string
}
