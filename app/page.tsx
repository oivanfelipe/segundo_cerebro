'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

/* ─── types ─── */
interface Client {
  id: string; name: string; segment: string | null; services: string[]
  status: string; notes: string | null; contact: string | null
  phone: string | null; budget: string | null; tag: string | null
}
interface Task {
  id: string; title: string; priority: 'alta' | 'media' | 'baixa'
  status: 'pendente' | 'em_andamento' | 'concluida'
  deadline: string | null; responsible: string | null
  client_id: string | null; meeting_insight_id: string | null
  client_meeting_insights?: { doc_name: string; meeting_date: string | null } | null
}
interface Insight {
  id: string; client_id: string | null; doc_name: string
  meeting_date: string | null; key_decisions: string[]
  open_items: string[]; context: string | null
  tasks?: Task[]
}
interface TeamMember { id: string; name: string; role: string | null; email: string | null }
interface ChatMsg { role: 'user' | 'ai'; text: string; noteFor?: string }

/* ─── helpers ─── */
const AVCLR = ['#3E32BE', '#0B8A5A', '#C67900', '#C22020', '#6633CC', '#0B7AAA']
const avclr = (n: string) => AVCLR[n.charCodeAt(0) % AVCLR.length]
const initials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null
const PRIO_LABEL: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

export default function Home() {
  /* data */
  const [clients, setClients] = useState<Client[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  /* ui state */
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'reunioes' | 'tarefas' | 'notas'>('reunioes')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState(false)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  /* chat */
  const [chatOpen, setChatOpen] = useState(true)
  const [chatMode, setChatMode] = useState<'q' | 'i'>('q')
  const [chatClient, setChatClient] = useState<string>('')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /* settings modal */
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'team' | 'clients'>('team')
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')

  const active = clients.find(c => c.id === activeId)

  /* ─── load data ─── */
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, tRes, mRes] = await Promise.all([
        fetch('/api/clients').then(r => r.json()),
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/team').then(r => r.json()),
      ])
      const clientArr: Client[] = Array.isArray(cRes) ? cRes : []
      const taskArr: Task[] = Array.isArray(tRes) ? tRes : []
      setClients(clientArr)
      setTasks(taskArr)
      setTeam(Array.isArray(mRes) ? mRes : [])
      if (clientArr.length > 0 && !activeId) setActiveId(clientArr[0].id)

      // build insights from tasks that have meeting_insight attached
      const insightMap: Record<string, Insight> = {}
      taskArr.forEach(t => {
        if (t.meeting_insight_id && t.client_meeting_insights) {
          const key = t.meeting_insight_id
          if (!insightMap[key]) {
            insightMap[key] = {
              id: key,
              client_id: t.client_id,
              doc_name: t.client_meeting_insights.doc_name,
              meeting_date: t.client_meeting_insights.meeting_date,
              key_decisions: [],
              open_items: [],
              context: null,
              tasks: [],
            }
          }
          insightMap[key].tasks!.push(t)
        }
      })
      setInsights(Object.values(insightMap))
    } finally {
      setLoading(false)
    }
  }, [activeId])

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  /* ─── sync ─── */
  async function doSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) setSyncMsg(`Erro: ${data.error}`)
      else if (data.message) setSyncMsg(data.message)
      else setSyncMsg(`${data.synced} reunião(ões) sincronizada(s), ${data.tasks_created ?? 0} tarefa(s) criada(s)`)
      await loadAll()
    } catch (e: any) {
      setSyncMsg(`Erro: ${e.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 6000)
    }
  }

  /* ─── task update ─── */
  async function updateTask(id: string, patch: Partial<Task>) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  /* ─── client update ─── */
  async function updateClient(id: string, patch: Partial<Client>) {
    await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  /* ─── team ─── */
  async function addMember() {
    if (!newMemberName.trim()) return
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newMemberName.trim(), role: newMemberRole.trim() || null }),
    })
    const m = await res.json()
    setTeam(prev => [...prev, m])
    setNewMemberName(''); setNewMemberRole('')
  }

  async function deleteMember(id: string) {
    await fetch(`/api/team/${id}`, { method: 'DELETE' })
    setTeam(prev => prev.filter(m => m.id !== id))
  }

  /* ─── chat ─── */
  async function sendChat() {
    const msg = input.trim()
    if (!msg || chatLoading) return
    setInput('')
    const userMsg: ChatMsg = { role: 'user', text: msg }
    setMsgs(prev => [...prev, userMsg])
    setChatLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          mode: chatMode,
          clientId: chatMode === 'i' && chatClient ? chatClient : undefined,
        }),
      })
      const data = await res.json()
      const clientName = chatMode === 'i' && chatClient
        ? clients.find(c => c.id === chatClient)?.name
        : undefined
      setMsgs(prev => [...prev, {
        role: 'ai',
        text: data.reply || data.error || 'Sem resposta.',
        noteFor: clientName,
      }])
    } catch {
      setMsgs(prev => [...prev, { role: 'ai', text: 'Erro ao conectar.' }])
    } finally {
      setChatLoading(false)
    }
  }

  /* ─── derived ─── */
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const clientTasks = activeId ? tasks.filter(t => t.client_id === activeId) : []
  const pendingTasks = clientTasks.filter(t => t.status !== 'concluida')
  const doneTasks = clientTasks.filter(t => t.status === 'concluida')

  const clientInsights = insights.filter(i => i.client_id === activeId)
  const allPending = tasks.filter(t => t.status !== 'concluida').length

  /* ─── collapse helpers ─── */
  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }
  function collapseAll() { setCollapsed(new Set(clientInsights.map(i => i.id))) }
  function expandAll() { setCollapsed(new Set()) }
  const allCollapsed = clientInsights.length > 0 && clientInsights.every(i => collapsed.has(i.id))

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--t2)', fontFamily: 'var(--mo)', fontSize: 13 }}>
      Carregando…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── HEADER ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px',
        height: 50, background: 'var(--surf)', borderBottom: '1px solid var(--bd)',
        flexShrink: 0, boxShadow: 'var(--sh)', zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'linear-gradient(135deg,#E09000,#C67900)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#fff',
          }}>𓂀</div>
          <span style={{ fontFamily: 'var(--ff)', fontSize: 13, fontWeight: 700, letterSpacing: '-.3px' }}>
            Segundo Cérebro
          </span>
          <span style={{ fontFamily: 'var(--mo)', fontSize: 9.5, color: 'var(--t3)', background: 'var(--s2)', padding: '1px 6px', borderRadius: 20, marginLeft: 2 }}>
            beta
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {syncMsg && (
          <span style={{ fontFamily: 'var(--mo)', fontSize: 11, color: 'var(--gr-t)', background: 'var(--gr-s)', padding: '3px 10px', borderRadius: 20 }}>
            {syncMsg}
          </span>
        )}
        <span style={{ fontFamily: 'var(--mo)', fontSize: 10, color: 'var(--t3)' }}>
          {allPending} pendente{allPending !== 1 ? 's' : ''}
        </span>
        {/* sync button */}
        <button
          onClick={doSync}
          disabled={syncing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--am)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
            opacity: syncing ? .6 : 1, transition: 'opacity var(--r)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            style={{ animation: syncing ? 'spin .75s linear infinite' : 'none' }}>
            <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
          </svg>
          {syncing ? 'Sincronizando…' : 'Sincronizar'}
        </button>
        {/* chat toggle */}
        <button
          onClick={() => setChatOpen(v => !v)}
          title="Chat"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: chatOpen ? 'var(--in-s)' : 'none',
            border: `1px solid ${chatOpen ? 'var(--in)' : 'var(--bd)'}`,
            color: chatOpen ? 'var(--in)' : 'var(--t2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background var(--r), color var(--r)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </button>
        {/* settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Configurações"
          style={{
            width: 32, height: 32, borderRadius: 8, background: 'none',
            border: '1px solid var(--bd)', color: 'var(--t2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
        </button>
      </header>

      {/* ── SHELL ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: 230, flexShrink: 0, background: 'var(--s2)',
          borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--mo)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--t3)', flex: 1 }}>Clientes</span>
            <span style={{ fontFamily: 'var(--mo)', fontSize: 10, background: 'var(--bd)', color: 'var(--t2)', padding: '1px 7px', borderRadius: 20 }}>
              {filteredClients.length}
            </span>
          </div>
          <div style={{
            margin: '0 10px 8px', display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 9, padding: '6px 10px',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 12, color: 'var(--tx)', minWidth: 0,
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 14px' }}>
            {filteredClients.map(c => {
              const pend = tasks.filter(t => t.client_id === c.id && t.status !== 'concluida').length
              const isActive = c.id === activeId
              return (
                <div
                  key={c.id}
                  onClick={() => { setActiveId(c.id); setActiveTab('reunioes') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                    background: isActive ? 'var(--surf)' : 'transparent',
                    boxShadow: isActive ? 'var(--sh)' : 'none',
                    position: 'relative', transition: 'background var(--r)',
                    borderLeft: isActive ? '3px solid var(--am)' : '3px solid transparent',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: avclr(c.name), display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: 'var(--mo)', fontSize: 10.5,
                    fontWeight: 500, color: '#fff',
                  }}>
                    {initials(c.name)}
                  </div>
                  <span style={{
                    fontSize: 12.5, fontWeight: isActive ? 600 : 500, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isActive ? 'var(--am-t)' : 'var(--tx)',
                  }}>{c.name}</span>
                  {pend > 0 && (
                    <span style={{
                      fontFamily: 'var(--mo)', fontSize: 9.5, padding: '1.5px 7px',
                      borderRadius: 20, background: 'var(--am-s)', color: 'var(--am-t)', fontWeight: 500,
                    }}>{pend}</span>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surf)' }}>
          {active ? (
            <>
              {/* client header */}
              <div style={{ padding: '22px 24px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: avclr(active.name), display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: 'var(--mo)', fontSize: 13,
                    fontWeight: 500, color: '#fff',
                  }}>
                    {initials(active.name)}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--ff)', fontSize: 20, fontWeight: 700, letterSpacing: '-.5px', lineHeight: 1.2 }}>
                      {active.name}
                    </div>
                    {active.segment && (
                      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{active.segment}</div>
                    )}
                  </div>
                  {active.tag && (
                    <span style={{
                      marginLeft: 4, fontFamily: 'var(--mo)', fontSize: 10, padding: '2px 8px',
                      borderRadius: 20, background: 'var(--in-s)', color: 'var(--in-t)',
                    }}>{active.tag}</span>
                  )}
                </div>
                {/* stat row */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  {[
                    { n: clientInsights.length, l: 'reuniões', cls: '' },
                    { n: pendingTasks.length, l: 'pendentes', cls: pendingTasks.length > 0 ? 'warn' : '' },
                    { n: doneTasks.length, l: 'concluídas', cls: doneTasks.length > 0 ? 'done' : '' },
                    ...(active.budget ? [{ n: active.budget, l: 'budget', cls: 'info' }] : []),
                  ].map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 12px',
                    }}>
                      <span style={{
                        fontFamily: 'var(--mo)', fontWeight: 500,
                        color: s.cls === 'warn' ? 'var(--am-t)' : s.cls === 'done' ? 'var(--gr-t)' : s.cls === 'info' ? 'var(--in-t)' : 'var(--tx)',
                      }}>{s.n}</span>
                      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{s.l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* tabs */}
              <div style={{
                padding: '0 24px', borderBottom: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center', gap: 0,
                background: 'var(--surf)', position: 'sticky', top: 0, zIndex: 10,
              }}>
                {(['reunioes', 'tarefas', 'notas'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 18px 11px', fontSize: 12.5, fontWeight: activeTab === tab ? 600 : 500,
                      color: activeTab === tab ? 'var(--am)' : 'var(--t2)',
                      border: 'none', background: 'none',
                      borderBottom: `2px solid ${activeTab === tab ? 'var(--am)' : 'transparent'}`,
                      marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap',
                      transition: 'color var(--r)',
                    }}
                  >
                    {tab === 'reunioes' ? 'Reuniões' : tab === 'tarefas' ? 'Tarefas' : 'Notas'}
                    {tab === 'tarefas' && pendingTasks.length > 0 && (
                      <span style={{
                        fontFamily: 'var(--mo)', fontSize: 9.5, padding: '1px 6px',
                        borderRadius: 20, background: 'var(--am-s)', color: 'var(--am-t)',
                      }}>{pendingTasks.length}</span>
                    )}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                {activeTab === 'reunioes' && clientInsights.length > 1 && (
                  <button
                    onClick={allCollapsed ? expandAll : collapseAll}
                    style={{
                      fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none',
                      padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                      fontFamily: 'var(--mo)',
                    }}
                  >
                    {allCollapsed ? '⊕ Expandir tudo' : '⊖ Recolher tudo'}
                  </button>
                )}
              </div>

              {/* tab content */}
              <div style={{ padding: '20px 24px', flex: 1 }}>

                {/* ── REUNIÕES ── */}
                {activeTab === 'reunioes' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {clientInsights.length === 0 && (
                      <div style={{ color: 'var(--t3)', fontSize: 13, padding: '24px 0' }}>
                        Nenhuma reunião sincronizada para este cliente ainda.
                      </div>
                    )}
                    {clientInsights.map((ins, idx) => {
                      const isCollapsed = collapsed.has(ins.id)
                      const insTasks = tasks.filter(t => t.meeting_insight_id === ins.id)
                      return (
                        <div key={ins.id} style={{
                          border: '1px solid var(--bd)', borderRadius: 12,
                          background: 'var(--surf)', overflow: 'hidden',
                          boxShadow: idx === 0 ? 'var(--sh)' : 'none',
                        }}>
                          {/* meeting header */}
                          <div
                            onClick={() => toggleCollapse(ins.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '12px 16px', cursor: 'pointer',
                              borderBottom: isCollapsed ? 'none' : '1px solid var(--bd)',
                              background: isCollapsed ? 'var(--s2)' : 'var(--surf)',
                              transition: 'background var(--r)',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ins.doc_name}
                              </div>
                              {ins.meeting_date && (
                                <div style={{ fontFamily: 'var(--mo)', fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                                  {fmtDate(ins.meeting_date)}
                                </div>
                              )}
                            </div>
                            {insTasks.length > 0 && (
                              <span style={{
                                fontFamily: 'var(--mo)', fontSize: 9.5, padding: '1.5px 7px',
                                borderRadius: 20, background: 'var(--am-s)', color: 'var(--am-t)', fontWeight: 500,
                              }}>{insTasks.filter(t => t.status !== 'concluida').length} tarefa{insTasks.length !== 1 ? 's' : ''}</span>
                            )}
                            <svg
                              width="14" height="14" viewBox="0 0 24 24" fill="none"
                              stroke="var(--t3)" strokeWidth="2"
                              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform var(--r)', flexShrink: 0 }}
                            >
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </div>
                          {/* meeting body */}
                          {!isCollapsed && (
                            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                              {ins.context && (
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
                                  {ins.context}
                                </p>
                              )}
                              {ins.key_decisions.length > 0 && (
                                <div>
                                  <div style={{ fontFamily: 'var(--mo)', fontSize: 10, color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                    Decisões
                                  </div>
                                  <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {ins.key_decisions.map((d, i) => (
                                      <li key={i} style={{ fontSize: 13, color: 'var(--tx)' }}>{d}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {insTasks.length > 0 && (
                                <div>
                                  <div style={{ fontFamily: 'var(--mo)', fontSize: 10, color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                    Tarefas geradas
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {insTasks.map(t => (
                                      <TaskRow key={t.id} task={t} team={team} onUpdate={updateTask} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── TAREFAS ── */}
                {activeTab === 'tarefas' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pendingTasks.length === 0 && doneTasks.length === 0 && (
                      <div style={{ color: 'var(--t3)', fontSize: 13, padding: '24px 0' }}>
                        Nenhuma tarefa para este cliente.
                      </div>
                    )}
                    {pendingTasks.map(t => (
                      <TaskRow key={t.id} task={t} team={team} onUpdate={updateTask} />
                    ))}
                    {doneTasks.length > 0 && (
                      <>
                        <button
                          onClick={() => setShowDone(v => !v)}
                          style={{
                            background: 'none', border: 'none', color: 'var(--t3)',
                            fontFamily: 'var(--mo)', fontSize: 11, cursor: 'pointer',
                            padding: '6px 0', textAlign: 'left',
                          }}
                        >
                          {showDone ? '▲' : '▼'} Ver {doneTasks.length} concluída{doneTasks.length !== 1 ? 's' : ''}
                        </button>
                        {showDone && doneTasks.map(t => (
                          <TaskRow key={t.id} task={t} team={team} onUpdate={updateTask} />
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* ── NOTAS ── */}
                {activeTab === 'notas' && (
                  <NotesTab clientId={active.id} />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
              Selecione um cliente
            </div>
          )}
        </main>

        {/* ── CHAT ── */}
        <aside style={{
          width: chatOpen ? 320 : 0,
          flexShrink: 0,
          background: 'var(--s2)',
          borderLeft: '1px solid var(--bd)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width .22s ease',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 320 }}>
            {/* chat header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Chat</div>
              {/* mode toggle */}
              <div style={{
                display: 'flex', background: 'var(--bd)', borderRadius: 8, padding: 2, gap: 2,
              }}>
                {([['q', 'Consultar'], ['i', 'Informar']] as const).map(([m, l]) => (
                  <button
                    key={m}
                    onClick={() => setChatMode(m)}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                      background: chatMode === m ? (m === 'i' ? 'var(--am)' : 'var(--in)') : 'transparent',
                      color: chatMode === m ? '#fff' : 'var(--t2)',
                      transition: 'background var(--r), color var(--r)',
                    }}
                  >{l}</button>
                ))}
              </div>
              {chatMode === 'i' && (
                <select
                  value={chatClient}
                  onChange={e => setChatClient(e.target.value)}
                  style={{
                    width: '100%', marginTop: 8, padding: '6px 8px', borderRadius: 7,
                    border: '1px solid var(--bd)', background: 'var(--surf)', color: 'var(--tx)',
                    fontSize: 12,
                  }}
                >
                  <option value="">— cliente (opcional) —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            {/* messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msgs.length === 0 && (
                <div style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
                  {chatMode === 'q'
                    ? 'Pergunte sobre qualquer cliente, tarefa ou reunião.'
                    : 'Adicione uma nota, contexto ou informação sobre um cliente.'}
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} style={{
                  padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user'
                    ? 'var(--in-s)' : m.noteFor
                      ? 'var(--am-s)' : 'var(--surf)',
                  color: m.role === 'user' ? 'var(--in-t)' : 'var(--tx)',
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%', border: '1px solid var(--bd)',
                }}>
                  {m.noteFor && (
                    <div style={{ fontFamily: 'var(--mo)', fontSize: 9.5, color: 'var(--am-t)', marginBottom: 4 }}>
                      Nota → {m.noteFor}
                    </div>
                  )}
                  {m.text}
                </div>
              ))}
              {chatLoading && (
                <div style={{
                  padding: '9px 12px', borderRadius: 10, fontSize: 13,
                  background: 'var(--surf)', border: '1px solid var(--bd)',
                  color: 'var(--t3)', alignSelf: 'flex-start',
                }}>…</div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* input */}
            <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
              <div style={{
                display: 'flex', gap: 6, background: 'var(--surf)',
                border: '1px solid var(--bd)', borderRadius: 10, padding: '6px 8px',
              }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder={chatMode === 'q' ? 'Pergunte sobre qualquer cliente…' : 'Descreva a informação ou contexto…'}
                  rows={2}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    fontSize: 12, color: 'var(--tx)', resize: 'none', lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={sendChat}
                  disabled={chatLoading || !input.trim()}
                  style={{
                    alignSelf: 'flex-end', width: 30, height: 30, borderRadius: 8, border: 'none',
                    background: chatMode === 'i' ? 'var(--am)' : 'var(--in)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: chatLoading || !input.trim() ? .4 : 1,
                    transition: 'opacity var(--r)',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── SETTINGS MODAL ── */}
      {settingsOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div style={{
            width: 600, maxWidth: '92vw', maxHeight: '80vh',
            background: 'var(--surf)', borderRadius: 16, boxShadow: 'var(--sh2)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--ff)', fontSize: 15, fontWeight: 700, flex: 1 }}>Configurações</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--t2)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            {/* modal tabs */}
            <div style={{ display: 'flex', padding: '10px 22px 0', borderBottom: '1px solid var(--bd)', gap: 0 }}>
              {(['team', 'clients'] as const).map(t => (
                <button key={t} onClick={() => setSettingsTab(t)} style={{
                  padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: settingsTab === t ? 600 : 400,
                  color: settingsTab === t ? 'var(--am)' : 'var(--t2)',
                  borderBottom: `2px solid ${settingsTab === t ? 'var(--am)' : 'transparent'}`,
                  marginBottom: -1,
                }}>
                  {t === 'team' ? 'Equipe' : 'Clientes'}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 22px' }}>
              {settingsTab === 'team' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                    {team.map(m => (
                      <div key={m.id} style={{
                        border: '1px solid var(--bd)', borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%', background: avclr(m.name),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--mo)', fontSize: 11, color: '#fff', fontWeight: 500,
                          }}>{initials(m.name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                            {m.role && <div style={{ fontSize: 11, color: 'var(--t2)' }}>{m.role}</div>}
                          </div>
                          <button onClick={() => deleteMember(m.id)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16 }}>×</button>
                        </div>
                        {m.email && <div style={{ fontFamily: 'var(--mo)', fontSize: 10.5, color: 'var(--t3)' }}>{m.email}</div>}
                      </div>
                    ))}
                  </div>
                  {/* add member */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      placeholder="Nome"
                      style={{
                        flex: 2, minWidth: 120, padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 12,
                      }}
                    />
                    <input
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value)}
                      placeholder="Cargo"
                      style={{
                        flex: 1, minWidth: 80, padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 12,
                      }}
                    />
                    <button
                      onClick={addMember}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: 'var(--am)', color: '#fff', fontSize: 12, fontWeight: 600,
                      }}
                    >Adicionar</button>
                  </div>
                </div>
              )}
              {settingsTab === 'clients' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {clients.map(c => (
                    <div key={c.id} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: avclr(c.name),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--mo)', fontSize: 9.5, color: '#fff',
                        }}>{initials(c.name)}</div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                        {c.segment && <span style={{ fontSize: 11, color: 'var(--t2)' }}>{c.segment}</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { key: 'contact', label: 'Contato', val: c.contact || '' },
                          { key: 'phone', label: 'Telefone', val: c.phone || '' },
                          { key: 'budget', label: 'Budget', val: c.budget || '' },
                          { key: 'tag', label: 'Tag', val: c.tag || '' },
                        ].map(f => (
                          <div key={f.key}>
                            <label style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mo)', display: 'block', marginBottom: 3 }}>
                              {f.label}
                            </label>
                            <input
                              defaultValue={f.val}
                              onBlur={e => updateClient(c.id, { [f.key]: e.target.value || null })}
                              style={{
                                width: '100%', padding: '5px 8px', borderRadius: 7,
                                border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 12,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mo)', display: 'block', marginBottom: 3 }}>
                          Observações
                        </label>
                        <textarea
                          defaultValue={c.notes || ''}
                          onBlur={e => updateClient(c.id, { notes: e.target.value || null })}
                          rows={2}
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 7, resize: 'vertical',
                            border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 12,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

/* ─── TaskRow component ─── */
function TaskRow({
  task, team, onUpdate
}: {
  task: Task
  team: TeamMember[]
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void>
}) {
  const PRIO_CLR: Record<string, { bg: string; tx: string }> = {
    alta: { bg: 'var(--rd-s)', tx: 'var(--rd-t)' },
    media: { bg: 'var(--am-s)', tx: 'var(--am-t)' },
    baixa: { bg: 'var(--gr-s)', tx: 'var(--gr-t)' },
  }
  const isDone = task.status === 'concluida'
  const pClr = PRIO_CLR[task.priority] || PRIO_CLR.media

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
      border: '1px solid var(--bd)', borderRadius: 10,
      background: isDone ? 'var(--s2)' : 'var(--surf)',
      opacity: isDone ? .65 : 1,
    }}>
      {/* done checkbox */}
      <button
        onClick={() => onUpdate(task.id, { status: isDone ? 'pendente' : 'concluida' })}
        style={{
          width: 18, height: 18, borderRadius: 5, marginTop: 1, flexShrink: 0,
          border: `1.5px solid ${isDone ? 'var(--gr)' : 'var(--bd)'}`,
          background: isDone ? 'var(--gr)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11,
        }}
      >
        {isDone && '✓'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* editable title */}
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={e => {
            const val = e.currentTarget.textContent?.trim()
            if (val && val !== task.title) onUpdate(task.id, { title: val })
          }}
          style={{
            fontSize: 13, fontWeight: 500, outline: 'none',
            textDecoration: isDone ? 'line-through' : 'none',
            color: isDone ? 'var(--t2)' : 'var(--tx)',
          }}
        >
          {task.title}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--mo)', fontSize: 9.5, padding: '1.5px 7px', borderRadius: 20,
            background: pClr.bg, color: pClr.tx, fontWeight: 500,
          }}>{PRIO_LABEL[task.priority]}</span>
          {task.deadline && (
            <span style={{ fontFamily: 'var(--mo)', fontSize: 10, color: 'var(--t3)' }}>
              {fmtDate(task.deadline)}
            </span>
          )}
          {task.client_meeting_insights && (
            <span style={{
              fontFamily: 'var(--mo)', fontSize: 9.5, color: 'var(--in-t)',
              background: 'var(--in-s)', padding: '1px 6px', borderRadius: 20,
            }}>
              {task.client_meeting_insights.doc_name}
            </span>
          )}
        </div>
      </div>
      {/* responsible select */}
      {team.length > 0 && (
        <select
          value={task.responsible || ''}
          onChange={e => onUpdate(task.id, { responsible: e.target.value || null })}
          style={{
            fontSize: 11, border: '1px solid var(--bd)', borderRadius: 6,
            padding: '3px 6px', background: 'var(--s2)', color: 'var(--t2)',
            flexShrink: 0,
          }}
        >
          <option value="">—</option>
          {team.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      )}
    </div>
  )
}

/* ─── NotesTab component ─── */
function NotesTab({
  clientId,
}: {
  clientId: string
}) {
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/notes/${clientId}`)
      .then(r => r.json())
      .then(d => setNotes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [clientId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {loading && <div style={{ color: 'var(--t3)', fontSize: 13 }}>Carregando notas…</div>}
      {!loading && notes.length === 0 && (
        <div style={{ color: 'var(--t3)', fontSize: 13, padding: '16px 0' }}>
          Nenhuma nota. Use o chat em modo "Informar" para adicionar notas sobre este cliente.
        </div>
      )}
      {notes.map((n: any) => (
        <div key={n.id} style={{
          border: '1px solid var(--am-s)', borderRadius: 10, padding: '12px 14px',
          background: 'var(--am-s)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.6 }}>{n.content}</div>
          <div style={{ fontFamily: 'var(--mo)', fontSize: 10, color: 'var(--am)', marginTop: 6 }}>
            {n.source} · {new Date(n.created_at).toLocaleDateString('pt-BR')}
          </div>
        </div>
      ))}
    </div>
  )
}
