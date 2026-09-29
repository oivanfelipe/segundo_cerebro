import Groq from 'groq-sdk'

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'placeholder-build-only' })

export const MODEL = 'llama-3.3-70b-versatile'

export interface MeetingAnalysis {
  overall_summary: string
  participants: string | null
  meeting_date: string | null
  clients: {
    name: string
    context_summary: string
    key_decisions: string[]
    open_items: string[]
  }[]
}

function extractJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as T
    throw new Error('Groq retornou um JSON inválido')
  }
}

// Analisa o conteúdo de uma reunião: resumo geral + clientes mencionados (toda reunião é
// escaneada por conteúdo, sem distinção entre reunião "interna" e "de cliente" — ver PRD).
export async function analyzeMeeting(
  content: string,
  knownClients: string[]
): Promise<MeetingAnalysis> {
  const prompt = `Você é um assistente que organiza o histórico de reuniões de um profissional de growth/marketing que atende múltiplos clientes de agência.

Analise o conteúdo de reunião abaixo (pode incluir participantes, resumo, decisões, próximas etapas e transcrição bruta) e extraia informações estruturadas.

Lista de clientes conhecidos (a reunião pode mencionar zero, um ou vários destes clientes — nunca invente um cliente fora desta lista):
${knownClients.join(', ')}

Conteúdo da reunião:
${content.slice(0, 100000)}

Retorne APENAS um JSON válido (sem markdown, sem explicação) com esta estrutura exata:
{
  "overall_summary": "resumo geral da reunião inteira, 2-4 frases",
  "participants": "lista de participantes separados por vírgula, ou null",
  "meeting_date": "YYYY-MM-DD ou null",
  "clients": [
    {
      "name": "nome do cliente EXATAMENTE como está na lista conhecida",
      "context_summary": "o que foi discutido especificamente sobre este cliente (2-4 frases, só a parte relevante a ele)",
      "key_decisions": ["decisão 1 sobre este cliente", "decisão 2"],
      "open_items": ["pendência/próxima etapa 1 sobre este cliente"]
    }
  ]
}

Se nenhum cliente da lista foi mencionado, retorne "clients": [].`

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 4096,
  })

  const raw = completion.choices[0]?.message?.content || '{}'
  return extractJson<MeetingAnalysis>(raw)
}

export interface ClientHistoryEntry {
  meeting_date: string | null
  context_summary: string
  key_decisions: string[]
  open_items: string[]
}

// Reescreve o resumo geral acumulado de um cliente a partir de todo o histórico de
// reuniões conhecido até agora (chamado sempre que um novo insight é criado ou reatribuído).
export async function regenerateAccumulatedSummary(
  clientName: string,
  history: ClientHistoryEntry[]
): Promise<string> {
  if (history.length === 0) return ''

  const sorted = [...history].sort((a, b) =>
    (a.meeting_date || '').localeCompare(b.meeting_date || '')
  )

  const historyText = sorted
    .map(
      (h) =>
        `[${h.meeting_date || 'data desconhecida'}] ${h.context_summary}\nDecisões: ${
          h.key_decisions.join('; ') || 'nenhuma'
        }\nPendências: ${h.open_items.join('; ') || 'nenhuma'}`
    )
    .join('\n\n')

  const prompt = `Você mantém um resumo geral vivo do cliente "${clientName}" para um profissional de growth/marketing que precisa se atualizar rapidamente antes de uma reunião.

Histórico de reuniões deste cliente, em ordem cronológica:
${historyText}

Escreva um resumo geral acumulado (4-8 frases) que capture: o estado atual do relacionamento/projeto, os principais temas recorrentes, decisões que ainda valem hoje (ignore decisões claramente substituídas por decisões posteriores) e pendências ainda em aberto. Não liste reunião por reunião — sintetize. Responda só com o texto do resumo, sem markdown, sem título.`

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1024,
  })

  return completion.choices[0]?.message?.content?.trim() || ''
}
