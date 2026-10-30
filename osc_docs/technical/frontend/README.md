# Frontend: osc_site

## 1. Tujuan

`osc_site` adalah portal OmniSight berbasis Next.js. Frontend:

- Menampilkan menu sesuai izin dan scope pengguna.
- Memanggil `osc_rest` melalui same-origin di belakang edge.
- Tidak mengakses database, vault, Docker socket, atau integrasi secara langsung.
- Tidak menyimpan token di `localStorage`.

## 2. Stack

| Kebutuhan | Pilihan |
|---|---|
| Framework | Next.js App Router |
| Bahasa | TypeScript strict |
| UI | React, Tailwind CSS, shadcn/ui |
| Data server | TanStack Query |
| Form | React Hook Form + Zod |
| Tabel | TanStack Table |
| Grafik | Recharts untuk ringkasan, uPlot untuk metrik padat |
| Testing | Vitest, Testing Library, Playwright, axe |
| i18n | `next-intl` dengan katalog `en` dan `id` |
| Client API | OpenAPI-generated TypeScript client |

Katalog locale mesin-terbaca ada di [../contracts/locales/frontend](../contracts/locales/frontend/) dan spesifikasi rute di [../contracts/openapi.json](../contracts/openapi.json). Keduanya disetujui bersama 0.6 (G0).

## 3. Clean architecture frontend

```text
src/
├── app/                  # Route, layout, server component
│   ├── (public)/
│   ├── (auth)/
│   ├── (portal)/
│   └── (admin)/
├── widgets/              # Komposisi UI lintas fitur (sidebar, header, dashboard)
├── features/             # Aksi pengguna (login, checkout aset, deploy, approval)
├── entities/             # Model dan UI entitas (asset, user, ticket)
├── shared/
│   ├── api/              # Client envelope, query keys, error mapping
│   ├── auth/             # Session, permission, scope
│   ├── config/           # Env non-rahasia
│   ├── i18n/             # Locale, message loader, formatter
│   ├── lib/              # Utilitas, format, sanitasi
│   └── ui/               # shadcn/ui dan primitif desain
└── styles/
```

Katalog terjemahan:

```text
messages/
├── en.json
└── id.json
```

Aturan dependensi:

- `app` boleh memakai `widgets`, `features`, `entities`, `shared`.
- `widgets` boleh memakai `features`, `entities`, `shared`.
- `features` boleh memakai `entities`, `shared`.
- `entities` boleh memakai `shared`.
- `shared` tidak boleh mengimpor dari lapisan atas.
- Tidak ada fetch langsung ke host eksternal dari komponen; semua lewat `shared/api`.

## 4. Route group

| Group | Contoh rute | Akses |
|---|---|---|
| `(public)` | `/`, `/blog`, `/status`, `/legal/privacy` | Publik |
| `(auth)` | `/login`, `/login/hris`, `/mfa` | Tanpa sesi |
| `(portal)` | `/dashboard`, `/assets`, `/monitoring` | Sesi + izin |
| `(admin)` | `/settings`, `/audit` | Peran admin/auditor |

Layout portal memuat:

- Sidebar berbasis izin.
- Header: pemilih perusahaan/area, pemilih bahasa, pencarian, notifikasi, profil.
- Breadcrumb dan module code (opsional untuk admin).
- Banner impersonasi bila aktif.

## 5. Pola akses API

Browser memanggil path same-origin:

```text
https://portal.example.com/api/v1/...
```

Edge meneruskan `/api/v1/*` ke `osc_rest`. Dengan demikian:

- Cookie `HttpOnly` bekerja tanpa CORS.
- CSRF dapat dilindungi dengan `SameSite` + token.
- Tidak ada token di JavaScript yang dapat dibaca.

Server Component yang membutuhkan data memakai `fetch` internal dengan cookie diteruskan. Client Component memakai TanStack Query ke same-origin.

## 6. Autentikasi frontend

1. Pengguna membuka `/login`.
2. Form memanggil `POST /api/v1/auth/login` atau `/auth/login/hris`.
3. Server menetapkan cookie `HttpOnly`.
4. Frontend memanggil `/auth/me` untuk profil, izin, scope, dan locale, lalu menulis cookie non-HttpOnly `OSC_LOCALE` sesuai locale pengguna.
5. Middleware hanya memeriksa keberadaan cookie sesi; validasi sebenarnya di server. Middleware juga menetapkan locale awal dari cookie `OSC_LOCALE`, lalu dari locale pengguna setelah `/auth/me`.
6. Jika 200 dengan kode `AA00-00-0002` (belum terautentikasi), arahkan ke login.
7. Logout memanggil endpoint logout dan membersihkan cache.

Aturan:

- Jangan menyimpan JWT/refresh token di `localStorage`, `sessionStorage`, atau state global yang persisten.
- Jangan menampilkan detail error autentikasi.
- MFA wajib untuk peran admin.
- Sesi yang dicabut harus memaksa login ulang pada request berikutnya.

## 7. Izin dan scope

`/auth/me` mengembalikan:

```json
{
  "user": { "id": "...", "display_name": "...", "locale": "en" },
  "permissions": ["AC:read", "AC:post"],
  "scope": {
    "company_id": "...",
    "areas": [{ "id": "...", "include_descendants": true }]
  }
}
```

Frontend:

- Menyembunyikan menu tanpa izin.
- Menonaktifkan tombol aksi tanpa izin.
- Menampilkan pesan ramah jika server menolak (`AA00-00-0003`).
- Selalu menganggap server sebagai penentu akhir.
- Tidak menyimpan keputusan izin di URL atau cookie yang dapat dimodifikasi.

Pemilih perusahaan/area:

- Daftar perusahaan berasal dari membership.
- Area mengikuti scope pengguna.
- Perubahan memanggil `POST /auth/context` dan menginvalidasi cache data.
- Request berikutnya mengirim `X-Company-Id` dan `X-Area-Id` yang divalidasi server.

## 8. State

| Jenis state | Alat |
|---|---|
| Data server | TanStack Query |
| Form | React Hook Form + Zod |
| Filter/pagination | URL search params |
| UI kecil (sidebar, modal) | Zustand atau state lokal |
| Sesi/izin | Server + context ringan |
| Locale | Cookie `OSC_LOCALE` + context server |

Aturan:

- Jangan menduplikasi data server ke store global.
- Query key memuat `company_id`, `area_id`, dan filter.
- Invalidasi cache setelah `post` yang mengubah data.
- Optimistic update hanya untuk aksi reversibel dan dengan rollback.

## 9. Penanganan envelope dan error

Semua respons sukses/gagal aplikasi adalah HTTP 200. Client wajib memeriksa `ok` dan `code`, bukan status HTTP saja.

```ts
type ApiEnvelope<T> = {
  ok: boolean;
  code: string;
  message: string;
  data: T | null;
  meta: {
    request_id: string;
    timestamp: string;
    next_cursor?: string | null;
    has_more?: boolean;
    retry_after_seconds?: number;
  };
  errors?: Array<{ field?: string; code?: string; reason: string }>;
};
```

Pemetaan:

| Kode | Perilaku UI |
|---|---|
| `AA00-00-0001` | Tampilkan error per field |
| `AA00-00-0002` | Redirect login |
| `AA00-00-0003` | Toast "Akses tidak tersedia" + request id |
| `AA00-00-0004` | Halaman data tidak ditemukan |
| `AA00-00-0005` | Minta muat ulang |
| `AA00-00-0006` | Tampilkan countdown retry |
| `AA00-00-0100` | Pesan generik + request id |
| `AA00-00-0900` | Pesan layanan sementara tidak tersedia |
| `AB-*` | Pesan login HRIS dari template |

Aturan:

- Jangan menampilkan stack trace, SQL, atau nama host.
- Tampilkan `request_id` pada error yang perlu dilaporkan.
- Jangan retry otomatis untuk `post` kecuali idempotent dan memakai `Idempotency-Key`.
- Client mengirim `Accept-Language` sesuai locale aktif pengguna.
- `message` dan `reason` dari server sudah terlokalisasi; jangan menerjemahkan ulang dengan cara menebak.
- Jika `message` kosong, tampilkan fallback dari katalog frontend berdasarkan `code`.

## 10. Internasionalisasi

- Bahasa yang didukung: `en` (default) dan `id`.
- Setiap pengguna dapat memilih bahasa; pilihan disimpan di `core.users.locale` melalui `PATCH /auth/me`.
- Setelah perubahan, frontend memperbarui cookie `OSC_LOCALE`, `Accept-Language`, dan cache terjemahan.
- Cookie `OSC_LOCALE` non-HttpOnly hanya menyimpan preferensi bahasa dan tidak dipakai untuk otorisasi.
- Server Component memakai `getLocale()` dan `getTranslations()` dari `next-intl`; Client Component memakai `useTranslations()`.
- Atribut `<html lang>` mengikuti locale aktif; hindari hydration mismatch dengan menentukan locale di server.
- Label, tombol, judul, pesan validasi, empty state, dan notifikasi UI berasal dari `messages/en.json` dan `messages/id.json`.
- Data pengguna (nama, judul tiket, isi artikel) tidak diterjemahkan otomatis.
- Tanggal, angka, dan mata uang diformat dengan `Intl`/formatter `next-intl`; API tetap mengirim ISO 8601 dan angka mentah.
- Kunci pesan stabil dan bersarang, misalnya `assets.checkout.confirm_title`; jangan memakai teks sebagai kunci.
- Gunakan plural/ICU untuk jumlah; jangan menyusun kalimat dengan penggabungan string.
- Terjemahan yang hilang jatuh ke `en`; CI memeriksa kesamaan kunci `en` dan `id`.
- Pesan keamanan dan error tetap generik di kedua bahasa; terjemahan tidak boleh menambah detail internal.
- Pemilih bahasa ada di header dan halaman profil; perubahan langsung terasa tanpa logout.

## 11. Desain UI

Spesifikasi rinci token, layout, komponen, layar kunci, dan pemetaan error ada di [spesifikasi-ui.md](spesifikasi-ui.md).

- shadcn/ui untuk komponen dasar.
- Tailwind token untuk warna, radius, spacing, dan dark mode.
- Bahasa Inggris default; bahasa Indonesia tersedia dan dapat dipilih per pengguna.
- Aksesibilitas WCAG AA: kontras, fokus terlihat, label form, navigasi keyboard.
- Tabel besar memakai server-side pagination berbasis cursor.
- Empty state, loading skeleton, dan error state konsisten.
- Konfirmasi untuk aksi sensitif, dengan alasan dan ringkasan dampak.
- Approval ditampilkan sebagai halaman khusus, bukan modal kecil.

## 12. Keamanan frontend

- CSP ketat melalui edge/Next headers.
- `dangerouslySetInnerHTML` hanya untuk konten tersanitasi server.
- Semua tautan eksternal memakai `rel="noopener noreferrer"`.
- Validasi redirect hanya ke path internal.
- File upload dibatasi jenis/ukuran dan dipindai server.
- Jangan menaruh konfigurasi rahasia di `NEXT_PUBLIC_*`.
- Dependency dipindai (`npm audit`, Dependabot/Renovate).
- Sanitasi markdown di server dan klien.
- Jangan memercayai data dari URL untuk otorisasi.
- Pesan terjemahan dirender sebagai teks, bukan HTML mentah; jangan memakai `dangerouslySetInnerHTML` untuk katalog i18n.
- Nilai terjemahan tidak boleh dipakai sebagai kunci otorisasi atau logika keamanan.

## 13. Performa

- Server Components untuk halaman baca.
- Streaming dan Suspense untuk dashboard.
- Code splitting per route.
- Cache data dengan TanStack Query dan `staleTime` sesuai jenis.
- Metrik padat memakai uPlot; hindari grafik ribuan titik di React.
- Gambar melalui `next/image`, ukuran tetap, dan format modern.
- Bundle analyzer di CI.

## 14. Testing

| Jenis | Cakupan |
|---|---|
| Unit | Utilitas, pemetaan kode error, permission helper |
| Component | Form, tabel, dialog approval |
| Integration | Alur login, ganti perusahaan, akses ditolak |
| E2E Playwright | Login, aset, deploy, approval, audit |
| Accessibility | axe pada halaman utama |
| i18n | Kesamaan kunci `en`/`id`, fallback, format tanggal/angka, pemilih bahasa |
| Security | XSS, open redirect, CSRF |

Definition of done frontend:

- Tidak ada `any` tanpa alasan.
- Semua form punya validasi server dan klien.
- Semua menu punya cek izin.
- Tidak ada token di storage browser.
- Kunci terjemahan `en` dan `id` sama; tidak ada teks UI yang ditulis langsung di komponen.
- Perubahan bahasa berlaku tanpa logout dan tidak menyebabkan hydration mismatch.
- E2E alur utama lulus.
- Lighthouse dan axe tidak menunjukkan masalah kritis.

## 15. Deployment

- Next.js standalone di container.
- Hanya edge yang mengekspos 443.
- `NEXT_PUBLIC_API_BASE=/api/v1`.
- `NEXT_PUBLIC_DEFAULT_LOCALE=en` dan `NEXT_PUBLIC_SUPPORTED_LOCALES=en,id`.
- Internal API URL untuk server component disimpan sebagai env non-publik.
- Tanpa akses database.
- Health endpoint internal untuk orchestrator.
- Log ke stdout, diambil oleh collector log.

## 16. Larangan

- Jangan memanggil `osc_rest` langsung ke host internal dari browser.
- Jangan menyimpan token di localStorage.
- Jangan menampilkan data di luar scope hanya karena disembunyikan di UI.
- Jangan menonaktifkan sanitasi markdown.
- Jangan memakai `window.location` untuk redirect tanpa validasi.
- Jangan menaruh secret di bundle.

Detail menu ada di [peta-menu.md](peta-menu.md), alur teknis di [alur-dan-arsitektur.md](alur-dan-arsitektur.md).

## 17. Dokumen terkait

- [Spesifikasi UI](spesifikasi-ui.md)
- [Fungsi frontend](../../qaqc/function/frontend/README.md)
- [Alur data frontend](../../qaqc/data-flow/frontend/README.md)
- [Unit test frontend](../../qaqc/unit-test/frontend/README.md)

