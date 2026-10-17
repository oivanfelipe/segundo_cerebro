import { OWNER_FIELDS, type Owners as OwnersData } from '@/lib/owners'

// Linha compacta "Gestor de projeto: Thay · Tráfego: Igor ..." — só mostra quem está preenchido.
export default function Owners({ owners, compact }: { owners: OwnersData; compact?: boolean }) {
  const filled = OWNER_FIELDS.filter((f) => owners[f.key])
  if (filled.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? '2px var(--sp-3)' : 'var(--sp-2) var(--sp-4)',
        fontSize: compact ? 12 : 13,
      }}
    >
      {filled.map((f) => (
        <span key={f.key}>
          <span style={{ color: 'var(--muted)' }}>{f.label}: </span>
          <strong>{owners[f.key]}</strong>
        </span>
      ))}
    </div>
  )
}
