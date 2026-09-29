'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type ClientFormValues = {
  id?: string
  name: string
  contact: string
  segment: string
  status: 'active' | 'paused'
}

export default function ClientForm({ initial }: { initial?: ClientFormValues }) {
  const router = useRouter()
  const [values, setValues] = useState<ClientFormValues>(
    initial || { name: '', contact: '', segment: '', status: 'active' }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!values.name.trim()) {
      setError('Nome do cliente é obrigatório.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const isEdit = Boolean(values.id)
      const res = await fetch(isEdit ? `/api/clients/${values.id}` : '/api/clients', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar cliente.')
      router.push(`/clients/${data.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="block" style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <Field label="Nome do cliente">
        <input
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder="Ex: Falcon Textil"
          style={{ width: '100%' }}
        />
      </Field>
      <Field label="Contato">
        <input
          value={values.contact}
          onChange={(e) => setValues((v) => ({ ...v, contact: e.target.value }))}
          placeholder="Nome, e-mail ou telefone"
          style={{ width: '100%' }}
        />
      </Field>
      <Field label="Segmento">
        <input
          value={values.segment}
          onChange={(e) => setValues((v) => ({ ...v, segment: e.target.value }))}
          placeholder="Ex: Têxtil, Saúde, Varejo"
          style={{ width: '100%' }}
        />
      </Field>
      <Field label="Status">
        <select
          value={values.status}
          onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as 'active' | 'paused' }))}
          style={{ width: '100%' }}
        >
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
        </select>
      </Field>

      {error && <p style={{ color: 'var(--navy)', fontWeight: 600 }}>{error}</p>}

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'SALVANDO…' : 'SALVAR CLIENTE'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
      <span className="eyebrow" style={{ color: 'var(--navy)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
