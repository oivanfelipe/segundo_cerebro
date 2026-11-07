import { NextResponse } from 'next/server'
import { listUsers } from '@/lib/ekyte'

export const dynamic = 'force-dynamic'

// Pessoas do Ekyte (possíveis executores).
export async function GET() {
  try {
    return NextResponse.json(await listUsers())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao falar com o Ekyte.' }, { status: 502 })
  }
}
