# INSTALL — Persiapan Lingkungan OmniSight

Panduan lengkap berada di [**osc_docs/development/run.md**](osc_docs/development/run.md).
Ringkasan:

## Prasyarat

| Tool | Versi minimum |
|---|---|
| Node.js + npm | Node ≥ 20.19 (direkomendasikan 22.x) |
| Go | ≥ 1.26 |
| Docker + Docker Compose | terbaru |
| PostgreSQL | via container `postgres:18-alpine` (dari `docker-compose.yml`) |

> Catatan environment terpasang (dari `notes.txt`): Node v22.23.2 / npm 10.9.8,
> Go 1.26+. Lihat [notes.txt](notes.txt).

## Langkah

```bash
# 1. Start database
docker compose up -d osc_base

# 2. Migrasi & seed database
cd osc_base && npm install && npx prisma migrate dev && npx prisma db seed

# 3. Backend
cd osc_rest && go mod download && go run .

# 4. Frontend
cd osc_site && npm install && npm run dev
```

Alternatif serba-Docker (database + backend + frontend + migrasi):

```bash
cp .env.example .env            # isi PG_PASS & RE_SECRET
docker compose up -d --build    # osc_base, osc_rest, osc_site
docker compose run --rm osc_migrate sh -c "npx prisma migrate deploy && npx prisma db seed"
```

Agen (opsional) — lihat [`osc_auto/README.md`](osc_auto/README.md):

```bash
cd osc_auto && cp .env.example .env && docker compose -f docker-compose.agent.yml up -d --build
```

Detail & troubleshooting: [osc_docs/development/run.md](osc_docs/development/run.md)
dan [osc_docs/docker-compose.md](osc_docs/docker-compose.md).