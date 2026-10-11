import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleAuthCode } from '@/lib/google'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const origin = req.nextUrl.origin

  if (error) {
    return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent('Código ausente.')}`)
  }

  try {
    await exchangeGoogleAuthCode(code)
    return NextResponse.redirect(`${origin}/?google_connected=1`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao conectar.'
    return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent(message)}`)
  }
}
