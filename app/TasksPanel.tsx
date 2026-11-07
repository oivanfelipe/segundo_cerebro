'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Owners from './clients/Owners'
import { formatDateBR } from '@/lib/dates'
import type { Task } from '@/lib/tasks'
import { OWNER_FIELDS } from '@/lib/owners'

type EkyteUser = { id: string; name: string }

type ClientOption = { id: string; name: string }

function today() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Tarefas: as pendências saídas das reuniões + as lançadas à mão. Marcar como feita tira a
// tarefa da lista em aberto e ela passa a ficar no backlog do cliente.
//  - sem clientId (tela inicial): só as em aberto, de todos os clientes
//  - com clientId (página do cliente): em aberto + concluídas (backlog)
export default function TasksPanel({ clientId, refreshKey = 0 }: { clientId?: string; refreshKey?: number }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<EkyteUser[] | null>(null)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newDate, setNewDate] = useState(today())
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ status: clientId ? 'all' : 'open' })
    if (clientId) qs.set('client_id', clientId)
    const res = await fetch(`/api/tasks?${qs}`)
    const data = await res.json()
    setTasks(Array.isArray(data) ? data : [])
  }, [clientId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load, refreshKey])

  useEffect(() => {
    if (clientId) return
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
  }, [clientId])

  async function toggle(task: Task, done: boolean) {
    setBusyKey(task.key)
    setError(null)
    // otimista: a tarefa muda de lista na hora
    setTasks((prev) =>
      prev.map((t) => (t.key === task.key ? { ...t, done, done_at: done ? new Date().toISOString() : null } : t))
    )
    try {
      const res =
        task.source === 'manual'
          ? await fetch(`/api/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ done }),
            })
          : await fetch(`/api/insights/${task.insight_id}/open-items`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ index: task.index, done }),
            })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao atualizar a tarefa.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar a tarefa.')
      await load()
    } finally {
      setBusyKey(null)
    }
  }

  // Pessoas do Ekyte, carregadas só na primeira vez que alguém edita/envia.
  async function ensureUsers() {
    if (users) return
    try {
      const res = await fetch('/api/ekyte/users')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar pessoas do Ekyte.')
      setUsers(data)
      setUsersError(null)
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao carregar pessoas do Ekyte.')
    }
  }

  async function save(task: Task, patch: { title: string; assignee: EkyteUser | null }) {
    setBusyKey(task.key)
    setError(null)
    try {
      const assignee = { assignee_id: patch.assignee?.id ?? null, assignee_name: patch.assignee?.name ?? null }
      const res =
        task.source === 'manual'
          ? await fetch(`/api/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: patch.title, ...assignee }),
            })
          : await fetch(`/api/insights/${task.insight_id}/open-items`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ index: task.index, text: patch.title, ...assignee }),
            })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao salvar a tarefa.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a tarefa.')
      throw err
    } finally {
      setBusyKey(null)
    }
  }

  async function sendToEkyte(task: Task) {
    setBusyKey(task.key)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/tasks/send-to-ekyte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          task.source === 'manual'
            ? { source: 'manual', id: task.id }
            : { source: 'meeting', insight_id: task.insight_id, index: task.index }
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar ao Ekyte.')
      setNotice(`Enviada ao Ekyte (#${data.ekyte_task_id}).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar ao Ekyte.')
    } finally {
      setBusyKey(null)
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(`Excluir a tarefa "${task.title}"?`)) return
    setBusyKey(task.key)
    setError(null)
    try {
      const res =
        task.source === 'manual'
          ? await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
          : await fetch(`/api/insights/${task.insight_id}/open-items`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ index: task.index }),
            })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao excluir a tarefa.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir a tarefa.')
    } finally {
      // recarrega sempre: ao excluir uma pendência de reunião os índices dos demais mudam
      await load()
      setBusyKey(null)
    }
  }

  async function add() {
    if (!title.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, client_id: clientId || newClient || null, task_date: newDate }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao adicionar a tarefa.')
      setTitle('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar a tarefa.')
    } finally {
      setAdding(false)
    }
  }

  const open = useMemo(
    () => tasks.filter((t) => !t.done && (!filterClient || (filterClient === 'none' ? !t.client : t.client?.id === filterClient))),
    [tasks, filterClient]
  )
  const done = useMemo(
    () => tasks.filter((t) => t.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')),
    [tasks]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div className="row-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
        <h2>
          {clientId ? 'TAREFAS' : 'TAREFAS EM ABERTO'}
          {!loading && <span style={{ color: 'var(--muted)', fontSize: 16 }}> ({open.length})</span>}
        </h2>
        {!clientId && (
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">Todos os clientes</option>
            <option value="none">Sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* nova tarefa manual */}
      <div className="block" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-3) var(--sp-4)' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nova tarefa… (Enter para adicionar)"
          style={{ flex: '1 1 260px', minWidth: 0 }}
        />
        {!clientId && (
          <select value={newClient} onChange={(e) => setNewClient(e.target.value)} style={{ flex: '0 1 200px' }}>
            <option value="">Sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ flex: '0 1 150px' }} />
        <button className="btn btn-primary" onClick={add} disabled={adding || !title.trim()}>
          {adding ? 'ADICIONANDO…' : '+ ADICIONAR'}
        </button>
      </div>

      {error && <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>}
      {notice && <p style={{ margin: 0, fontWeight: 600 }}>{notice}</p>}
      {loading && <p>Carregando…</p>}

      {!loading && open.length === 0 && (
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          {tasks.some((t) => !t.done)
            ? 'Nenhuma tarefa em aberto para este filtro.'
            : 'Nenhuma tarefa em aberto. As pendências das reuniões aparecem aqui depois do sync.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {open.map((t) => (
          <TaskRow key={t.key} task={t} showClient={!clientId} busy={busyKey === t.key} onToggle={toggle} onRemove={remove} onSave={save} onSend={sendToEkyte} users={users} usersError={usersError} ensureUsers={ensureUsers} />
        ))}
      </div>

      {clientId && done.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
          <h3>BACKLOG — CONCLUÍDAS ({done.length})</h3>
          {done.map((t) => (
            <TaskRow key={t.key} task={t} showClient={false} busy={busyKey === t.key} onToggle={toggle} onRemove={remove} onSave={save} onSend={sendToEkyte} users={users} usersError={usersError} ensureUsers={ensureUsers} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  showClient,
  busy,
  onToggle,
  onRemove,
  onSave,
  onSend,
  users,
  usersError,
  ensureUsers,
}: {
  task: Task
  showClient: boolean
  busy: boolean
  onToggle: (t: Task, done: boolean) => void
  onRemove: (t: Task) => void
  onSave: (t: Task, patch: { title: string; assignee: EkyteUser | null }) => Promise<void>
  onSend: (t: Task) => void
  users: EkyteUser[] | null
  usersError: string | null
  ensureUsers: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(task.title)
  const [draftAssignee, setDraftAssignee] = useState(task.assignee_id || '')

  // pessoas do Ekyte cujo nome bate com quem cuida do cliente ficam no topo da lista
  const ownerNames = task.client ? OWNER_FIELDS.map((f) => task.client?.[f.key]).filter(Boolean) as string[] : []
  const isOwner = (n: string) => ownerNames.some((o) => n.toLowerCase().includes(o.toLowerCase().split(' ')[0]))
  const sortedUsers = users ? [...users].sort((a, b) => Number(isOwner(b.name)) - Number(isOwner(a.name))) : []

  async function startEdit() {
    setDraftTitle(task.title)
    setDraftAssignee(task.assignee_id || '')
    setEditing(true)
    await ensureUsers()
  }

  async function commit() {
    const assignee = sortedUsers.find((u) => u.id === draftAssignee) || null
    try {
      await onSave(task, {
        title: draftTitle.trim() || task.title,
        assignee: assignee ?? (draftAssignee && task.assignee_id === draftAssignee ? { id: draftAssignee, name: task.assignee_name || '' } : null),
      })
      setEditing(false)
    } catch {
      /* erro já exibido no painel */
    }
  }

  const sent = Boolean(task.ekyte_task_id)

  return (
    <div
      className="block"
      style={{ padding: 'var(--sp-3) var(--sp-4)', display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start', opacity: busy ? 0.5 : 1 }}
    >
      <input
        type="checkbox"
        checked={task.done}
        disabled={busy}
        onChange={(e) => onToggle(task, e.target.checked)}
        aria-label={task.done ? 'Reabrir tarefa' : 'Concluir tarefa'}
        style={{ marginTop: 4, width: 20, height: 20, minHeight: 0, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <textarea
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              rows={3}
              style={{ width: '100%' }}
              aria-label="Texto da tarefa"
            />
            <select value={draftAssignee} onChange={(e) => setDraftAssignee(e.target.value)} style={{ width: '100%' }} aria-label="Responsável">
              <option value="">Sem responsável</option>
              {task.assignee_id && !sortedUsers.some((u) => u.id === task.assignee_id) && (
                <option value={task.assignee_id}>{task.assignee_name || task.assignee_id}</option>
              )}
              {sortedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {isOwner(u.name) ? '★ ' : ''}
                  {u.name}
                </option>
              ))}
            </select>
            {usersError && <span style={{ fontSize: 12 }}>{usersError}</span>}
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button className="btn btn-primary" onClick={commit} disabled={busy || !draftTitle.trim()}>
                SALVAR
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={busy}>
                CANCELAR
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontWeight: 600, textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
          {showClient &&
            (task.client ? (
              <Link href={`/clients/${task.client.id}`} className="tag tag-active" style={{ textDecoration: 'none' }}>
                {task.client.name}
              </Link>
            ) : (
              <span className="tag">SEM CLIENTE</span>
            ))}
          <span>{formatDateBR(task.date)}</span>
          <span>·</span>
          {task.source === 'meeting' && task.meeting_id ? (
            <Link href={`/meetings/${task.meeting_id}`} style={{ color: 'inherit' }}>
              {task.meeting_name ? `Reunião: ${task.meeting_name.replace(/\s*-?\s*\d{4}\/\d{2}\/\d{2}.*$/, '')}` : 'Reunião'}
            </Link>
          ) : (
            <span>Manual</span>
          )}
          {task.done && task.done_at && <span>· concluída em {new Date(task.done_at).toLocaleDateString('pt-BR')}</span>}
        </div>
        {task.client && <Owners owners={task.client} compact />}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center', fontSize: 12 }}>
          <span>
            <span style={{ color: 'var(--muted)' }}>Responsável: </span>
            <strong>{task.assignee_name || '—'}</strong>
          </span>
          {sent ? (
            <span className="tag tag-active">NO EKYTE #{task.ekyte_task_id}</span>
          ) : (
            !task.done && (
              <button
                className="btn btn-secondary"
                onClick={() => onSend(task)}
                disabled={busy || editing || !task.assignee_id || !task.client?.ekyte_workspace_id}
                title={
                  !task.client
                    ? 'A tarefa precisa de um cliente.'
                    : !task.client.ekyte_workspace_id
                      ? 'Cliente sem workspace do Ekyte (Editar cliente).'
                      : !task.assignee_id
                        ? 'Defina o responsável (✎) antes de enviar.'
                        : 'Enviar ao Ekyte como tarefa de Verificação'
                }
              >
                ENVIAR AO EKYTE
              </button>
            )
          )}
        </div>
      </div>
      {!sent && !editing && (
        <button
          onClick={startEdit}
          disabled={busy}
          aria-label="Editar tarefa"
          title="Editar texto e responsável"
          style={{ background: 'none', border: 'none', fontSize: 18, lineHeight: 1, color: 'var(--muted)', minHeight: 44, minWidth: 32, padding: 4 }}
        >
          ✎
        </button>
      )}
      <button
        onClick={() => onRemove(task)}
        disabled={busy}
        aria-label="Excluir tarefa"
        title="Excluir tarefa"
        style={{ background: 'none', border: 'none', fontSize: 20, lineHeight: 1, color: 'var(--muted)', minHeight: 44, minWidth: 32, padding: 4 }}
      >
        ×
      </button>
    </div>
  )
}
