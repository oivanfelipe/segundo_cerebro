'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Client = {
  id: string
  name: string
  contact: string | null
  segment: string | null
  status: 'active' | 'paused'
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
        <h1>CLIENTES</h1>
        <Link href="/clients/new" className="btn btn-primary">
          + ADICIONAR CLIENTE
        </Link>
      </div>

      <input
        placeholder="Buscar cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320 }}
      />

      {loading && <p>Carregando…</p>}

      {!loading && filtered.length === 0 && (
        <div className="block" style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, marginBottom: 'var(--sp-4)' }}>
            {clients.length === 0
              ? 'Nenhum cliente cadastrado ainda. Sem clientes, o sync não tem contra o que comparar.'
              : 'Nenhum cliente encontrado com esse nome.'}
          </p>
          {clients.length === 0 && (
            <Link href="/clients/new" className="btn btn-primary">
              + ADICIONAR CLIENTE
            </Link>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-4)' }}>
        {filtered.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="block" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div style={{ fontWeight: 700, fontFamily: 'var(--f-display)' }}>{c.name}</div>
              {c.segment && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{c.segment}</div>}
              {c.status === 'paused' && <span className="tag">PAUSADO</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
