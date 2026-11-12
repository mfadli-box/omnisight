import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'omnisight',
  description:
    'Workspace multi-service omnisight — Next.js BFF (osc_site) + Rust API (osc_rest)',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
