import ClientForm from '../ClientForm'

export default function NewClientPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <h1>ADICIONAR CLIENTE</h1>
      <ClientForm />
    </div>
  )
}
