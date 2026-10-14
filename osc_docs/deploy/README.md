# Deployment & Keamanan Publik (OmniSight)

Folder ini berisi contoh konfigurasi reverse proxy + TLS untuk mengekspos
OmniSight ke internet dengan aman. Lihat juga dokumen audit di
`osc_docs/development/security.md`.

## Arsitektur yang disarankan

```
Internet ──443/TLS──▶ Caddy/nginx ──127.0.0.1:37773──▶ osc_site (Next.js)
                                                        │
                                                        ├─127.0.0.1:37772─▶ osc_rest (Go)
                                                        └─blackbox network─▶ osc_base (Postgres)
```

Aturan wajib:
- Hanya port **80/443** yang terbuka ke publik (firewall).
- `osc_rest` (:37772) dan `osc_base` (:37771) **hanya** di localhost / network privat.
- TLS diterminasi di reverse proxy; aktifkan **HSTS**.

## Langkah

1. Salin `.env.example` menjadi `.env` dan isi nilai rahasia (jangan pernah commit).
   Minimal: `PG_PASS`, `RE_SECRET` (≥32 byte acak), `CR_KEYS`.
2. Jalankan database + backend + frontend (lihat `README.md`).
3. Pilih salah satu reverse proxy:
   - **Caddy** (paling mudah, TLS otomatis): `deploy/Caddyfile`
   - **nginx**: `deploy/nginx.conf` + certbot
4. Arahkan DNS domain ke host, jalankan reverse proxy.
5. Verifikasi: `curl -I https://domain` → ada `Strict-Transport-Security`,
   `Content-Security-Policy`, dan hanya 80/443 terbuka (`nmap`).

## Environment tambahan (opsional)

| Variabel | Fungsi | Default |
| --- | --- | --- |
| `LISTEN_ADDR` | alamat bind backend | `127.0.0.1:37772` |
| `PG_SSLMODE` | mode TLS ke Postgres | `disable` |
| `CORS_ALLOWED_ORIGINS` | origin CORS diizinkan (koma) | localhost dev |
| `TRUSTED_PROXIES` | proxy yang dipercaya untuk X-Forwarded-For | `localhost,172.99.77.1` |
| `WS_ALLOWED_ORIGINS` | allowlist Origin WebSocket | same-host |
| `HRIS_ALLOWED_HOSTS` | allowlist host endpoint HRIS (koma) | hanya https |
| `NEXT_PUBLIC_WS_POOL` | URL WebSocket publik | turunan `BE_POOL` |

> Setelah di belakang proxy, tambahkan IP reverse proxy ke `TRUSTED_PROXIES`
> agar rate-limit memakai IP klien sebenarnya (bukan IP proxy).
