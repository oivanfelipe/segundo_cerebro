import { NextRequest, NextResponse } from 'next/server'
import { runAssistant, HistoryMsg } from '@/lib/assistant'

export const dynamic = 'force-dynamic'
// o chat() da Groq espera a janela de tokens/minuto liberar em caso de 429
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { message, history } = (await req.json()) as { message?: string; history?: HistoryMsg[] }
    if (!message?.trim()) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 })

    const result = await runAssistant(message.trim(), Array.isArray(history) ? history : [])
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
