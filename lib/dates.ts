// Data da reunião a partir dos nomes do Drive ("... - 2026/10/13 17:30 GMT-03:00").
// Devolve YYYY-MM-DD ou null. Aceita vários nomes e usa o primeiro que tiver data.
export function parseMeetingDate(...names: (string | null | undefined)[]): string | null {
  for (const name of names) {
    const m = name?.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
  }
  return null
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA' sem passar por Date (evita deslocar o dia por fuso).
export function formatDateBR(date: string | null | undefined): string {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'sem data'
}
