# Compose Development

Compose ini hanya untuk development: PostgreSQL, PgBouncer, `osc_rest`, dan `osc_site`.
Tidak ada modul domain, autentikasi, RLS, atau tabel domain pada WP-01.

## Menjalankan

Dari root repositori:

```bash
docker compose -f deploy/compose/core.compose.yaml \
  --env-file deploy/compose/.env.example up -d --build
docker compose -f deploy/compose/core.compose.yaml \
  --env-file deploy/compose/.env.example ps
```

Nilai di `.env.example` hanya placeholder. Untuk mengganti nilai lokal, salin ke
`deploy/compose/.env` (diabaikan Git) dan jangan menaruh rahasia nyata di repositori.

## Health

`osc_rest` tidak mempublikasikan port ke host. Periksa endpoint internal dari dalam jaringan:

```bash
docker compose -f deploy/compose/core.compose.yaml \
  --env-file deploy/compose/.env.example exec -T osc-rest \
  curl -fsS http://127.0.0.1:8080/internal/healthz
```

Landing `osc_site` tersedia di `http://127.0.0.1:3000`.

Endpoint `/internal/healthz` dan `/internal/metrics` hanya untuk jaringan internal dan
tidak boleh dipakai sebagai halaman publik.

## Batas keamanan

- Tidak ada mount Docker socket.
- Semua layanan memakai `no-new-privileges`.
- `osc_rest`, `osc_site`, dan `pgbouncer` menjalankan proses sebagai non-root.
- Database dan PgBouncer hanya berada di jaringan internal.
- Hanya `osc_site` yang dipublikasikan, dan hanya ke loopback host.
