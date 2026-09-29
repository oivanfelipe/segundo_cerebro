'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Meeting = {
  processed_doc_id: string
  meeting_id: string | null
  folder_name: string
  status: 'processed' | 'no_transcript' | 'error'
  error_message: string | null
  processed_at: string
  meeting_date: string | null
  client_names: string[]
  has_unassigned: boolean
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/meetings')
      .then((r) => r.json())
      .then((data) => setMeetings(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <h1>REUNIÕES</h1>

      {loading && <p>Carregando…</p>}

      {!loading && meetings.length === 0 && (
        <div className="block">
          <p style={{ margin: 0 }}>
            Nenhuma reunião sincronizada ainda. Vá ao Dashboard e clique em &quot;Sincronizar agora&quot;.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {meetings.map((m) => (
          <div key={m.processed_doc_id} className="block" style={{ padding: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
              <div>
                {m.meeting_id ? (
                  <Link href={`/meetings/${m.meeting_id}`} style={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>
                    {m.folder_name}
                  </Link>
                ) : (
                  <span style={{ fontWeight: 600 }}>{m.folder_name}</span>
                )}
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {m.meeting_date || new Date(m.processed_at).toLocaleDateString('pt-BR')}
                </div>
                {m.status === 'error' && m.error_message && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>{m.error_message}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <StatusTag status={m.status} />
                {m.has_unassigned && <span className="tag">SEM CLIENTE IDENTIFICADO</span>}
              </div>
            </div>
            {m.client_names.length > 0 && (
              <div style={{ marginTop: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                {m.client_names.map((name) => (
                  <span key={name} className="tag tag-active">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusTag({ status }: { status: Meeting['status'] }) {
  const label =
    status === 'processed' ? 'PROCESSADA' : status === 'no_transcript' ? 'SEM TRANSCRIÇÃO' : 'ERRO'
  return <span className="tag">{label}</span>
}
