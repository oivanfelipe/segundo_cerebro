'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Compiled = {
  client: {
    id: string
    name: string
    contact: string | null
    segment: string | null
    status: 'active' | 'paused'
    accumulated_summary: string | null
    accumulated_summary_updated_at: string | null
  }
  timeline: {
    insight_id: string
    meeting_id: string | null
    meeting_name: string | null
    meeting_date: string | null
    context_summary: string
    key_decisions: string[]
    open_items: string[]
    assigned_by: 'ai' | 'manual'
  }[]
  decisions: { item: string; meeting_date: string | null }[]
  open_items: {
    insight_id: string
    index: number
    item: string
    done: boolean
    done_at: string | null
    meeting_date: string | null
  }[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function ClientCompiledPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<Compiled | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${params.id}/compiled`)
    if (!r.ok) {
      setNotFound(true)
      return
    }
    setData(await r.json())
  }, [params.id])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  async function toggleOpenItem(insightId: string, index: number, done: boolean) {
    const key = `${insightId}:${index}`
    setTogglingKey(key)
    try {
      await fetch(`/api/insights/${insightId}/open-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, done }),
      })
      await load()
    } finally {
      setTogglingKey(null)
    }
  }

  if (loading) return <p>Carregando…</p>
  if (notFound || !data) return <p>Cliente não encontrado.</p>

  const { client, timeline, decisions, open_items: openItems } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ textTransform: 'uppercase' }}>{client.name}</h1>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
            {client.segment && <span className="tag">{client.segment}</span>}
            <span className={client.status === 'active' ? 'tag tag-active' : 'tag'}>
              {client.status === 'active' ? 'ATIVO' : 'PAUSADO'}
            </span>
          </div>
          {client.contact && <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>{client.contact}</p>}
        </div>
        <Link href={`/clients/${client.id}/edit`} className="btn btn-secondary">
          EDITAR
        </Link>
      </div>

      <div>
        <h2 style={{ marginBottom: 'var(--sp-4)' }}>RESUMO GERAL</h2>
        <div className="block">
          {client.accumulated_summary ? (
            <p style={{ margin: 0, lineHeight: 1.7 }}>{client.accumulated_summary}</p>
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Nenhuma reunião registrada ainda para este cliente. Sincronize novas reuniões no
              Dashboard para começar a montar o compilado.
            </p>
          )}
        </div>
      </div>

      {(decisions.length > 0 || openItems.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--sp-6)' }}>
          <div>
            <h2 style={{ marginBottom: 'var(--sp-4)' }}>PENDÊNCIAS</h2>
            <div className="block-yellow" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {openItems.length === 0 && <p style={{ margin: 0 }}>Nenhuma pendência em aberto.</p>}
              {openItems.map((o) => {
                const key = `${o.insight_id}:${o.index}`
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--sp-2)',
                      cursor: 'pointer',
                      opacity: togglingKey === key ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={o.done}
                      disabled={togglingKey === key}
                      onChange={(e) => toggleOpenItem(o.insight_id, o.index, e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ textDecoration: o.done ? 'line-through' : 'none' }}>
                      {o.item}
                      {o.meeting_date && <span style={{ fontSize: 11 }}> ({o.meeting_date})</span>}
                      {o.done && o.done_at && (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {' '}
                          — concluído em {formatDate(o.done_at)}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <h2 style={{ marginBottom: 'var(--sp-4)' }}>DECISÕES</h2>
            <div className="block" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {decisions.length === 0 && <p style={{ margin: 0 }}>Nenhuma decisão registrada.</p>}
              {decisions.map((d, i) => (
                <div key={i}>
                  • {d.item}
                  {d.meeting_date && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}> ({d.meeting_date})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 style={{ marginBottom: 'var(--sp-4)' }}>LINHA DO TEMPO</h2>
        {timeline.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma reunião registrada ainda para este cliente.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {timeline.map((t) => (
            <Link
              key={t.insight_id}
              href={t.meeting_id ? `/meetings/${t.meeting_id}` : '#'}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="block" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
                  <div style={{ fontWeight: 600 }}>{t.meeting_name || 'Reunião'}</div>
                  {t.meeting_date && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.meeting_date}</div>
                  )}
                </div>
                <p style={{ margin: 'var(--sp-2) 0 0', fontSize: 13 }}>{t.context_summary}</p>
                {t.assigned_by === 'manual' && (
                  <span className="tag" style={{ marginTop: 'var(--sp-2)' }}>
                    CORRIGIDO MANUALMENTE
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
