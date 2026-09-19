import Groq from 'groq-sdk'

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export const MODEL = 'llama-3.3-70b-versatile'

export interface MeetingAnalysis {
  clients: {
    name: string
    summary: string
    key_decisions: string[]
    action_items: { title: string; priority: 'alta' | 'media' | 'baixa'; deadline?: string }[]
  }[]
  participants: string
  meeting_date: string | null
  overall_summary: string
}

export async function analyzeMeeting(
  transcriptText: string,
  knownClients: string[]
): Promise<MeetingAnalysis> {
  const prompt = `Você é um assistente especializado em marketing de performance. Analise a transcrição de reunião abaixo e extraia informações estruturadas.

Clientes conhecidos: ${knownClients.join(', ')}

Transcrição:
${transcriptText.slice(0, 80000)}

Retorne APENAS um JSON válido (sem markdown, sem explicação) com esta estrutura exata:
{
  "clients": [
    {
      "name": "nome do cliente conforme lista conhecida",
      "summary": "resumo do que foi discutido sobre este cliente (2-4 frases)",
      "key_decisions": ["decisão 1", "decisão 2"],
      "action_items": [
        {
          "title": "o que precisa ser feito (ação clara e objetiva)",
          "priority": "alta|media|baixa",
          "deadline": "YYYY-MM-DD ou null"
        }
      ]
    }
  ],
  "participants": "lista de participantes separados por vírgula",
  "meeting_date": "YYYY-MM-DD ou null",
  "overall_summary": "resumo geral da reunião em 1-2 frases"
}`

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 4096,
  })

  const raw = completion.choices[0]?.message?.content || '{}'

  try {
    return JSON.parse(raw) as MeetingAnalysis
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as MeetingAnalysis
    throw new Error('Groq returned invalid JSON')
  }
}

export async function chatWithContext(
  question: string,
  context: string
): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `Você é o assistente de marketing do Ivan Felipe. Responda de forma direta, objetiva e prática sobre clientes, tarefas e reuniões. Use os dados fornecidos como contexto. Sempre em português.`,
      },
      {
        role: 'user',
        content: `Contexto atual:\n${context}\n\nPergunta: ${question}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 1024,
  })

  return completion.choices[0]?.message?.content || 'Sem resposta.'
}

export async function transcribeAudioNote(text: string, clientName: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `Organize e estruture esta nota sobre o cliente "${clientName}" de forma clara e objetiva. Mantenha todas as informações relevantes. Texto original: ${text}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 512,
  })

  return completion.choices[0]?.message?.content || text
}
