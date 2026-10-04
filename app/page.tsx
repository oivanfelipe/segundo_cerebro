'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Client = { id: string; name: string; status: 'active' | 'paused' }
type Meeting = {
  processed_doc_id: string
  meeting_id: string | null
  folder_name: string
  status: 'processed' | 'no_transcript' | 'error'
  processed_at: string
  meeting_date: string | null
  client_names: string[]
  has_unassigned: boolean
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [clientsRes, meetingsRes] = await Promise.all([
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/meetings').then((r) => r.json()),
      ])
      setClients(Array.isArray(clientsRes) ? clientsRes : [])
      setMeetings(Array.isArray(meetingsRes) ? meetingsRes : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runSync() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      let totalSynced = 0
      let totalErrors = 0
      // O sync processa em lotes (ver BATCH_SIZE em /api/sync) para não estourar o
      // tempo limite da função serverless — repete até não sobrar nada pendente.
      for (let round = 0; round < 20; round++) {
        const res = await fetch('/api/sync', { method: 'POST' })
        const data = await res.json()
        if (data.error) {
          setSyncMessage(`Erro: ${data.error}`)
          break
        }
        totalSynced += data.synced || 0
        totalErrors += data.errors?.length || 0
        setSyncMessage(
          `Sincronizando… ${totalSynced} reunião(ões) processada(s)${totalErrors ? `, ${totalErrors} com erro` : ''}.`
        )
        await load()
        if (!data.remaining) {
          setSyncMessage(
            `${totalSynced} reunião(ões) sincronizada(s)${totalErrors ? `, ${totalErrors} com erro` : ''}.`
          )
          break
        }
      }
    } catch (err) {
      setSyncMessage(err instanceof Error ? `Erro: ${err.message}` : 'Erro ao sincronizar.')
    } finally {
      setSyncing(false)
    }
  }

  const activeClients = clients.filter((c) => c.status === 'active')
  const unassignedCount = meetings.filter((m) => m.has_unassigned).length
  const recentMeetings = meetings.slice(0, 8)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
        <h1>DASHBOARD</h1>
        <button className="btn btn-primary" onClick={runSync} disabled={syncing}>
          {syncing ? 'SINCRONIZANDO…' : 'SINCRONIZAR AGORA'}
        </button>
      </div>

      {syncMessage && (
        <div className="block" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
          {syncMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--sp-6)',
        }}
      >
        <StatBlock label="CLIENTES ATIVOS" value={activeClients.length} />
        <StatBlock label="REUNIÕES SINCRONIZADAS" value={meetings.length} />
        <StatBlock
          label="SEM CLIENTE IDENTIFICADO"
          value={unassignedCount}
          highlight={unassignedCount > 0}
        />
      </div>

      <div>
        <h2 style={{ marginBottom: 'var(--sp-4)' }}>REUNIÕES RECENTES</h2>
        {loading && <p>Carregando…</p>}
        {!loading && recentMeetings.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>
            Nenhuma reunião sincronizada ainda. Clique em &quot;Sincronizar agora&quot;.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {recentMeetings.map((m) => (
            <Link
              key={m.processed_doc_id}
              href={m.meeting_id ? `/meetings/${m.meeting_id}` : '/meetings'}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="block"
                style={{
                  padding: 'var(--sp-4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--sp-4)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{m.folder_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {m.client_names.length > 0 ? m.client_names.join(', ') : 'Nenhum cliente identificado'}
                  </div>
                </div>
                <StatusTag status={m.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatBlock({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className={highlight ? 'block-yellow' : 'block'}>
      <div className="stat-number">{value}</div>
      <div className="eyebrow" style={{ marginTop: 'var(--sp-2)' }}>
        {label}
      </div>
    </div>
  )
}

function StatusTag({ status }: { status: Meeting['status'] }) {
  const label =
    status === 'processed' ? 'PROCESSADA' : status === 'no_transcript' ? 'SEM TRANSCRIÇÃO' : 'ERRO'
  return <span className="tag">{label}</span>
}
