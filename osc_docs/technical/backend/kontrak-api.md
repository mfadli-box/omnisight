# Kontrak API

## 1. Prinsip

- Base path: `/api/v1`.
- Format: JSON UTF-8.
- Nama field: `snake_case`.
- Waktu: ISO 8601 UTC, misalnya `2026-10-30T09:00:00Z`.
- ID: UUID (string).
- Semua hasil bisnis memakai HTTP 200 dengan envelope.
- **Tidak memakai HTTP 403.**
- **Tidak mengembalikan HTTP 5xx untuk error aplikasi yang tertangani.**
- Detail teknis tidak pernah dikirim ke klien.
- Setiap respons memiliki `request_id`.

## 2. Envelope

### Sukses

```json
{
  "ok": true,
  "code": "AA00-00-0000",
  "message": "OK",
  "data": {
    "items": [],
    "next_cursor": null
  },
  "meta": {
    "request_id": "0199c8f2-7c4a-7f0e-9d3a-2b1f5c8e9a10",
    "timestamp": "2026-10-30T09:00:00Z",
    "company_id": "0199c8f2-1111-7f0e-9d3a-2b1f5c8e9a10",
    "area_id": null
  },
  "errors": []
}
```

### Gagal

```json
{
  "ok": false,
  "code": "AA00-00-0003",
  "message": "The request could not be processed.",
  "data": null,
  "meta": {
    "request_id": "0199c8f2-7c4a-7f0e-9d3a-2b1f5c8e9a10",
    "timestamp": "2026-10-30T09:00:00Z"
  },
  "errors": []
}
```

### Validasi gagal

```json
{
  "ok": false,
  "code": "AA00-00-0001",
  "message": "The submitted data is invalid.",
  "data": null,
  "meta": {
    "request_id": "0199c8f2-7c4a-7f0e-9d3a-2b1f5c8e9a10",
    "timestamp": "2026-10-30T09:00:00Z"
  },
  "errors": [
    { "field": "asset_tag", "code": "required", "reason": "This field is required." },
    { "field": "location_id", "code": "out_of_scope", "reason": "The location is outside the selected area." }
  ]
}
```

Aturan pesan:

- Pesan autentikasi selalu generik, tidak membedakan akun tidak ada vs password salah.
- Pesan error internal tidak menyebut stack trace, SQL, host, atau nama tabel.
- `errors` hanya memuat detail field yang aman ditampilkan.
- `code` tetap sama di semua bahasa; `message` dan `reason` mengikuti locale pengguna.
- Label UI dan pesan milik frontend memakai katalog terjemahan frontend; pesan dari server memakai katalog backend.

## 3. Kode sistem

| Kode | Arti | HTTP |
|---|---|---|
| `AA00-00-0000` | Sukses | 200 |
| `AA00-00-0001` | Validasi gagal | 200 |
| `AA00-00-0002` | Belum terautentikasi / sesi tidak valid | 200 |
| `AA00-00-0003` | Akses ditolak | 200 |
| `AA00-00-0004` | Data tidak ditemukan atau di luar scope | 200 |
| `AA00-00-0005` | Konflik versi / duplikat | 200 |
| `AA00-00-0006` | Terlalu banyak permintaan | 200 |
| `AA00-00-0007` | Idempotency key bentrok | 200 |
| `AA00-00-0008` | Metode/format tidak didukung | 200 |
| `AA00-00-0009` | Payload terlalu besar | 200 |
| `AA00-00-0010` | CSRF token tidak valid | 200 |
| `AA00-00-0100` | Error internal (generik) | 200 |
| `AA00-00-0900` | Layanan pendukung tidak tersedia | 200 |

Kode modul memakai prefix modul:

| Rentang | Modul |
|---|---|
| `AA-xx-xxxx` | Dashboard |
| `AB-xx-xxxx` | Identitas dan akses |
| `AC-xx-xxxx` | Aset |
| `AD-xx-xxxx` | Jaringan |
| `AE-xx-xxxx` | Monitoring |
| `AF-xx-xxxx` | Container |
| `AG-xx-xxxx` | Edge |
| `AH-xx-xxxx` | Backup |
| `AI-xx-xxxx` | Akses aman |
| `AJ-xx-xxxx` | Layanan |
| `AK-xx-xxxx` | Konten |
| `AL-xx-xxxx` | Audit |
| `AM-xx-xxxx` | Platform |

Contoh kode modul:

| Kode | Arti |
|---|---|
| `AB-04-1001` | Kredensial HRIS tidak sesuai |
| `AB-04-1002` | HRIS tidak tersedia |
| `AB-02-1003` | Pengguna tidak memiliki membership aktif |
| `AC-04-2001` | Aset sedang dipinjam |
| `AD-06-3001` | Perubahan firewall memerlukan persetujuan |
| `AD-06-3002` | Rollback firewall dijalankan |
| `AF-04-4001` | Image tidak dipin ke digest |
| `AF-04-4002` | Health check gagal, rollback dilakukan |
| `AH-04-5001` | Restore memerlukan persetujuan |
| `AI-02-6001` | Permintaan akses kedaluwarsa |

Daftar lengkap, aturan alokasi, lokalisasi, dan retry ada di [registry kode error](kode-error.md).

## 4. Kebijakan HTTP khusus

### 4.1 Tanpa 403

Penolakan akses tetap **HTTP 200** dengan kode `AA00-00-0003`.

Alasan:

- Menghindari kesan "serangan" dari perangkat keamanan yang salah membaca 403.
- Menjaga konsistensi envelope.
- Mengurangi enumerasi: data di luar scope tampil seperti tidak ditemukan.

Konsekuensi:

- Penolakan wajib dicatat di audit dan metrik `authorization_denials_total`.
- WAF tetap mencatat dan memblokir pola serangan.
- Jangan menyembunyikan penolakan dari log; yang disembunyikan hanya detail ke klien.

### 4.2 Tanpa 5xx ke klien

- Panic handler menangkap panic dan mengembalikan `AA00-00-0100`.
- Error database/adapter yang tidak dapat dipulihkan dipetakan ke `AA00-00-0100` atau `AA00-00-0900`.
- Edge memetakan 502/503/504 menjadi halaman/envelope `AA00-00-0900` untuk API.
- Health check internal tetap memakai status HTTP nyata dan hanya diakses jaringan internal.
- Alert dan log tetap mencatat error asli.

### 4.3 Rate limit

Rate limit mengembalikan HTTP 200 dengan `AA00-00-0006` dan:

```json
{
  "ok": false,
  "code": "AA00-00-0006",
  "message": "Too many requests. Please try again later.",
  "data": null,
  "meta": {
    "request_id": "...",
    "timestamp": "...",
    "retry_after_seconds": 30
  },
  "errors": []
}
```

### 4.4 Download file

Download memakai respons biner HTTP 200, bukan envelope, dengan header:

- `Content-Type` hasil deteksi.
- `Content-Disposition: attachment; filename="..."`.
- `X-Content-Type-Options: nosniff`.
- `Cache-Control: private, no-store`.

Jika gagal, tetap envelope JSON 200 dengan kode yang sesuai.

## 5. Header

### Request

| Header | Wajib | Fungsi |
|---|---|---|
| `Authorization: Bearer <jwt>` | API non-cookie | Autentikasi |
| `Cookie` | Klien browser | Access/refresh HttpOnly |
| `X-CSRF-Token` | POST browser | Proteksi CSRF |
| `X-Request-Id` | Opsional | Korelasi; dibuat server jika kosong |
| `X-Company-Id` | Ya untuk multi-perusahaan | Perusahaan aktif, divalidasi membership |
| `X-Area-Id` | Opsional | Scope area, divalidasi turunan |
| `Idempotency-Key` | Untuk aksi eksternal | Cegah eksekusi ganda |
| `If-Match` | Update | Versi optimistis |
| `Accept-Language` | Opsional | `en` default; nilai didukung `en`, `id` |

### Response

| Header | Fungsi |
|---|---|
| `X-Request-Id` | Korelasi |
| `Content-Language` | `en` atau `id`, sesuai locale respons |
| `Cache-Control: no-store` | Respons sensitif |
| `X-Content-Type-Options: nosniff` | Keamanan |
| `Referrer-Policy` | Keamanan |
| `Strict-Transport-Security` | Hanya HTTPS |
| `Content-Security-Policy` | Untuk halaman frontend |

### 5.1 Lokalisasi

- Bahasa yang didukung: `en` (default) dan `id`.
- Urutan penentuan locale:
  1. `Accept-Language` yang didukung pada request.
  2. `core.users.locale` pengguna yang terautentikasi.
  3. `core.companies.locale`.
  4. `en`.
- Frontend wajib mengirim `Accept-Language` sesuai locale aktif pengguna, sehingga pilihan bahasa per pengguna tetap berlaku.
- `code` tidak berubah di semua bahasa; hanya `message`, `reason`, dan label yang dilokalkan.
- Katalog pesan backend disimpan di `osc_rest/locales/en.json` dan `id.json`. Kunci pesan stabil dan tidak memakai teks sebagai kunci.
- Format tanggal, angka, dan mata uang mengikuti locale di frontend; API tetap mengirim ISO 8601 dan angka mentah.
- Pesan keamanan tetap generik di kedua bahasa; terjemahan tidak boleh menambah detail internal.
- Jika terjemahan tidak tersedia, fallback ke `en`; kegagalan terjemahan tidak boleh menjadi 5xx.

## 6. Autentikasi dan sesi

### `POST /api/v1/auth/login`

Request:

```json
{
  "company_code": "contoh",
  "email": "pengguna@contoh.invalid",
  "password": "placeholder"
}
```

Respons sukses:

```json
{
  "ok": true,
  "code": "AA00-00-0000",
  "message": "OK",
  "data": {
    "user": {
      "id": "...",
      "display_name": "Pengguna Contoh",
      "email": "pengguna@contoh.invalid",
      "locale": "en",
      "mfa_required": false
    },
    "companies": [
      { "id": "...", "code": "contoh", "name": "Perusahaan Contoh", "areas": [] }
    ],
    "active_company_id": "..."
  },
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

Respons gagal (HTTP 200):

```json
{
  "ok": false,
  "code": "AB-00-1004",
  "message": "Email or password is incorrect.",
  "data": null,
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

### `POST /api/v1/auth/login/hris`

Request:

```json
{
  "company_code": "contoh",
  "identifier": "karyawan@contoh.invalid",
  "password": "placeholder"
}
```

Respons mengikuti envelope. Jika HRIS meminta MFA, `data.mfa_required = true` dan `data.challenge_id` diisi; password tidak dikirim balik.

### Endpoint auth lain

| Method | Path | Izin | Fungsi |
|---|---|---|---|
| POST | `/auth/refresh` | Sesi refresh | Rotasi token |
| POST | `/auth/logout` | Sesi | Cabut sesi |
| GET | `/auth/me` | Sesi | Profil, izin, scope, locale |
| PATCH | `/auth/me` | Sesi | Perbarui profil dan locale (`en`/`id`) |
| POST | `/auth/context` | Sesi | Pilih perusahaan/area |
| GET | `/auth/sessions` | Sesi | Daftar sesi sendiri |
| POST | `/auth/sessions/{id}/revoke` | Sesi atau `AB05:post` | Cabut sesi sendiri atau sesi pengguna lain |
| POST | `/auth/mfa/enroll` | Sesi | Mulai enrollment MFA |
| POST | `/auth/mfa/verify` | Sesi | Verifikasi MFA |

Izin dikembalikan dalam bentuk ringkas:

```json
{
  "permissions": ["AC:read", "AC:post", "AE:read"],
  "scope": {
    "company_id": "...",
    "areas": [{ "id": "...", "include_descendants": true }]
  }
}
```

Frontend memakai ini untuk menyembunyikan menu, tetapi server tetap memeriksa setiap request.

## 7. Paginasi, filter, dan sort

- Query: `limit` (default 25, maksimum 200), `cursor`.
- `cursor` opaque, berisi `created_at` dan `id`.
- Filter memakai parameter eksplisit, bukan ekspresi bebas.
- Sort hanya kolom allowlist.
- Pencarian memakai `q` dengan batas panjang.
- Respons: `data.items`, `meta.next_cursor`, `meta.has_more`.
- `total` hanya disediakan pada endpoint yang memang membutuhkan; hindari count mahal di daftar besar.

Contoh:

```http
GET /api/v1/assets/assets?limit=50&status=assigned&area_id=...&q=laptop
X-Company-Id: ...
```

## 8. Endpoint utama per modul

Tabel berikut adalah kontrak tingkat modul. Detail DTO diturunkan dari OpenAPI dan diperbarui bersama implementasi.

### Publik

| Method | Path | Izin | Catatan |
|---|---|---|---|
| GET | `/public/status` | Publik | Status ringkas, tanpa detail internal, di-cache singkat |
| GET | `/public/pages/{slug}` | Publik | Hanya halaman `published` dan `visibility=public` |
| GET | `/public/articles` | Publik | Hanya artikel `published` dan `visibility=public` |
| GET | `/public/articles/{slug}` | Publik | Hanya artikel `published` dan `visibility=public` |

### Dashboard `AA`

| Method | Path | Izin | Catatan |
|---|---|---|---|
| GET | `/dashboard/summary` | `AA:read` | Kartu ringkas sesuai scope |
| GET | `/dashboard/health` | `AA:read` | Status integrasi dan agent, tanpa rahasia |
| GET | `/dashboard/activity` | `AA:read` | Ringkasan audit yang boleh dilihat |
| GET | `/dashboard/tasks` | `AA:read` | Tiket, approval, dan review milik pengguna |

Dashboard hanya membaca agregat; tidak menambah jalur tulis.

### Identitas `AB`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/identity/companies` | `AB:read` (POST platform only) |
| GET/POST | `/identity/areas` | `AB:read/post` |
| GET/POST | `/identity/users` | `AB02:read/post` |
| GET/POST | `/identity/memberships` | `AB02:read/post` |
| GET | `/identity/directory` | `AB:read` |
| GET/POST | `/identity/roles` | `AB03:read/post` |
| GET/POST | `/identity/hris/connections` | `AB04:read/post` |
| GET/POST | `/identity/hris/rules` | `AB04:read/post` |
| POST | `/identity/hris/rules/{id}/test` | `AB04:post` |
| GET | `/identity/login-attempts` | `AB06:read` |

### Aset `AC`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/assets/categories` | `AC:read/post` |
| GET/POST | `/assets/models` | `AC:read/post` |
| GET/POST | `/assets/assets` | `AC:read/post` |
| GET | `/assets/assets/{id}` | `AC:read` |
| POST | `/assets/assets/{id}/checkout` | `AC:post` |
| POST | `/assets/assets/{id}/checkin` | `AC:post` |
| POST | `/assets/assets/{id}/move` | `AC:post` |
| GET | `/assets/assets/{id}/history` | `AC:read` |
| POST | `/assets/assets/{id}/qr/rotate` | `AC:post` |
| GET | `/assets/reports` | `AC:read` |
| POST | `/assets/reports/export` | `AC:post` |
| GET | `/assets/mine` | Sesi, scope self |

### Jaringan `AD`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/network/devices` | `AD:read/post` |
| GET/POST | `/network/racks` | `AD:read/post` |
| GET/POST | `/network/interfaces` | `AD:read/post` |
| GET/POST | `/network/prefixes` | `AD:read/post` |
| GET/POST | `/network/ip-addresses` | `AD:read/post` |
| GET/POST | `/network/vlans` | `AD:read/post` |
| GET/POST | `/network/links` | `AD:read/post` |
| GET/POST | `/network/circuits` | `AD:read/post` |
| GET/POST | `/network/routers` | `AD:read/post` |
| POST | `/network/routers/{id}/snapshot` | `AD07:post` |
| GET/POST | `/network/changes` | `AD06:read/post` |
| POST | `/network/changes/{id}/approve` | `AD06:post` |
| POST | `/network/changes/{id}/execute` | `AD06:post` |
| POST | `/network/changes/{id}/rollback` | `AD06:post` |
| GET/POST | `/network/integrations` | `AD:read/post` |
| POST | `/network/integrations/{id}/sync` | `AD:post` |

### Monitoring `AE`

| Method | Path | Izin |
|---|---|---|
| GET | `/monitoring/hosts` | `AE:read` |
| GET | `/monitoring/agents` | `AE:read` |
| GET | `/monitoring/agents/{id}` | `AE:read` |
| POST | `/monitoring/agents/enrollment-tokens` | `AE:post` |
| POST | `/monitoring/agents/{id}/revoke` | `AE:post` |
| GET | `/monitoring/agents/{id}/metrics` | `AE:read` |
| GET/POST | `/monitoring/alert-rules` | `AE:read/post` |
| GET | `/monitoring/alerts` | `AE:read` |
| POST | `/monitoring/alerts/{id}/ack` | `AE:post` |
| GET/POST | `/monitoring/incidents` | `AE:read/post` |
| GET/POST | `/monitoring/integrations` | `AE:read/post` |
| POST | `/monitoring/integrations/{id}/sync` | `AE:post` |
| GET | `/monitoring/security-events` | `AE06:read` |
| POST | `/monitoring/security-events/{id}/triage` | `AE06:post` |
| GET/PUT | `/monitoring/retention` | `AE:read/post` |

### Container `AF`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/containers/endpoints` | `AF:read/post` |
| GET/POST | `/containers/stacks` | `AF:read/post` |
| GET | `/containers/stacks/{id}` | `AF:read` |
| POST | `/containers/stacks/{id}/plan` | `AF04:post` |
| POST | `/containers/stacks/{id}/deploy` | `AF04:post` |
| POST | `/containers/stacks/{id}/rollback` | `AF04:post` |
| GET | `/containers/actions` | `AF:read` |
| POST | `/containers/actions` | `AF05:post` |
| POST | `/containers/actions/{id}/approve` | `AF04:post` |
| GET | `/containers/hosts` | `AF:read` |

### Edge `AG`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/edge/domains` | `AG:read/post` |
| GET/POST | `/edge/certificates` | `AG:read/post` |
| GET/POST | `/edge/proxy-hosts` | `AG:read/post` |
| POST | `/edge/proxy-hosts/{id}/apply` | `AG04:post` |
| GET/POST | `/edge/nodes` | `AG:read/post` |

### Backup `AH`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/backups/sources` | `AH:read/post` |
| GET/POST | `/backups/schedules` | `AH:read/post` |
| GET | `/backups/backups` | `AH:read` |
| GET | `/backups/backups/{id}/diff` | `AH:read` |
| GET | `/backups/verifications` | `AH05:read` |
| POST | `/backups/backups/{id}/verify` | `AH05:post` |
| POST | `/backups/backups/{id}/restore` | `AH04:post` |
| POST | `/backups/restores/{id}/approve` | `AH04:post` |

### Akses aman `AI`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/access/targets` | `AI:read/post` |
| GET | `/access/requests` | `AI02:read` |
| POST | `/access/requests` | `AI:post` (scope self) |
| GET | `/access/requests/mine` | `AI:post` (scope self) |
| POST | `/access/requests/{id}/approve` | `AI02:post` |
| GET | `/access/sessions` | `AI:read` |
| POST | `/access/sessions/{id}/terminate` | `AI:post` |
| GET/POST | `/access/policies` | `AI05:read/post` |

### Layanan `AJ`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/service-desk/tickets` | `AJ:read/post` |
| GET | `/service-desk/tickets/mine` | `AJ:read` (scope self) |
| POST | `/service-desk/tickets/{id}/comments` | `AJ:post` |
| GET/POST | `/service-desk/categories` | `AJ:read/post` |
| GET/POST | `/service-desk/sla-policies` | `AJ:read/post` |
| GET/POST | `/service-desk/contracts` | `AJ:read/post` |
| GET/POST | `/service-desk/kb` | `AJ:read/post` |
| GET | `/service-desk/reports` | `AJ:read` |

### Konten `AK`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/content/articles` | `AK:read/post` |
| GET/POST | `/content/pages` | `AK:read/post` |
| GET/POST | `/content/notification-templates` | `AK:read/post` |
| GET | `/content/notifications` | `AK:read` |
| POST | `/content/notifications/{id}/read` | `AK:post` |
| GET/PATCH | `/content/preferences` | `AK:read/post` |

### Audit `AL`

| Method | Path | Izin |
|---|---|---|
| GET | `/audit/events` | `AL:read` |
| GET | `/audit/logins` | `AL:read` |
| GET | `/audit/security-events` | `AL:read` |
| POST | `/audit/security-events/{id}/triage` | `AL:post` |
| GET/POST | `/audit/access-reviews` | `AL04:read/post` |
| POST | `/audit/access-reviews/{id}/items/{item_id}/decide` | `AL04:post` |
| POST | `/audit/export` | `AL05:post` |
| GET/PUT | `/audit/retention` | `AL05:read/post` |

### Platform `AM`

| Method | Path | Izin |
|---|---|---|
| GET/POST | `/platform/integrations` | `AM:read/post` |
| POST | `/platform/integrations/{id}/test` | `AM:post` |
| GET | `/platform/health` | `AM:read` |
| GET/POST | `/platform/credentials` | `AM02:read/post` |
| POST | `/platform/credentials/{id}/test` | `AM02:post` |
| GET/POST | `/platform/webhooks` | `AM03:read/post` |
| GET/POST | `/platform/api-keys` | `AM03:read/post` |
| GET/POST | `/platform/feature-flags` | `AM:read/post` |
| GET/POST | `/platform/settings` | `AM:read/post` |
| GET/POST | `/platform/jobs` | `AM:read/post` |
| GET | `/platform/impersonation` | `AM08:read` |
| POST | `/platform/impersonation` | `AM08:post` |
| POST | `/platform/impersonation/{id}/end` | `AM08:post` |

Impersonasi hanya untuk `platform_owner`; `platform_security` boleh membaca riwayat. Semua aksi selama impersonasi memakai `request_id` sesi impersonasi dan tetap tunduk pada approval aksi sensitif.

## 9. API internal

Tidak diekspos melalui edge. Wajib mTLS + service token + network policy.

| Method | Path | Pemanggil |
|---|---|---|
| POST | `/internal/v1/ingest/metrics` | collector `osc_auto` |
| POST | `/internal/v1/ingest/heartbeat` | collector `osc_auto` |
| POST | `/internal/v1/jobs/claim` | worker `osc_auto` |
| POST | `/internal/v1/jobs/{id}/complete` | worker `osc_auto` |
| POST | `/internal/v1/outbox/claim` | notifier `osc_auto` |
| POST | `/internal/v1/outbox/{id}/complete` | notifier `osc_auto` |
| POST | `/internal/v1/agent/enroll` | agent enrollment |
| GET | `/internal/v1/agent/{id}/config` | agent |
| GET | `/internal/healthz` | orchestrator |
| GET | `/internal/metrics` | Prometheus |

Aturan API internal:

- Service token berumur pendek dan scope sempit.
- Payload dibatasi dan divalidasi.
- Idempotency wajib untuk ingest/job.
- Tidak ada endpoint internal untuk membaca data tenant secara bebas.

## 10. Contoh respons penting

### Akses ditolak (HTTP 200)

```json
{
  "ok": false,
  "code": "AA00-00-0003",
  "message": "The request could not be processed.",
  "data": null,
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

### Data di luar scope (HTTP 200)

```json
{
  "ok": false,
  "code": "AA00-00-0004",
  "message": "Data not found.",
  "data": null,
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

### Konflik versi (HTTP 200)

```json
{
  "ok": false,
  "code": "AA00-00-0005",
  "message": "The data has changed. Reload and try again.",
  "data": null,
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

### Layanan pendukung tidak tersedia (HTTP 200)

```json
{
  "ok": false,
  "code": "AA00-00-0900",
  "message": "A supporting service is currently unavailable. Please try again later.",
  "data": null,
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

### Error internal (HTTP 200)

```json
{
  "ok": false,
  "code": "AA00-00-0100",
  "message": "The request could not be processed.",
  "data": null,
  "meta": { "request_id": "...", "timestamp": "..." },
  "errors": []
}
```

## 11. Idempotency

- Header `Idempotency-Key` wajib untuk deploy, restore, firewall change, dan webhook manual.
- Server menyimpan hash kunci + hash request + respons.
- Request dengan kunci sama dan body sama mengembalikan respons tersimpan.
- Request dengan kunci sama tetapi body berbeda mengembalikan `AA00-00-0007`.
- Kunci disimpan minimal 24 jam.

## 12. Versioning

- Versi di path: `/api/v1`.
- Perubahan aditif tidak menaikkan versi.
- Perubahan yang memutus kompatibilitas membuat `/api/v2` dan periode transisi.
- Endpoint lama diberi header `Deprecation` dan `Sunset`.
- OpenAPI menjadi sumber kontrak; frontend memakai klien TypeScript yang dihasilkan.

## 13. Checklist API

- [ ] Semua route punya modul, aksi, dan scope.
- [ ] Tidak ada 403 dan tidak ada 5xx aplikasi.
- [ ] Penolakan tercatat di audit dan metrik.
- [ ] Validasi input di server.
- [ ] Pagination berbasis cursor.
- [ ] Idempotency untuk aksi eksternal.
- [ ] Pesan autentikasi generik.
- [ ] Download file memakai header aman.
- [ ] Semua kode error terdaftar di [registry kode error](kode-error.md) dan tidak dipakai ulang.
- [ ] OpenAPI diperbarui.
- [ ] Contoh request/response diuji.
