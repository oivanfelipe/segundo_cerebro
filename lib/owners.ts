// Quem cuida de cada cliente. A ordem aqui é a ordem em que aparece nas telas.
export const OWNER_FIELDS = [
  { key: 'account_manager', label: 'Gestor de projeto' },
  { key: 'social_media', label: 'Social' },
  { key: 'traffic_manager', label: 'Tráfego' },
  { key: 'designer', label: 'Designer' },
] as const

export type OwnerKey = (typeof OWNER_FIELDS)[number]['key']
export type Owners = Partial<Record<OwnerKey, string | null>>
