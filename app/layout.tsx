import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Segundo Cérebro',
  description: 'Gestão de clientes e reuniões de marketing',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
