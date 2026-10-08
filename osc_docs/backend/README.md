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
│   ├── logger.go         # request id, logging, panic recovery
│   ├── recovery.go       # request id, panic recovery
│   ├── database.go       # koneksi pgxpool dari env PG_* (export `PgSQL`)
│   ├── upload.go         # upload file (kategori id, whitelist ekstensi) — belum terdaftar
│   ├── retention.go      # hapus data telemetri/log berdasarkan umur (RE_*)
│   └── cleanup.go        # cleanup sesi EXPIRED (scheduler)
├── skeleton/             # modul domain (pola handler → usecase → repository → template)
│   ├── pub/pub00_*.go    # PUB00: daftar company & login
│   ├── app/app00/…        # APP00: logout, company user, pohon modul
│   ├── app/app01/…        # APP01: CRUD module (admin)
│   ├── app/app02/…        # APP02: CRUD company + module per company + area (admin)
│   ├── app/app03/…        # APP03: CRUD user + company & privilege & area per user (admin)
│   ├── app/app04/…        # APP04: CRUD signature type + step/signer & form/flag (admin)
│   ├── app/app05/…        # APP05: CRUD sesi login & token otentikasi (admin)
│   ├── app/applink/…      # sinkronisasi otomatis tautan admin (company_module/user_company/user_privilege)
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
(`pub/pub00_*`, `app/app00/*`, `app/app01/*`, `app/app02/*`, `app/app03/*`,
`app/app04/*`, `app/app05/*`, `sys/sys00_*`):

| File | Peran |
|---|---|
| `xyz00_template.go` | Kontrak JSON (request/response struct) |
| `xyz00_repository.go` | Query SQL via `pgxpool` (tabel `app_*`) |
| `xyz00_usecase.go` | Logika bisnis & validasi; export `Use(pool)` untuk inject pool |
| `xyz00_handler.go` | HTTP handler Gin; format error via `mechanic` |

Inject pool di `routes.go` (package `app00`..`app05` di-alias saat
import): `pub.Use(PgSQL)`, `app00.Use(PgSQL)`, `app01.Use(PgSQL)`,
`app02.Use(PgSQL)`, `app03.Use(PgSQL)`, `app04.Use(PgSQL)`,
`app05.Use(PgSQL)`, `sys.Use(PgSQL)`.

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
| `/rest/pages` (admin) | `USAuth(), USLock()` | Hanya admin (CRUD module/company/user). |
| `/rest/agent` | `USBots()` | Worker otomasi (service account). |

Daftar route terdaftar saat ini (`skeleton/pub`, `skeleton/app/app00`,
`skeleton/app/app01`, `skeleton/app/app02`, `skeleton/app/app03`,
`skeleton/app/app04`, `skeleton/sys`):

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/rest/guest/PUB00` | `pub.PUB00Company` | — |
| POST | `/rest/guest/PUB00` | `pub.PUB00Login` | — |
| DELETE | `/rest/pages/APP00` | `app00.APP00Logout` | `USAuth()` |
| GET | `/rest/pages/APP00/company` | `app00.APP00Company` | `USAuth()` |
| GET | `/rest/pages/APP00/module` | `app00.APP00Module` | `USAuth()` |
| GET | `/rest/pages/SYS01/profile` | `sys.SYS01Profile` | `USAuth()` |
| PUT | `/rest/pages/SYS02/password` | `sys.SYS02Password` | `USAuth()` |
| GET | `/rest/pages/SYS03/history` | `sys.SYS03History` | `USAuth()` |
| GET | `/rest/pages/APP01/modules` | `app01.APP01ModulesList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP01/modules` | `app01.APP01ModulesCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP01/modules/:id` | `app01.APP01ModulesGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP01/modules/:id` | `app01.APP01ModulesUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP01/modules/:id` | `app01.APP01ModulesDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP02/companies` | `app02.APP02CompaniesList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP02/companies` | `app02.APP02CompaniesCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP02/companies/:id` | `app02.APP02CompaniesGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP02/companies/:id` | `app02.APP02CompaniesUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP02/companies/:id` | `app02.APP02CompaniesDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP02/companies/:id/modules` | `app02.APP02CompaniesModulesList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP02/companies/:id/modules` | `app02.APP02CompaniesModulesCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP02/companies/:id/modules/:uid` | `app02.APP02CompaniesModulesUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP02/companies/:id/modules/:uid` | `app02.APP02CompaniesModulesDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP02/companies/:id/areas` | `app02.APP02CompaniesAreasList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP02/companies/:id/areas` | `app02.APP02CompaniesAreasCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP02/companies/:id/areas/:uid` | `app02.APP02CompaniesAreasUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP02/companies/:id/areas/:uid` | `app02.APP02CompaniesAreasDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP03/users` | `app03.APP03UsersList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP03/users` | `app03.APP03UsersCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP03/users/:id` | `app03.APP03UsersGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP03/users/:id` | `app03.APP03UsersUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP03/users/:id` | `app03.APP03UsersDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP03/users/:id/companies` | `app03.APP03UsersCompaniesList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP03/users/:id/companies` | `app03.APP03UsersCompaniesCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP03/users/:id/companies/:uid` | `app03.APP03UsersCompaniesUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP03/users/:id/companies/:uid` | `app03.APP03UsersCompaniesDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP03/users/:id/companies/:uid/privileges` | `app03.APP03UsersCompaniesPrivilegesList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP03/users/:id/companies/:uid/privileges` | `app03.APP03UsersCompaniesPrivilegesCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP03/users/:id/companies/:uid/privileges/:pid` | `app03.APP03UsersCompaniesPrivilegesUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP03/users/:id/companies/:uid/privileges/:pid` | `app03.APP03UsersCompaniesPrivilegesDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP03/users/:id/areas` | `app03.APP03UsersAreasList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP03/users/:id/areas` | `app03.APP03UsersAreasCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP03/users/:id/areas/:uid` | `app03.APP03UsersAreasUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP03/users/:id/areas/:uid` | `app03.APP03UsersAreasDelete` | `USAuth(), USLock()` |

### Sinkronisasi otomatis tautan admin (`applink`)

Package `osc_rest/skeleton/app/applink` membuat baris tautan otomatis
(default non-aktif / HIDE) di dalam transaksi `Create` yang sama:

| Saat insert | Otomatis dibuat |
| --- | --- |
| `app_company` | `app_company_module` (semua module) + `app_user_company` (semua user) |
| `app_module` | `app_company_module` (semua company) + `app_user_privilege` (semua user-company) |
| `app_user` | `app_user_company` (semua company) |
| `app_user_company` | `app_user_privilege` (semua module) |

`app_company_module.is_active` & `app_user_company.is_active` = `false`;
`app_user_privilege.level` = `HIDE`. Semua memakai
`INSERT ... SELECT ... ON CONFLICT DO NOTHING` (idempoten). Karena setiap
entitas kini punya baris anak, `DELETE` pada module/company/user/user-company
ikut menghapus baris tautan & privilege terkait dalam satu transaksi.
| GET | `/rest/pages/APP04/types` | `app04.APP04TypesList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP04/types` | `app04.APP04TypesCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/types/:id` | `app04.APP04TypesGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP04/types/:id` | `app04.APP04TypesUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP04/types/:id` | `app04.APP04TypesDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/types/:id/steps` | `app04.APP04TypesStepsList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP04/types/:id/steps` | `app04.APP04TypesStepsCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/types/:id/steps/:sid` | `app04.APP04TypesStepsGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP04/types/:id/steps/:sid` | `app04.APP04TypesStepsUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP04/types/:id/steps/:sid` | `app04.APP04TypesStepsDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/types/:id/steps/:sid/signers` | `app04.APP04TypesStepsSignersList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP04/types/:id/steps/:sid/signers` | `app04.APP04TypesStepsSignersCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP04/types/:id/steps/:sid/signers/:uid` | `app04.APP04TypesStepsSignersUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP04/types/:id/steps/:sid/signers/:uid` | `app04.APP04TypesStepsSignersDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/forms` | `app04.APP04FormsList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP04/forms` | `app04.APP04FormsCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/forms/:id` | `app04.APP04FormsGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP04/forms/:id` | `app04.APP04FormsUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP04/forms/:id` | `app04.APP04FormsDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP04/forms/:id/flags` | `app04.APP04FormsFlagsList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP04/forms/:id/flags` | `app04.APP04FormsFlagsCreate` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP04/forms/:id/flags/:uid` | `app04.APP04FormsFlagsUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP04/forms/:id/flags/:uid` | `app04.APP04FormsFlagsDelete` | `USAuth(), USLock()` |

### APP05 — Session (admin)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/rest/pages/APP05/sessions` | `app05.APP05SessionsList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP05/sessions` | `app05.APP05SessionsCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP05/sessions/:id` | `app05.APP05SessionsGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP05/sessions/:id` | `app05.APP05SessionsUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP05/sessions/:id` | `app05.APP05SessionsDelete` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP05/tokens` | `app05.APP05TokensList` | `USAuth(), USLock()` |
| POST | `/rest/pages/APP05/tokens` | `app05.APP05TokensCreate` | `USAuth(), USLock()` |
| GET | `/rest/pages/APP05/tokens/:id` | `app05.APP05TokensGet` | `USAuth(), USLock()` |
| PUT | `/rest/pages/APP05/tokens/:id` | `app05.APP05TokensUpdate` | `USAuth(), USLock()` |
| DELETE | `/rest/pages/APP05/tokens/:id` | `app05.APP05TokensDelete` | `USAuth(), USLock()` |

> `app_user_session` tidak punya FK ke `app_user` (JOIN kiri untuk username);
> `app_user_token` punya FK `onDelete: Cascade`. Update token menerima
> `revoke: true/false` untuk mengisi/mengosongkan `revoked_at`; update sesi
> menerima `end: true` untuk `status='ENDED'` + `ended_at=now()`.

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
/proxy/pages/...   →  /rest/pages/APP01/...    (CRUD module, admin)
/proxy/pages/...   →  /rest/pages/APP02/...    (company + module/area, admin)
/proxy/pages/...   →  /rest/pages/APP03/...    (user + company/privilege/area, admin)
/proxy/pages/...   →  /rest/pages/APP04/...    (signature type + step/signer & form/flag, admin)
/proxy/pages/...   →  /rest/pages/APP05/...    (sesi login + token otentikasi, admin)
```

Contoh command (curl) untuk APP01 — butuh token admin (login dulu):

```bash
# 1. Login → simpan token
TOKEN=$(curl -s -X POST http://localhost:37772/rest/guest/PUB00 \
  -H "Content-Type: application/json" \
  --data-binary '{"company_id":"","username":"root","password":"AD_PASS"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).data.token))')

# 2. List module (grid) — tanpa auth akan 401
curl -s "http://localhost:37772/rest/pages/APP01/modules?page=1&page_size=10" \
  -H "Authorization: Bearer $TOKEN"

# 3. Detail module
curl -s http://localhost:37772/rest/pages/APP01/modules/<id> \
  -H "Authorization: Bearer $TOKEN"

# 4. Tambah module
curl -s -X POST http://localhost:37772/rest/pages/APP01/modules \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary '{"code":"APP02","name":"Module Baru","path":"/board/pages/APP/APP02","is_page":true,"is_active":true}'

# 5. Ubah module (partial update)
curl -s -X PUT http://localhost:37772/rest/pages/APP01/modules/<id> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary '{"name":"Module Diubah"}'

# 6. Hapus module
curl -s -X DELETE http://localhost:37772/rest/pages/APP01/modules/<id> \
  -H "Authorization: Bearer $TOKEN"
```

> `Bearer $TOKEN` memakai `Authorization`; untuk akses langsung via browser
> CORS mengharuskan origin `localhost:37771`/`172.99.77.1:37771`.

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