# osc_site

Workspace OmniSight memakai Next.js 16 App Router, TypeScript, Tailwind CSS v4, dan komponen shadcn/ui berbasis Radix.

## Menjalankan

Atur `INTERNAL_API_URL` ke URL privat `osc_rest`, misalnya `http://osc_rest:8080` di Compose. Atur `APP_ORIGIN` ke origin yang terlihat browser, termasuk skema dan port. Default Compose adalah `http://localhost:36665`. Gunakan HTTPS di luar loopback. Jalankan versi `osc_rest` dari checkout yang sama agar direktori konteks dan metrik OP02 tersedia.

Untuk pengembangan di luar Docker dengan Node.js 22, jalankan `npm ci` lalu `npm run dev` dari direktori ini. Untuk membangun image dari root repo, jalankan `docker build -t osc_site ./osc_site`. Image menjalankan server standalone sebagai pengguna `node` pada port 3000.

## Alur akses

- Login mengambil pilihan company aktif dari `/baas/v1/public/companies` dan selalu menawarkan Local Account. Akun dengan MFA dapat masuk dengan OTP enam digit atau memakai backup code dari formulir pemulihan.
- BFF menyimpan JWT sesi dan challenge dalam cookie beratribut `HttpOnly`, `Secure`, dan `SameSite=Strict`. Handler mutasi memvalidasi origin. Proxy meneruskan Bearer token dari cookie ke `osc_rest` untuk rute yang diizinkan. Logout menghapus cookie sesi browser.
- AppShell memakai `/baas/v1/me/navigation` untuk menu dan `/baas/v1/me/contexts` untuk daftar company serta area berdasarkan grant. REST memvalidasi setiap akses dan perpindahan konteks.

## Modul

| Modul | Fitur |
| --- | --- |
| CT01 | Inventaris node dalam konteks aktif dan filter status per halaman |
| OP01 | Target PAM dan otorisasi sesi dengan OTP step-up |
| OP02 | Inventaris agen dan metrik heartbeat dari Valkey. Gunakan UUID baris node sebagai `node_id` saat provisioning agen. Sampel tersedia selama 15 menit. |
| KB01 | Buat, ubah, dan arsipkan SOP serta unggah dan unduh lampiran privat |
| RP01, RP02 | Ekspor XLSX dan PDF, beserta unduhan ulang dari arsip privat |
| SA01 | Kelola company, area, dan store |
| SA02 | Kelola akun lokal, cabut akses, dan reset MFA pengguna |
| SA03 | Buat role, kelola privilege menu, dan lihat log audit |
| SA04 | Kelola provider Local Account atau HRIS ASMX dan TTL cache |

API antrean scheduler belum tersedia. Mutasi SA03 dan SA04 memerlukan sesi dengan MFA terbaru.
