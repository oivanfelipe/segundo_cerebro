import { NextResponse } from 'next/server'
import { getGoogleAuthUrl } from '@/lib/google'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.redirect(getGoogleAuthUrl())
}
