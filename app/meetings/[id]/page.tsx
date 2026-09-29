'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Client = { id: string; name: string }
type Insight = {
  id: string
  client_id: string | null
  context_summary: string
  key_decisions: string[]
  open_items: string[]
  assigned_by: 'ai' | 'manual'
  clients: { id: string; name: string } | null
}
type MeetingDetail = {
  id: string
  doc_name: string
  meeting_date: string | null
  overall_summary: string
  participants: string | null
  client_meeting_insights: Insight[]
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>()
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [meetingRes, clientsRes] = await Promise.all([
      fetch(`/api/meetings/${params.id}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/clients').then((r) => r.json()),
    ])
    setMeeting(meetingRes)
    setClients(Array.isArray(clientsRes) ? clientsRes : [])
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  async function reassign(insightId: string, clientId: string) {
    setSavingId(insightId)
    try {
      await fetch(`/api/meetings/${params.id}/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId || null }),
      })
      await load()
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <p>Carregando…</p>
  if (!meeting) return <p>Reunião não encontrada.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
      <div>
        <h1>{meeting.doc_name}</h1>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          {meeting.meeting_date && <span>{meeting.meeting_date}</span>}
          {meeting.participants && <span>{meeting.participants}</span>}
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 'var(--sp-4)' }}>RESUMO GERAL</h2>
        <div className="block">
          <p style={{ margin: 0, lineHeight: 1.7 }}>{meeting.overall_summary}</p>
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 'var(--sp-4)' }}>CLIENTES IDENTIFICADOS</h2>
        {meeting.client_meeting_insights.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>Nenhum cliente identificado nesta reunião.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {meeting.client_meeting_insights.map((insight) => (
            <div key={insight.id} className="block">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                  <span className={insight.client_id ? 'tag tag-active' : 'tag'}>
                    {insight.clients?.name || 'SEM CLIENTE'}
                  </span>
                  {insight.assigned_by === 'manual' && <span className="tag">CORRIGIDO MANUALMENTE</span>}
                </div>
                <select
                  value={insight.client_id || ''}
                  onChange={(e) => reassign(insight.id, e.target.value)}
                  disabled={savingId === insight.id}
                >
                  <option value="">— reatribuir cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <p style={{ margin: '0 0 var(--sp-3)', fontSize: 13 }}>{insight.context_summary}</p>
              {insight.key_decisions.length > 0 && (
                <div style={{ marginBottom: 'var(--sp-2)' }}>
                  <div className="eyebrow" style={{ color: 'var(--navy)', marginBottom: 4 }}>
                    Decisões
                  </div>
                  {insight.key_decisions.map((d, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      • {d}
                    </div>
                  ))}
                </div>
              )}
              {insight.open_items.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ color: 'var(--navy)', marginBottom: 4 }}>
                    Pendências
                  </div>
                  {insight.open_items.map((o, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      • {o}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
