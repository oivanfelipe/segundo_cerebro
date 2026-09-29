import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Segundo Cérebro',
  description: 'Resumo de reuniões e compilado de clientes',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <nav
            style={{
              width: 220,
              flexShrink: 0,
              background: 'var(--navy)',
              color: 'var(--white)',
              padding: 'var(--sp-6) var(--sp-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-2)',
            }}
          >
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div
                className="display"
                style={{ color: 'var(--white)', fontSize: 20, marginBottom: 'var(--sp-8)' }}
              >
                SEGUNDO
                <br />
                CÉREBRO
              </div>
            </Link>
            <NavLink href="/" label="Dashboard" />
            <NavLink href="/clients" label="Clientes" />
            <NavLink href="/meetings" label="Reuniões" />
          </nav>
          <main style={{ flex: 1, minWidth: 0, padding: 'var(--sp-8)' }}>{children}</main>
        </div>
      </body>
    </html>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="eyebrow"
      style={{
        display: 'block',
        color: 'var(--white)',
        textDecoration: 'none',
        padding: 'var(--sp-2) var(--sp-3)',
        borderRadius: 4,
      }}
    >
      {label}
    </Link>
  )
}
