# Development — Menjalankan Stack OmniSight

> Panduan menjalankan seluruh komponen (database, backend, frontend) di
> lingkungan lokal. Prasyarat: Docker + Docker Compose, Node.js ≥ 20.19,
> Go ≥ 1.26.6, Python (opsional untuk tooling & testing).

## 1. Persiapan Environment

Persiapkan file `.env` tiap komponen (templat di repo):

### Database — `osc_base/.env`

```env
DATABASE_URL="postgresql://dbe:rahasia@localhost:37771/osc?sslmode=disable&schema=public"
AD_MAIL="admin@bismillah.com"
AD_PASS="rahasia2024"
```

- `DATABASE_URL` port harus sama dengan mapping container DB (lihat
  `docker-compose.yml`; saat ini `37771:5432`).
- `AD_MAIL`/`AD_PASS` dipakai pada seed admin.

### Backend — `osc_rest/.env`

```env
TZ=Asia/Jakarta
PG_HOST=localhost        # nama service di docker compose; localhost bila di host
PG_PORT=37771           # mapping host docker compose (37771:5432)
PG_DATA=osc
PG_USER=dbe
PG_PASS=rahasia
PG_SSLMODE=disable      # produksi: gunakan `require`/`verify-full`
IS_POOL=false
RE_FLAG=true
RE_DAYS=30
RE_LOGS=90
CR_KEYS=
RE_SECRET=              # WAJIB: ≥32 byte acak (openssl rand -base64 48)
LISTEN_ADDR=127.0.0.1:37772
```

> **Penting:** sejak audit keamanan, backend **menolak start** bila `RE_SECRET`
> kosong atau kurang dari 32 byte. Generate dengan `openssl rand -base64 48`,
> lalu isi `RE_SECRET`. `LISTEN_ADDR` default `127.0.0.1:37772` (hanya lokal);
> di dalam container set `LISTEN_ADDR=0.0.0.0:37772`. Lihat
> [security.md](security.md).

> Saat menjalankan backend di host (bukan docker), set `PG_HOST=localhost`
> dan sesuaikan `PG_PORT` / `PG_PASS` dengan container yang berjalan.

### Frontend — `osc_site/.env`

```env
TZ=Asia/Jakarta
BE_POOL=http://localhost:37772    # backend di host (port 37772)
```

> Di docker set `BE_POOL=http://osc_rest:37772` (lihat `Dockerfile`).
> Hanya `NEXT_PUBLIC_*` yang diekspos ke browser.

## 2. Menjalankan Database

```bash
# Pastikan network docker 'blackbox' ada (lihat compose; external)
docker network create blackbox 2>/dev/null || true

docker compose up -d osc_base        # PostgreSQL 18, port host 37771
docker compose ps
```

Migrasi + seed:

```bash
cd osc_base
npm install
npx prisma migrate dev               # terapkan migrasi (init)
npx prisma db seed                   # buat admin & modul
```

## 3. Menjalankan Backend

```bash
cd osc_rest
go mod download                       # ambil dependensi
go run .                              # listen :37772
```

Verifikasi:

```bash
curl -s http://localhost:37772/rest        # → {"message":"rest"}
curl -s http://localhost:37772/rest/guest/ # → {"message":"guest"}
curl -s http://localhost:37772/rest/guest/PUB00  # → {"data":[...]} daftar company
```

## 4. Menjalankan Frontend

```bash
cd osc_site
npm install
npm run dev                          # next dev, port 37773
```

Buka `http://localhost:37773` → login → `/board`.

> Catatan port: backend listen `37772`; frontend dev `37773`. CORS origin
> backend (localhost:37771 / 172.99.77.1:37771) hanya relevan bila akses
> langsung ke API dari browser; melalui proxy Next.js tidak berlaku.

## 5. Menjalankan Semua via Docker

`docker-compose.yml` (root repo) mendefinisikan service `osc_base`
(PostgreSQL 18), `osc_rest` (backend), `osc_site` (frontend), dan `osc_migrate`
(utilitas Prisma, one-shot, profil `setup`) — semuanya di network eksternal
`blackbox`. Build image komponen lebih dulu:

```bash
cd osc_rest && docker build -t osc_rest .
cd osc_site && docker build -t osc_site .
cd .. && docker compose up -d --build
```

Atau tanpa build manual (bila image sudah tersedia):

```bash
docker compose up -d
docker compose ps
```

Migrasi + seed via container:

```bash
docker compose run --rm osc_migrate
docker compose run --rm osc_migrate sh -c "npx prisma migrate deploy && npx prisma db seed"
```

Menjalankan agen (opsional, terpisah):

```bash
cd osc_auto && cp .env.example .env    # isi OSC_AGENT_TOKEN
docker compose -f docker-compose.agent.yml up -d --build
```

> Di produksi, **jangan** publikasikan `37772`/`37771` ke internet. Cukup
> ekspos frontend `37773` di balik reverse proxy TLS (lihat
> [../deploy/](../deploy/)). Bila frontend berjalan dalam container, set
> `LISTEN_ADDR=0.0.0.0:37772`.

Detail tambahan (env, override, agen) ada di
[../docker-compose.md](../docker-compose.md).

## 6. Unit Test (Python) — `osc_docs/testing`

Test kontrak ditulis Python (unittest, stdlib, tanpa dependensi tambahan):

| File | Yang diuji |
|---|---|
| `test_backend_api.py` | REST API `osc_rest` via HTTP: guest, login sukses/gagal, proteksi auth (401), profil, APP01 modules (admin), pagination default |
| `test_frontend_logic.py` | Logika TS asli `osc_site` (`grid.ts`, `utility.ts`, `backend.ts`) dieksekusi via Node `--experimental-strip-types` → `buildParams`, `toGridResult`, `parseSession`, `isSessionExpired`, `getInitials`, `formatDateTime`, `BE_POOL`/`WS_POOL` default |

Menjalankan (backend harus aktif di `:37772` agar `test_backend_api` lulus):

```bash
cd osc_docs/testing
python3 -m unittest discover -s . -p 'test_*.py' -v
```

Jalankan hanya satu modul:

```bash
python3 -m unittest -v test_frontend_logic   # tidak butuh server/db
```

Catatan:
- Base URL backend via env `OSC_BACKEND_URL` (default `http://localhost:37772`);
  username/password via `OSC_TEST_USER`/`OSC_TEST_PASS` (fallback ke `root` +
  `AD_PASS` dari `osc_base/.env`).
- `test_backend_api` **skip** otomatis bila server/DB tidak aktif.
- `test_frontend_logic` **skip** bila Node < 22.6 (tanpa `--experimental-strip-types`).

## 7. Troubleshooting Cepat

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| `Errno 111` ke DB | Port mapping DB beda | Samakan port `DATABASE_URL` & `PG_PORT` dengan `docker-compose` (`37771:5432`) |
| Backend tak connect DB | `.env` tidak terbaca | Pastikan jalankan dari folder `osc_rest`; cek `PG_HOST=localhost` bila di host |
| `invalid go version` saat build | Toolchain Go lama | Pasang Go ≥ 1.26.6 (lihat `go.mod`); utama `/usr/local/go` |
| Login gagal | DB belum di-seed | `npx prisma db seed` |
| CORS error | Origin beda dengan `AllowOrigins` | Set `CORS_ALLOWED_ORIGINS` (koma) di `.env` backend |
| Frontend 502 | `BE_POOL` salah | Perbaiki `BE_POOL` (`:37772`); pastikan backend jalan |
| Seed `P2002` (duplikat) | Username `where` vs `create` beda | Gunakan `username: "root"` di kedua blok `upsert` |

## 8. Verifikasi End-to-End

1. DB up + migrasi + seed → login admin.
2. Backend `curl` guest (`/rest/guest/PUB00`), login, lalu dengan token akses
   `/rest/pages/SYS01/profile`, `/rest/pages/SYS03/history`, dan (admin)
   `/rest/pages/APP01/modules`.
3. Frontend login → `/board` → sidebar memuat modul dari `/APP00/module`,
   halaman SYS01–SYS03 memuat data; APP01 (admin) CRUD module bekerja;
   APP02 (admin) CRUD company + module/area bekerja; APP03 (admin) CRUD user +
   company/privilege/area bekerja; APP04 (admin) CRUD signature type +
   step/signer & form/flag bekerja.
4. Unit test Python: `cd osc_docs/testing && python3 -m unittest discover -s . -v`.