'use client'

import { useState } from 'react'

type Option = { id: string; name: string }

// Escolhe o workspace do Ekyte do cliente: busca pelo nome e grava id + nome.
export default function WorkspacePicker({
  id,
  name,
  fallbackSearch,
  onChange,
}: {
  id: string
  name: string
  fallbackSearch: string
  onChange: (id: string, name: string) => void
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function find() {
    setLoading(true)
    setError(null)
    try {
      const q = (search || fallbackSearch).trim()
      const res = await fetch(`/api/ekyte/workspaces?search=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar workspaces.')
      setOptions(data)
      if (data.length === 0) setError('Nenhum workspace encontrado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar workspaces.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
      <span className="eyebrow" style={{ color: 'var(--navy)' }}>
        Workspace no Ekyte
      </span>
      <div style={{ fontWeight: 600 }}>{id ? `${name || 'Workspace'} (#${id})` : 'Não vinculado'}</div>
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && find()}
          placeholder={`Buscar (padrão: ${fallbackSearch || 'nome do cliente'})`}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn btn-secondary" onClick={find} disabled={loading}>
          {loading ? 'BUSCANDO…' : 'BUSCAR'}
        </button>
      </div>
      {error && <span style={{ fontSize: 12 }}>{error}</span>}
      {options.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const o = options.find((x) => x.id === e.target.value)
            if (o) {
              onChange(o.id, o.name)
              setOptions([])
            }
          }}
          style={{ width: '100%' }}
        >
          <option value="">Selecione o workspace…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {id && (
        <button type="button" onClick={() => onChange('', '')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', fontSize: 12, color: 'var(--muted)', padding: 0 }}>
          desvincular
        </button>
      )}
    </div>
  )
}
