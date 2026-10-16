import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ClientForm from '../../ClientForm'

export const dynamic = 'force-dynamic'

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const { data: client } = await supabase.from('clients').select('*').eq('id', params.id).single()

  if (!client) notFound()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <h1>EDITAR CLIENTE</h1>
      <ClientForm
        initial={{
          id: client.id,
          name: client.name,
          contact: client.contact || '',
          segment: client.segment || '',
          status: client.status,
        }}
      />
    </div>
  )
}
