# Development — Konvensi API & Kode

> Konvensi yang diikuti seluruh komponen stack OmniSight. Bertujuan agar
> backend (osc_rest), frontend (osc_site), dan database (osc_base) konsisten
> saat berkolaborasi.

## 1. Routing & Pembagian Area

Backend (`osc_rest`) membagi route menjadi area berdasarkan kebutuhan otentikasi:

| Prefix | Middleware | Akses |
|---|---|---|
| `/rest/guest` | — | Publik: login `PUB00`, daftar company |
| `/rest/pages` | `USAuth()` / `USLoad()` | Halaman terautentikasi |
| `/rest/pages/*` (admin) | `USAuth(), USLock()` | Hanya admin (CRUD `APP01/modules`, `APP02/companies` & turunannya) |
| `/rest/agent` | `USBots()` | Worker/robot (service account) |
| `/rest/hook` | (rencana) | Webhook |

Mapping dari frontend melalui server proxy Next.js:

```
/proxy/guest/<path>   →  /rest/guest/<path>
/proxy/pages/<path>   →  /rest/pages/<path>   (token disuntik server-side)
```

> Pelajaran dari blueprint OSS (mis. Directus): jangan biarkan client
> mengirim token secara langsung; proxy server yang menambahkannya.

## 2. Autentikasi

Format header:

```
Authorization: Bearer <token>
X-Company-ID: <company_id>   # pilihan company aktif (opsional tapi dianjurkan)
```

- Token tersimpan pada `app_user_token` (opsional refresh token, fingerprint).
- Frontend menyimpan sesi di cookie `OmniSightMemory` + `localStorage`.
- Saat 401: frontend logout otomatis.

Alur login:
1. `GET /proxy/guest/PUB00` — daftar company HRIS (opsional).
2. `POST /proxy/guest/PUB00` — kirim company_id/username/password + captcha.
3. Respon: `token`, `expires_at`, `user_profile` → simpan sesi → `/board`.

## 3. Format Error (Konsisten)

Semua error berupa JSON dengan struktur tertentu:

```json
{ "code": "VALIDATION_ERROR", "error": "pesan", "request_id": "uuid" }
```

- Dibuat lewat `mechanic.AppError` di `osc_rest/mechanic/helper.go`.
- Kode standar: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401),
  `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
  `INTERNAL_ERROR` (500), `EXTERNAL_SERVICE_ERROR` (502).
- `X-Request-ID` dicatat backend & diteruskan proxy → berguna untuk trace.

## 4. Kode Modul (Field `code`)

Modul diberi prefix 3 huruf agar frontend dapat memetakan ikon & grup:

| Prefix | Group | Contoh |
|---|---|---|
| `APP` | Application (admin) | `APP01`..`APP11` |
| `SYS` | Session Profile | `SYS01`..`SYS03` |
| `AMM` | Asset Management | · |
| `BOT` | Bot/Agent | · |
| `DOC` | Document | · |
| `DSO` | DevOps/CI-CD | · |
| `JMS` | Job Management | · |
| `NET` | Network Monitoring | · |
| `OBS` | Observability | · |
| `POD` | Container/Pod | · |
| `VMS` | VM & Security | · |
| `WAF` | Web Application Firewall | · |
| `WEB` | Web/Proxy | · |

Frontend memetakan prefix ini ke ikon via `src/app/board/model/module.ts`.

## 5. Database — Konvensi Model

- ID: `String @id @default(uuid())`.
- Setiap model punya kolom audit `created_at`/`updated_at` (tanpa
  `created_by`/`updated_by`).
- `is_active` untuk soft state (hindari hard-delete).
- Prefix model per cluster: `app_*`; cluster lain akan memakai prefix berbeda
  (mis. `net_*`, `sec_*`, `obs_*`, `pod_*`, `jms_*`) sesuai daftar retensi di
  `osc_rest/backbone/retention.go` / catatan `notes.txt`.
- Perusahaan wajib `@@unique([code])`; entity milik perusahaan umumnya
  `@@unique([company_id, <code>])`.

## 6. Pagination & Filtering

Backend memakai `mechanic.GridParams` (binding query oleh frontend `src/lib/grid.ts`):

```
?search=&page=&page_size=&sort=&order=
```

- Default: `page=1`, `page_size=25` (max 500, clamp di `GridParams.Default()`), `order=ASC`.
- Frontend memetakan `size → page_size`, `sort_by → sort`, `sort_order → order`
  (`buildParams` di `src/lib/grid.ts`).
- Filter tanggal: kolom dengan `DateFilter` pada `ApplyDateFilter`.

Respon page (`mechanic.Page`, field ekspos `Rows/Total/Page/PageSize/TotalPage`):

```json
{
  "Rows": [],
  "Total": 123,
  "Page": 1,
  "PageSize": 25,
  "TotalPage": 5
}
```

## 7. Logging & Trace

- Backend: `zerolog` — `Info` (2xx), `Warn` (4xx), `Error` (5xx); sertakan
  `request_id`, `user_id`, `company_id`.
- `X-Request-ID` dihasilkan backend bila kosong; diteruskan proxy frontend.
- Audit log: middleware `USLogs(moduleCode)` menulis `app_user_action` untuk
  request sukses.

## 8. Keamanan (Sisi Developer)

- Jangan commit `.env`, `deploy/certs/*.pem|*.key`, `osc_docs/config/**`.
- Jangan hardcode secret di kode; baca dari env (`mechanic.crypto` untuk
  enkripsi nilai sensitif bila perlu).
- Gunakan `AllowOrigins` yang eksplisit di `backbone/routes.go`.
- Bila menambahkan dependensi: cek `npm audit`/`go vuln` tetap bersih;
  tambahkan `overrides` untuk CVE (pola `osc_base/package.json`).

## 9. Bahasa & Penamaan

- Kode, variabel, endpoint, komentar Dockerfile: **bahasa Inggris**.
- Dokumentasi tingkat-root (`osc_docs`): **Bahasa Indonesia** (kecuali
  diputuskan lain).
- Route: kebab-case; file Go: kebab/huruf kecil; komponen React: PascalCase.