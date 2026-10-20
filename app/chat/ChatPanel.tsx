'use client'

import { useEffect, useRef, useState } from 'react'

type CreatedTask = { id: string; title: string; client_name: string }
type Msg = { role: 'user' | 'ai'; text: string; voice?: boolean; created?: CreatedTask[]; error?: boolean }

const SUGGESTIONS = [
  'Quantas tarefas abertas tem hoje?',
  'Cria uma tarefa pro cliente X: subir campanha de remarketing',
  'Quantas tarefas tem os clientes da Fulana?',
]

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

export default function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [secs, setSecs] = useState(0)

  const endRef = useRef<HTMLDivElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy, rec])

  useEffect(() => () => {
    clearInterval(timer.current)
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  async function send(text: string, voice = false) {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }))
    setMsgs((prev) => [...prev, { role: 'user', text: message, voice }])
    setBusy(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      setMsgs((prev) => [...prev, { role: 'ai', text: data.reply, created: data.created }])
    } catch (e) {
      setMsgs((prev) => [...prev, { role: 'ai', text: e instanceof Error ? e.message : 'Erro', error: true }])
    } finally {
      setBusy(false)
    }
  }

  function submit() {
    const t = input
    setInput('')
    send(t)
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickMime()
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        transcribe(new Blob(chunks.current, { type: r.mimeType || mime || 'audio/webm' }))
      }
      r.start()
      recorder.current = r
      setSecs(0)
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000)
      setRec('recording')
    } catch {
      setMsgs((prev) => [...prev, { role: 'ai', text: 'Não consegui acessar o microfone. Libere a permissão no navegador.', error: true }])
    }
  }

  function stopRec() {
    clearInterval(timer.current)
    setRec('transcribing')
    recorder.current?.stop()
  }

  async function transcribe(blob: Blob) {
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const form = new FormData()
      form.append('audio', new File([blob], `audio.${ext}`, { type: blob.type }))
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na transcrição')
      setRec('idle')
      await send(data.text, true)
    } catch (e) {
      setRec('idle')
      setMsgs((prev) => [...prev, { role: 'ai', text: e instanceof Error ? e.message : 'Erro na transcrição', error: true }])
    }
  }

  const recording = rec === 'recording'
  const disabled = busy || rec === 'transcribing'

  return (
    <div className="chat-box">
      <div className="chat-messages">
        {msgs.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', alignItems: 'center' }}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>Sugestões</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-secondary" style={{ fontSize: 13, padding: 'var(--sp-2) var(--sp-4)' }} onClick={() => setInput(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role === 'user' ? 'chat-msg-user' : ''}`}>
            <div className={`chat-bubble ${m.role === 'user' ? 'chat-bubble-user' : ''} ${m.error ? 'chat-bubble-error' : ''}`}>
              {m.error && <span className="tag" style={{ marginRight: 'var(--sp-2)' }}>Erro</span>}
              {m.voice && <span className="tag tag-active" style={{ marginRight: 'var(--sp-2)' }}>Áudio</span>}
              {m.text}
            </div>
            {m.created?.map((t) => (
              <div key={t.id} className="chat-bubble" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <span className="tag tag-active">Tarefa criada</span>
                <strong>{t.title}</strong>
                <span style={{ color: 'var(--muted)' }}>· {t.client_name}</span>
              </div>
            ))}
          </div>
        ))}

        {(busy || rec === 'transcribing') && (
          <div className="chat-msg">
            <div className="chat-bubble" style={{ color: 'var(--muted)' }}>
              {rec === 'transcribing' ? 'Transcrevendo áudio…' : 'Pensando…'}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-input">
        {recording ? (
          <div className="chat-recording">
            <span className="chat-dot" />
            <span className="eyebrow">Gravando {fmtTime(secs)}</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>clique em parar para enviar</span>
          </div>
        ) : (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Ex: cria tarefa pro cliente X: revisar criativos da semana"
            rows={2}
            disabled={disabled}
          />
        )}
        <button
          className={`btn ${recording ? 'btn-primary' : 'btn-secondary'}`}
          onClick={recording ? stopRec : startRec}
          disabled={disabled}
          title={recording ? 'Parar e enviar' : 'Gravar áudio'}
        >
          {recording ? 'Parar' : 'Gravar'}
        </button>
        {!recording && (
          <button className="btn btn-primary" onClick={submit} disabled={disabled || !input.trim()}>
            Enviar
          </button>
        )}
      </div>
    </div>
  )
}
