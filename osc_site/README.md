# osc_site

Frontend **Next.js + React + TypeScript** untuk OmniSight.

- Memakai clean architecture frontend.
- Tidak mengakses database langsung.
- Peta menu, izin, dan relasi API dijelaskan di [dokumentasi frontend](../osc_docs/technical/frontend/README.md).
- WP-01 hanya menyediakan halaman landing placeholder dan katalog locale `en`/`id`.

## Perintah

```bash
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Pengembangan lokal memakai `npm run dev`. Konfigurasi `output: "standalone"`
tidak kompatibel dengan `next start`; pratinjau produksi dijalankan lewat image
Docker/Compose, yang menyalin `.next/standalone`, `.next/static`, dan memakai
`node server.js` sebagai user non-root `node`.

Status: scaffold WP-01.
