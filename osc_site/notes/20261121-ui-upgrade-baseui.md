# 2026-11-21 — Refactor UI OmniSight dan BFF

## Tujuan

Memisahkan UI, skema, state workspace, dan akses BFF pada Next.js 16 dengan
Tailwind v4. Pola sidebar, komposisi kartu, dan autentikasi split mengikuti
referensi Studio Admin dengan gaya visual OmniSight.
[Referensi Studio Admin](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui)

## Cakupan dan keputusan

- `components/ui/` menyediakan primitif gaya shadcn. Kontrol interaktif memakai
  Base UI dan notifikasi memakai Sonner. `components/layout/` memuat AppShell,
  sidebar compact dengan grup yang bisa dilipat, header, drawer mobile,
  pemilih company/area, dan tema terang/gelap.
- `components/features/` memisahkan CT01, OP01, OP02, KB01, RP01, RP02, dan
  SA01–SA04. Form memakai React Hook Form dan Zod. Tabel memakai TanStack Table
  untuk pengurutan pada halaman aktif. REST menyediakan paginasi.
- `validations/`, `services/`, dan `stores/` memisahkan kontrak data, klien BFF,
  dan state workspace. Hanya preferensi tema disimpan di browser. Company dan
  area aktif dipulihkan dari konteks sesi setelah verifikasi REST.
- Form login, OTP enam digit, backup code, dan pemulihan MFA memakai skema
  bersama dengan BFF. Payload PAM memakai field `reason` sesuai kontrak REST.
  Pengisian backup code mengikuti format 16 karakter heksadesimal yang
  diterbitkan backend.
- BFF memvalidasi JSON mutasi, memeriksa origin, dan meneruskan sesi ke REST
  di server. Cookie sesi dan challenge MFA memakai `HttpOnly`, `Secure`, dan
  `SameSite=Strict`. Authorization, cakupan tenant, dan step-up tetap
  diputuskan oleh REST.

## Verifikasi

- `npm run typecheck` lulus pada workspace. `docker build -t
  omnisight-ui-verify:local osc_site` menjalankan `npm ci` dan `npm run build`
  dengan Turbopack. Kompilasi produksi, TypeScript, dan generasi halaman
  lulus. Percobaan build langsung di host terhenti saat worker CSS Turbopack
  membuka port lokal.
- Chromium headless pada image produksi lulus untuk login, OTP, backup code,
  penolakan origin silang, atribut cookie sesi dan challenge, sidebar compact,
  pelipatan grup, tema gelap, drawer mobile, perpindahan area, dan render
  kesepuluh modul. Interaksi yang diuji mencakup pengurutan tabel, tab
  organisasi, form PAM, form SOP, lampiran, dan unduhan laporan. Skenario
  Chromium memakai fixture REST terisolasi.
- Smoke HTTP dari BFF ke REST pada Compose sementara lulus untuk login lokal,
  atribut cookie, pergantian area, SOP dengan round-trip lampiran RustFS,
  ekspor XLSX/PDF beserta unduh ulang arsip, audit log, menu, konektor, dan
  penghapusan cookie saat logout. Kontainer, jaringan, dan volume uji
  dibersihkan. OTP, backup code, dan otorisasi PAM berhasil pada fixture
  Chromium. Ketiga alur itu belum dijalankan terhadap akun REST nyata.
