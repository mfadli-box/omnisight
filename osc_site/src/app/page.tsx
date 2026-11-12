import { Button } from '@/presentation/components/ui/button'

/**
 * Landing page — React Server Component (RSC) murni; tidak ada pemanggilan
 * backend saat build agar `next build` deterministik.
 * Halaman fitur (auth, excel) mengikuti pola: RSC + leaf component `'use client'`.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">omnisight</h1>
      <p className="max-w-md text-balance text-muted-foreground">
        Workspace multi-service: osc_site (Next.js + BFF proxy), osc_rest (Rust
        Clean API), osc_base (PostgreSQL), RustFS. Browser hanya berbicara
        dengan proxy internal — tidak pernah langsung ke Rust API.
      </p>
      <Button disabled title="Diimplementasikan pada fase auth">
        Masuk
      </Button>
    </main>
  )
}
