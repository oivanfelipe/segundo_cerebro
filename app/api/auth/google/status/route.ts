import { NextResponse } from 'next/server'
import { getGoogleConnectionStatus } from '@/lib/google'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getGoogleConnectionStatus())
}
