# Docker Compose - Menjalankan OmniSight (Full Stack)

Dokumen ini menjelaskan cara menjalankan seluruh stack OmniSight menggunakan Docker Compose, termasuk database, backend, frontend, dan optional agent.

## 1. Prasyarat

- Docker Engine ≥ 20.10
- Docker Compose ≥ 2.0
- Network `blackbox` sudah dibuat: `docker network create --subnet=172.99.0.0/16 blackbox`

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
# Jalankan semua service (db, backend, frontend)
docker compose up -d

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

Database sudah up, perlu migrasi dan seed data awal:

```bash
cd osc_base
npm ci
npx prisma migrate deploy
npx prisma db seed
```

Atau jika menggunakan Prisma Migrate dev di lokal (development), namun untuk Docker gunakan `migrate deploy`.

## 5. Menghentikan Stack

```bash
# Hentikan semua
docker compose down

# Hentikan + hapus volume (akan menghapus data DB/files!)
docker compose down -v
```

## 6. Menjalankan Agent (Opsional)

Agent digunakan untuk integrasi dengan host/docker external. Buat `.env` di `osc_auto/`:

```bash
cd osc_auto
cp .env.example .env 2>/dev/null || true
```

Atur `OSC_AGENT_TOKEN` sesuai `CR_KEYS` di root `.env`. Jalankan agent:

```bash
docker compose -f docker-compose.agent.yml up -d
```

Cek:
```bash
docker compose -f docker-compose.agent.yml ps
docker compose -f docker-compose.agent.yml logs -f agent_vm
```

## 7. Troubleshooting

| Masalah | Solusi |
|---|---|
| `RE_SECRET is not set` | Pastikan `RE_SECRET` terisi di `.env` |
| `PG_PASS must be set` | Pastikan `PG_PASS` terisi di `.env` |
| Backend gagal connect DB | Cek `osc_base` healthy, `PG_HOST=osc_base` (default compose) |
| Frontend 502 ke backend | Cek `osc_rest` up, `BE_POOL` benar |
| Port sudah dipakai | Ganti mapping di `docker-compose.yml` (hanya 127.0.0.1) |

## 8. Catatan Keamanan

- Jangan expose port 37771/37772 ke publik. Gunakan reverse proxy (lihat `deploy/`) untuk 37773.
- `RE_SECRET` minimal 32 byte acak, disimpan aman.
- Gunakan TLS di production (Caddy/nginx contoh ada di `deploy/`).
- File sensitif di mount/volume `files`, jaga permission.
