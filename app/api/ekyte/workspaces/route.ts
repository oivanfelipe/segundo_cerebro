import { NextRequest, NextResponse } from 'next/server'
import { listWorkspaces } from '@/lib/ekyte'

export const dynamic = 'force-dynamic'

// Workspaces do Ekyte (um por cliente). ?search=<texto>
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await listWorkspaces(req.nextUrl.searchParams.get('search') || undefined))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao falar com o Ekyte.' }, { status: 502 })
  }
}
