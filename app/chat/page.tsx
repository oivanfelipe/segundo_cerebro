import ChatPanel from './ChatPanel'

export default function ChatPage() {
  return (
    <div className="chat-page">
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <h1>CHAT</h1>
        <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--muted)' }}>
          Escreva ou grave um áudio: crie tarefas e consulte quantas existem por cliente ou pessoa.
        </p>
      </div>
      <ChatPanel />
    </div>
  )
}
