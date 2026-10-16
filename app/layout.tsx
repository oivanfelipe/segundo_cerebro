import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Segundo Cérebro',
  description: 'Resumo de reuniões e compilado de clientes',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A1F44',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-shell">
          <nav className="app-nav">
            <Link href="/" className="app-brand display">
              SEGUNDO
              <br />
              CÉREBRO
            </Link>
            <div className="app-links">
              <NavLink href="/" label="Dashboard" />
              <NavLink href="/clients" label="Clientes" />
              <NavLink href="/meetings" label="Reuniões" />
            </div>
          </nav>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="eyebrow nav-link">
      {label}
    </Link>
  )
}
