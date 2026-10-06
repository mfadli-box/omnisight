# Osc_rest — Backend REST API (Teknis)

> Backend Golang berbasis Gin. Melayani frontend, otentikasi-token, audit log,
> upload file (belum terdaftar di route), dan (kedepan) WebSocket/SSH proxy.

## 1. Peran & Stack

| Item | Nilai |
|---|---|
| Bahasa | Go `1.26.6` (module `osc_rest`) |
| Framework | `gin` + `gin-contrib/cors` |
| DB driver | `pgx/v5` (pool `pgxpool`) |
| Logging | `zerolog` (JSON/console) |
| Auth | Token dbased (tabel `app_user_token`), Opsional LDAP/SAML-SSO |
| Lainnya | `uuid`, `websocket` (gorilla), `gosaml2`, `crypto/x/crypto` |

Port listen: **`37772`** (lihat `main.go`). Alamat `http://localhost:37772/`.

## 2. Struktur

```
osc_rest/
├── main.go               # entrypoint: SetDatabase, SetRouter, scheduler, graceful shutdown
├── backbone/             # inti HTTP: router, middleware, db, upload, retention
│   ├── routes.go         # daftar semua route & grup middleware
│   ├── memory.go         # middleware auth: session, role, privilege, bot
│   ├── logger.go ,recovery.go  # request id, logging, panic recovery
│   ├── database.go       # koneksi pgxpool dari env PG_* (export `PgSQL`)
│   ├── upload.go         # upload file (kategori id, whitelist ekstensi) — belum terdaftar
│   ├── retention.go      # hapus data telemetri/log berdasarkan umur (RE_*)
│   └── cleanup.go        # cleanup sesi EXPIRED + placeholder cluster status
├── skeleton/             # modul domain (pola handler → usecase → repository → template)
│   ├── pub/pub00_*.go    # PUB00: daftar company & login
│   ├── app/app00/…        # APP00: logout, company user, pohon modul
│   └── sys/sys00_*.go    # SYS01–SYS03: profil, ganti password, riwayat login
├── mechanic/             # helper & paket utilitas
│   ├── helper.go         # AppError, respon error JSON, pagination, filter
│   ├── crypto.go         # AES-GCM encrypt/decrypt (RE_SECRET)
│   ├── typography.go     # nullable, parse int/date/duration
│   └── sshproxy.go       # WebSocket ↔ SSH (terminal, PTY, rekam sesi)
└── Dockerfile            # multi-stage builder golang → runner alpine
```

### Pola `skeleton/` (layering)

Setiap modul `XYZnn` mengikuti empat file di sebuah package `skeleton/<area>/`
(`pub/pub00_*`, `app/app00/*`, `sys/sys00_*`):

| File | Peran |
|---|---|
| `xyz00_template.go` | Kontrak JSON (request/response struct) |
| `xyz00_repository.go` | Query SQL via `pgxpool` (tabel `app_*`) |
| `xyz00_usecase.go` | Logika bisnis & validasi; export `Use(pool)` untuk inject pool |
| `xyz00_handler.go` | HTTP handler Gin; format error via `mechanic` |

Inject pool di `routes.go`: `pub.Use(PgSQL)`, `app.Use(PgSQL)`, `sys.Use(PgSQL)`.

## 3. Middleware Otentikasi & Otorisasi

Semua di `backbone/memory.go` — middleware reuse untuk group route.

| Middleware | Peran |
|---|---|
| `USLoad()` | Muat sesi dari `Authorization` + token `app_user_token`; user + company aktif; pilih company via `X-Company-ID` (wajib co. valid). Set `userId`, `companyId`, `isAdmin`, `isHris`. |
| `USAuth()` | Sama dengan USLoad tanpa pengecekan company (untuk auth-state generic). |
| `USLock()` | Hanya admin (`isAdmin` true). |
| `USBots()` | Auth token robot via `CR_KEYS` (dipisah koma) — untuk agen. |
| `USRole(moduleCode, level)` | Cek privilege via `app_user_privilege` + `app_module`; level `VIEW/BOOK/POST`; admin bypass. |
| `USLogs(moduleCode)` | Audit log semua request sukses ke `app_user_action`. |

Auth flow pada header:

```
Authorization: Bearer <token>
X-Company-ID: <company_id>   # opsional tapi dianjurkan; switch company aktif
```

Contoh chaining route (pola pada `routes.go`):

```go
pages := rest.Group("/rest/pages")
pages.Use(USLoad())                       // hanya untuk GET /rest/pages/

auths := rest.Group("/rest/pages")
auths.Use(USAuth())                       // data user sendiri (tanpa company check)
```

## 4. Routing

Didefinisikan di `backbone/routes.go`. Middleware global: `RequestID()`,
`CustomRecovery()`, `Logger()`, lalu CORS. Grup dasar:

| Prefix | Middleware | Peran |
|---|---|---|
| `/rest/guest` | — | Endpoint publik (login, info company). |
| `/rest/pages` (root) | `USLoad()` | Halaman terautentikasi (company wajib sudah dipilih). |
| `/rest/pages` (auths) | `USAuth()` | Data user sendiri (tanpa pengecekan company). |
| `/rest/pages` (admin) | `USAuth(), USLock()` | Hanya admin (grup ada, route belum terdaftar). |
| `/rest/agent` | `USBots()` | Worker otomasi (service account). |

Daftar route terdaftar saat ini (`skeleton/pub`, `skeleton/app`, `skeleton/sys`):

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/rest/guest/PUB00` | `pub.PUB00Company` | — |
| POST | `/rest/guest/PUB00` | `pub.PUB00Login` | — |
| DELETE | `/rest/pages/APP00` | `app.APP00Logout` | `USAuth()` |
| GET | `/rest/pages/APP00/company` | `app.APP00Company` | `USAuth()` |
| GET | `/rest/pages/APP00/module` | `app.APP00Module` | `USAuth()` |
| GET | `/rest/pages/SYS01/profile` | `sys.SYS01Profile` | `USAuth()` |
| PUT | `/rest/pages/SYS02/password` | `sys.SYS02Password` | `USAuth()` |
| GET | `/rest/pages/SYS03/history` | `sys.SYS03History` | `USAuth()` |

Endpoint status/placeholder: `/`, `/rest`, `/hook`, `/rest/guest/`,
`/rest/agent/` (balasan `message` saja).

CORS (`routes.go`): origin `http://localhost:37771` dan
`http://172.99.77.1:37771`; trusted proxies `localhost`, `172.99.77.1`.

`UploadHandler` (`backbone/upload.go`) **belum diregistrasikan** ke route manapun
— utasnya siap, tinggal ditambahkan.

Contoh kombinasi yang sudah digunakan di frontend:

```
/proxy/guest/PUB00 →  /rest/guest/PUB00        (login, list company)
/proxy/pages/...   →  /rest/pages/APP00/...    (profil/modul/company)
/proxy/pages/...   →  /rest/pages/SYS01..03/.. (profil, password, history)
```

## 5. Format Response & Error

Format success adalah JSON bebas, namun **error selalu konsisten**:

```json
{
  "code": "VALIDATION_ERROR",
  "error": "Pesan kesalahan",
  "request_id": "..."
}
```

Kode umum dari `mechanic.AppError`:

| Kode | HTTP | Penggunaan |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input invalid |
| `UNAUTHORIZED` | 401 | Token tidak ada/expired, privilege kurang |
| `FORBIDDEN` | 403 | Tidak punya akses ke company/module |
| `NOT_FOUND` | 404 | Data tidak ditemukan |
| `CONFLICT` | 409 | Duplikat/lapangan konflik |
| `INTERNAL_ERROR` | 500 | Error tak terduga |
| `EXTERNAL_SERVICE_ERROR` | 502 | Service eksternal gagal |

`X-Request-ID` selalu dikirim balik; `mechanic.Error(c, err)` menulis JSON + log.

## 6. Pagination & Filtering

`mechanic.helper.go` menyediakan `GridParams` (search/date/page/sort) dengan
default aman (`PageSize` clamp 500, `Order` default ASC). Gunakan:
`OrderClause`, `LimitOffset`, `TotalPage`, `ApplyDateFilter`, `Like`.

## 7. Upload & File

`backbone/upload.go`:
- `POST .../upload/:category/:id` → simpan ke `UploadBase` (`/root/files`).
- Kategori: `documents`, `evidence`, `avatars`.
- Batas ukuran `20MB`; whitelist: `pdf, doc, docx, png, jpg, jpeg, xlsx, csv, txt`.
- Nama file: `uuid[:8]_<millis>.<ext>`; return `file_path` relatif (`/files/...`).

## 8. Retensi Data

`backbone/retention.go`: hapus data tua berdasarkan tabel + kolom umur.
Env: `RE_FLAG`, `RE_DAYS`, `RE_LOGS`, dan override per tabel `RE_DAYS_<NAMA_TABEL>`.
Daftar tabel diambil dari daftar `retentionRule` di `retentionRules()`; loop tiap
1 jam memakai `PgSQL.Exec`. Implementasi saat ini: daftar `telemetry`/`logs`
masih kosong (dikembangkan saat cluster tersedia).

## 9. Cleanup Rutin (`main.go`)

Satu goroutine dijalankan saat server start:

| Fungsi | Peran |
|---|---|
| `CleanupExpiredSessions()` | Set `status='EXPIRED'` + `ended_at` pada sesi `ACTIVE` yang `last_active < -30 menit`. |

(`CleanupContainerStatus`/`CleanupHostStatus` dihapus — akan muncul kembali saat
tabel cluster tersedia.)

## 10. Environment (`.env`)

| Variabel | Peran |
|---|---|
| `PG_HOST`,`PG_PORT`,`PG_USER`,`PG_PASS`,`PG_DATA` | Koneksi PostgreSQL (pool `PgSQL`) |
| `IS_POOL` | `true` → pool besar (max 100) untuk worker; false → normal (50) |
| `RE_FLAG` | Aktifkan retensi |
| `RE_DAYS`,`RE_LOGS` | Umur data default; `RE_DAYS_<TABLE>` override per tabel |
| `CR_KEYS` | Token robot agen (dipisah koma) |
| `RE_SECRET` | Secret AES-GCM untuk enkripsi data sensitif |

## 11. Jalankan

```bash
cd osc_rest
cp .env .env.tested  # sesuaikan PG_* dengan container DB
go run .             # atau: go build -o main . && ./main  → listen :37772
```

Docker:

```bash
docker build -t osc_rest .
docker run --network blackbox -p 37772:37772 osc_rest
```

## 12. Referensi

- Database: [database/README.md](../database/README.md)
- Konvensi API (auth, header, error): [development/conventions.md](../development/conventions.md)
- Setup & menjalankan stack: [development/run.md](../development/run.md)