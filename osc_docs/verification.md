# Compose & End-to-End Verification Report (Bootstrap Fase 6)

- **Date**: 2026-11-11
- **Author**: ai-main (PM, System Analyst & Docker DevOps Architect)
- **Source Target**: workspace lokal `omnisight` (fase 0–5 selesai)
- **Scope**: Infrastructure & verification (build, network isolation, healthcheck, BFF proxy end-to-end)
- **Delegated Skills**: `ai-base`, `ai-rest`, `ai-site`, `ai-auto`, `ai-test` (hasil fase masing-masing diverifikasi menyeluruh di sini)

## 1. Executive Summary

Seluruh stack omnisight **hidup dan healthy**: `osc_base` (PostgreSQL 18), `osc_rustfs` (RustFS 1.0.4), `osc_rest` (Rust API — probe DB + storage UP), dan `osc_site` (Next.js + BFF proxy) semua `healthy` dengan urutan `depends_on: service_healthy` yang berfungsi. Verifikasi end-to-end menemukan & memperbaiki **3 isu riil** (glibc mismatch, bug prefix path proxy yang membuat seluruh request proxy ditolak, inkonsistensi Referrer-Policy) — persis tujuan fase ini.

## 2. Verification Matrix

| # | Pemeriksaan | Perintah/observasi | Hasil |
| :--- | :--- | :--- | :--- |
| V-01 | Build image | `docker compose build osc_rest osc_site` | ✅ `omnisight/osc_rest:latest`, `omnisight/osc_site:latest` |
| V-02 | Orkestrasi + health | `docker compose up -d --wait` | ✅ 4/4 container `healthy` (urutan: base → rustfs → rest → site) |
| V-03 | Health internal osc_rest | `docker compose exec osc_rest curl localhost:8000/api/v1/health` | ✅ `{"status":"ok","checks":{"database":"up","storage":"up"}}` |
| V-04 | Liveness osc_site (host) | `curl localhost:3000/api/health` | ✅ `200 {"status":"ok","service":"osc_site"}` |
| V-05 | **BFF proxy end-to-end** | `curl localhost:3000/api/proxy/v1/health` | ✅ `200 {"status":"ok","checks":{"database":"up","storage":"up"}}` — browser→proxy→osc_rest→PG+RustFS |
| V-06 | Proxy default-deny (SSRF) | `curl localhost:3000/api/proxy/v1/not-allowed` | ✅ `404 {"error":{"code":"PATH_NOT_ALLOWED"}}` |
| V-07 | Proxy CSRF guard | `DELETE .../proxy/v1/users/1` tanpa Origin | ✅ `403 {"error":{"code":"ORIGIN_REJECTED"}}` |
| V-08 | Proxy origin valid → upstream | `DELETE` + `Origin: http://localhost:3000` | ✅ lolos proxy → `404` upstream (route `users` belum ada — wajar fase bootstrap) |
| V-09 | Header keamanan respons | grep header `/api/proxy/v1/health` | ✅ `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` |
| V-10 | Isolasi port host | `docker compose ps --format Publishers` | ✅ hanya `osc_site:3000` + `osc_base:36661`; `osc_rest` & `rustfs` **0 host port** |
| V-11 | Internal network | compose: `osc_internal` (internal:true, 172.30.0.0/24) + `osc_edge` (172.30.1.0/24) + `blackbox` (external) | ✅ sesuai blueprint Fase 0 |

## 3. Issues Found & Fixes (root-cause)

| # | Isu | Root cause | Fix | Status |
| :--- | :--- | :--- | :--- | :--- |
| F-01 | `osc_rest` crash-loop: `GLIBC_2.38 not found` | Builder `lukemathwalker/cargo-chef:latest-rust-1` (tag melayang) kini berbasis **trixie** (glibc 2.41); runtime bookworm hanya punya glibc 2.36 | Pin builder ke `cargo-chef:latest-rust-1.99.1-slim-bookworm` (slim + bookworm + rustc 1.99.1 yang sudah diverifikasi Fase 2) | ✅ Fixed — V-03 lulus |
| F-02 | **Semua** request proxy ditolak `404 PATH_NOT_ALLOWED` | `normalizeProxyPath()` menghasilkan path upstream relatif (`/v1/health`) sementara whitelist ditulis dalam bentuk kontrak upstream (`/api/v1/health`) → tidak ada path yang bisa lolos | Prefix gateway eksplisit: `/api/proxy/<X>` → `/api/<X>` (segmen tetap disanitasi anti-traversal; prefix tidak bisa di-escape) — sinkron dengan tabel mapping doc ai-site | ✅ Fixed — V-05/V-06/V-07 lulus |
| F-03 | `Referrer-Policy` proxy terobservasi `strict-origin-when-cross-origin` | Header global `next.config.ts` berlaku juga pada route handler dan menimpa nilai `no-referrer` dari `SECURITY_HEADERS` handler | Samakan posture global → `no-referrer` (lebih ketat & konsisten) | ✅ Fixed — V-09 lulus |

## 4. How to Re-verify

```bash
cd /home/usr/omnisight
docker compose up -d --wait --wait-timeout 300
docker compose ps                                        # 4x healthy
docker compose exec osc_rest curl -fsS localhost:8000/api/v1/health
curl -s localhost:3000/api/health                        # liveness site
curl -s localhost:3000/api/proxy/v1/health               # end-to-end BFF
curl -s  localhost:3000/api/proxy/v1/not-allowed         # 404 PATH_NOT_ALLOWED
curl -si -X DELETE localhost:3000/api/proxy/v1/users/1   # 403 ORIGIN_REJECTED (tanpa Origin)
```

## 5. Notes & Follow-ups

- Port host `8000` dijawab **layanan asing pre-existing** (docker-proxy container Laravel/nginx, proyek lain di host ini) — bukan bagian stack omnisight; `osc_rest` memang tidak di-publish ke host (akses via network internal / BFF). Suite QA/SOC (`rest_qad`, `rest_soc`) sudah memiliki **gate sidik jari target** sehingga test live aman dari salah sasaran; untuk uji live penuh, arahkan `QA_TARGET_BASE_URL`/`SOC_TARGET_BASE_URL` ke instance osc_rest yang benar (mis. sementara publish port, atau jalankan di dalam network internal).
- CSP masih `'unsafe-inline'` bootstrap (nonce menyusul bersama middleware auth — TODO fase auth, terdokumentasi di `osc_docs/site/proxy-and-architecture.md`).
- `agent_cs` berjalan di host (bukan container) sesuai desain; `docker-compose.yml` tidak mendaftarkan service agent.
- Konvensi kredensial dev tetap: `.env` root (`PG_*`) + default compose RustFS (`oscadmin`/`password_osc_rustfs`) — tidak ada secret di-commit.
