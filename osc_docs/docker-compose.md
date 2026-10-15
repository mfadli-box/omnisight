# Docker Compose - Menjalankan OmniSight (Full Stack)

Dokumen ini menjelaskan cara menjalankan seluruh stack OmniSight menggunakan
Docker Compose: database (`osc_base`), backend (`osc_rest`), frontend
(`osc_site`), utilitas migrasi/seed (`osc_migrate`), dan **agen** (`osc_auto`).

> Ringkasan berkas compose:
> - `docker-compose.yml` (root) → host: `osc_base`, `osc_rest`, `osc_site`, `osc_migrate`.
> - `osc_auto/docker-compose.agent.yml` → agen: `agent_vm`, `agent_ci`, `agent_mx`, `agent_ws`.

## 1. Prasyarat

- Docker Engine ≥ 20.10
- Docker Compose ≥ 2.0
- Network `blackbox` sudah dibuat:

```bash
docker network create --subnet=172.99.0.0/16 blackbox
```

## 2. Persiapan Environment

Salin `.env.example` menjadi `.env` di root repository:

```bash
cp .env.example .env
```

Edit `.env` dan isi nilai wajib:

| Variabel | Keterangan | Contoh |
|---|---|---|
| `PG_PASS` | Password PostgreSQL (wajib) | `password_kuat` |
| `RE_SECRET` | Kunci enkripsi AES-GCM (wajib, ≥32 byte). Generate: `openssl rand -base64 48` | `...` |
| `CR_KEYS` | Token auth agent (pisah koma), kosong untuk nonaktif | `tok1,tok2` |
| `BE_POOL` | Backend URL (dikonfigurasi otomatis di compose) | `http://osc_rest:37772` |

Variabel lain dapat dibiarkan default untuk run lokal.

## 3. Menjalankan Stack

Dari root repo:

```bash
# Bangun image & jalankan service (db, backend, frontend)
docker compose up -d --build

# Cek status
docker compose ps

# Lihat log
docker compose logs -f osc_rest
```

Akses:
- Frontend: http://localhost:37773
- Backend API: http://localhost:37772
- Database: localhost:37771 (hanya lokal)

Semua port dibind ke `127.0.0.1` sehingga hanya bisa diakses dari host.

## 4. Migrasi & Seeding (Database)

Migrasi dijalankan oleh service one-shot `osc_migrate` (image dibangun dari
`osc_base/Dockerfile`, profil `setup` sehingga tidak ikut `up` biasa):

```bash
# Terapkan seluruh migrasi
docker compose run --rm osc_migrate

# Terapkan migrasi lalu seed data awal (admin, dll.)
docker compose run --rm osc_migrate sh -c "npx prisma migrate deploy && npx prisma db seed"
```

Alternatif dari host (bilamana Node.js tersedia):

```bash
cd osc_base
npm ci
npx prisma migrate deploy
npx prisma db seed
```

> Untuk development lokal gunakan `prisma migrate dev`; di Docker **wajib**
> `migrate deploy`.

## 5. Menghentikan Stack

```bash
# Hentikan semua
docker compose down

# Hentikan + hapus volume (akan menghapus data DB/files!)
docker compose down -v
```

## 6. Menjalankan Agen (osc_auto)

Agen adalah biner per-VM yang **hanya** berbicara dengan `osc_rest` melalui grup
`/rest/agent` (mTLS/token) dan **tidak pernah** mengakses database. Agen
dibangun dari satu Dockerfile generik (`osc_auto/Dockerfile.agent`) dengan build
arg `AGENT`.

Persiapan:

```bash
cd osc_auto
cp .env.example .env
# isi OSC_AGENT_TOKEN (samakan dengan CR_KEYS di root .env)
```

Menjalankan:

```bash
# Agen utama (per-VM + CI runner)
docker compose -f docker-compose.agent.yml up -d --build

# Cek & log
docker compose -f docker-compose.agent.yml ps
docker compose -f docker-compose.agent.yml logs -f agent_vm
```

| Service | Peran | Modul (capability) | Profil |
|---|---|---|---|
| `agent_vm` | Agen per-VM | `pod, net, obs, vms, sec, pam, web` | (default) |
| `agent_ci` | Runner CI/CD | `dso` | (default) |
| `agent_mx` | Mail-relay (scaffold) | `mail` | `mx` |
| `agent_ws` | Web-server/WAF (scaffold) | `web, waf` | `ws` |

`agent_mx` & `agent_ws` berada di belakang profil (belum diaktifkan secara
default, lihat [blueprint](planning/blueprint.md)). Aktifkan dengan:

```bash
docker compose -f docker-compose.agent.yml --profile mx --profile ws up -d
```

Agen mengekspos endpoint lokal `GET /health` dan `GET /info` pada port `37775`
(tidak dipublikasikan ke host). Endpoint operasional per modul masih scaffold.

> Di produksi, tanam satu agen di masing-masing VM target. Cukup jalankan
> service yang relevan, mis. `docker compose -f docker-compose.agent.yml up -d agent_vm`.
> Agen `agent_vm` memerlukan akses `/var/run/docker.sock` untuk modul POD;
> jika berjalan non-root, samakan GID docker host lewat `group_add`
> (lihat komentar di compose).

## 7. Build Image Manual (opsional)

```bash
docker build -t omnisight/rest   ./osc_rest
docker build -t omnisight/site   ./osc_site
docker build -t omnisight/schema ./osc_base
docker build -f osc_auto/Dockerfile.agent --build-arg AGENT=agent_vm -t omnisight/agent_vm ./osc_auto
```

## 8. Troubleshooting

| Masalah | Solusi |
|---|---|
| `RE_SECRET is not set` | Pastikan `RE_SECRET` terisi di `.env` |
| `PG_PASS must be set` | Pastikan `PG_PASS` terisi di `.env` |
| Backend gagal connect DB | Cek `osc_base` healthy, `PG_HOST=osc_base` (default compose) |
| Frontend 502 ke backend | Cek `osc_rest` up, `BE_POOL` benar |
| Port sudah dipakai | Ganti mapping di `docker-compose.yml` (hanya 127.0.0.1) |
| Migrasi gagal `P3005` (DB tidak kosong) | Tandai baseline: `docker compose run --rm osc_migrate npx prisma migrate resolve --applied <migrasi>` |
| Agen `heartbeat status=404` | Wajar jika endpoint `/rest/agent/heartbeat` belum diimplementasikan (scaffold) |

## 9. Catatan Keamanan

- Jangan expose port 37771/37772 ke publik. Gunakan reverse proxy (lihat `deploy/`) untuk 37773.
- `RE_SECRET` minimal 32 byte acak, disimpan aman.
- Gunakan TLS di production (Caddy/nginx contoh ada di `deploy/`).
- File sensitif di mount/volume `files`, jaga permission.
- Container backend & agen berjalan non-root dan memakai `no-new-privileges`.
- `.env` tidak pernah disalin ke image (lihat `.dockerignore`).
