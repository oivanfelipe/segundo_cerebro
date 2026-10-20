import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { OWNER_FIELDS } from '@/lib/owners'
import { transcribeSpeech } from '@/lib/groq'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024 // limite de body das funções serverless da Vercel é ~4.5MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const audio = form.get('audio')
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: 'Áudio não enviado.' }, { status: 400 })
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Áudio muito longo. Grave até ~3 minutos.' }, { status: 413 })
    }

    // nomes de clientes e responsáveis ajudam o Whisper a escrever nomes próprios certo
    const { data } = await supabase
      .from('clients')
      .select('name, account_manager, social_media, traffic_manager, designer')
      .eq('status', 'active')
    const names = Array.from(
      new Set((data || []).flatMap((c) => [c.name, ...OWNER_FIELDS.map((f) => c[f.key])]).filter(Boolean))
    )
    const text = await transcribeSpeech(audio, names.length ? `Nomes: ${names.join(', ')}.` : undefined)

    if (!text) return NextResponse.json({ error: 'Não consegui entender o áudio.' }, { status: 422 })
    return NextResponse.json({ text })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
