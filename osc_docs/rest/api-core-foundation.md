# Technical Specification: API Core Foundation (Health & Error Framework)

- **Date**: 2026-11-12 (revisi 2 — correlation tracing, log JSON + redaksi, kontrak bersama)
- **Author**: ai-rest (Rust Backend & Security Engineer)
- **Target Project**: `osc_rest`
- **Shared Contract File**: `osc_docs/rest/contracts/core.schema.json`
- **Clean Architecture Layers Touched**: `domain`, `application`, `infrastructure`, `presentation`
- **Blueprint Ref**: `osc_docs/architecture.md` (Fase 2)

## 1. Overview & Architectural Flow

Fondasi proyek Rust `osc_rest` dibangun dengan **Clean Architecture** (dependensi hanya mengarah ke dalam) menggunakan **axum 0.8**, **sqlx 0.9** (PostgreSQL), **aws-sdk-s3** (RustFS), dan **calamine/rust_xlsxwriter** (tersedia untuk fase Excel berikutnya).

```
GET /api/v1/health
  → middleware/security_headers.rs   (layer terluar: header keamanan semua respons)
  → middleware/correlation_id.rs     (X-Correlation-ID: ekstrak/generate UUIDv7,
                                      tracing span, echo header, sisip ke envelope error)
  → presentation/http/handlers/health.rs      (axum handler, State<AppState>)
  → application/health.rs :: check(db, storage)   (use case, tokio::join! paralel)
  → domain/ports.rs :: DatabaseProbe / StorageProbe   (trait — static dispatch, tanpa async-trait)
  → infrastructure/persistence.rs (sqlx PgPool, SELECT 1)
  → infrastructure/storage.rs     (aws-sdk-s3 ListBuckets ke RustFS)
```

Aturan dependensi yang dipaksa:

| Layer | Boleh bergantung pada | Dilarang meng-import |
| :--- | :--- | :--- |
| `domain/` | std, thiserror | axum, sqlx, aws_sdk, calamine/rust_xlsxwriter |
| `application/` | `domain/`, tokio (join), serde (output DTO) | framework HTTP, driver DB/SDK |
| `infrastructure/` | `domain/` ports + sqlx + aws-sdk-s3 | axum |
| `presentation/` | `application/`, `infrastructure/` (wiring), axum, serde_json | — |

Catatan wiring: `AppState` (persistence) dibangun **hanya di `main.rs`** — satu-satunya titik yang menyatukan adapter → handler; mencegah dependensi silang antar-layer.

### Pembenahan dari audit bootstrap

- Pohon `src/app/api/proxy` (pola Next.js yang salah tempat, semuanya kosong) **dihapus** dan digantikan layout Rust di atas.
- `Cargo.toml` kosong kini terisi manifest lengkap (edition 2024, rustc 1.99).
- Startup: graceful shutdown SIGINT/SIGTERM, tracing via `RUST_LOG`, pool PostgreSQL (max 10 koneksi, acquire timeout 5 d), wrapper aws-sdk-s3 menunjuk `RUSTFS_ENDPOINT`.

## 2. REST API Endpoint & Schema Contract

### `GET /api/v1/health`
- **Auth & Permissions**: `Public` (readiness probe untuk Docker healthcheck & monitoring).
- **Rate Limit**: belum (ditambahkan bersama `tower-governor` pada fase auth).
- **Headers**: `X-Correlation-ID` — WAJIB ada di semua respons: di-echo dari klien bila valid (charset `[A-Za-z0-9._/-]`, maks 64 byte), selain itu digenerate UUIDv7; ID yang sama menempel pada tracing span log JSON. `Content-Type: application/json`.

#### Request Schema
Tidak ada body/query param.

#### Response Schema

**`200 OK`** — semua dependensi sehat:
```json
{
  "status": "ok",
  "checks": { "database": "up", "storage": "up" }
}
```

**`503 SERVICE_UNAVAILABLE`** — ada dependensi turun (readiness, bukan crash):
```json
{
  "status": "degraded",
  "checks": { "database": "up", "storage": "down" }
}
```

#### Error Responses (envelope generik seluruh API)

Header `X-Correlation-ID` selalu terpasang; middleware correlation menyisipkan field `correlation_id` ke SETIAP envelope error JSON (nilai sama dengan header) — konsumen cukup melaporkan ID tersebut tanpa membaca header:

```json
{
  "status": "error",
  "correlation_id": "01969e5a-7c3f-7d3a-9d2b-4f0a1c8e5b21",
  "error": { "code": "VALIDATION_ERROR", "message": "..." }
}
```

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid input format / header spreadsheet mismatch (fase excel) |
| `401` | `UNAUTHORIZED` | Missing, expired, or tampered token (fase auth) |
| `403` | `FORBIDDEN` | Insufficient role/resource ownership (fase auth) |
| `413` | `PAYLOAD_TOO_LARGE` | File exceeds max allowed size (fase excel) |
| `429` | `RATE_LIMITED` | Rate limit terlampaui (fase auth) |
| `500` | `INTERNAL_ERROR` | Kegagalan internal — **detail hanya ke log (redaksi secret), pesan ke klien generik** |

Bentuk envelope: `{"status": "error", "correlation_id": "…", "error": {"code": "...", "message": "..."}}` — didefinisikan di `presentation/error.rs` (`AppError` + `IntoResponse` + `From<DomainError>`); error infrastruktur dibungkus `AppError::internal()` yang me-redaksi detail via `infrastructure::logging::redact()` sebelum `tracing::error!`, lalu menimpa pesan dengan `"internal server error"`.

## 3. Excel Schema Specification

Belum berlaku pada fase ini. `calamine` 0.38 & `rust_xlsxwriter` 0.102 sudah dideklarasikan sebagai dependency; spesifikasi template Excel (sheet, limit ukuran/baris, chunk `UNNEST`, presigned URL RustFS) akan didokumentasikan pada fase Excel dengan `spawn_blocking` untuk seluruh pemrosesan CPU-bound.

## 4. Storage (RustFS) & Database Interaction

- **PostgreSQL** (`infrastructure/persistence.rs`): `PgPoolOptions` max 10 koneksi, acquire timeout 5 detik; probe `SELECT 1` runtime-query (bukan macro → kompilasi tidak butuh DB). Getter `pool()` disiapkan untuk repository fase berikutnya (bulk `UNNEST`, transaksi eksplisit).
- **RustFS** (`infrastructure/storage.rs`): `RustfsClient` membungkus `aws-sdk-s3::Client` dengan `endpoint_url = RUSTFS_ENDPOINT`, SigV4 (region dummy `us-east-1`, RustFS tidak memvalidasi), kredensial dari env. Readiness memakai `ListBuckets` (layanan terjangkau & auth valid); verifikasi per-bucket `head_bucket()` dijalankan sebagai **diagnostik startup non-fatal** (bucket boleh belum dibuat pada fase bootstrap) dan wajib oleh pipeline excel nanti.
- **Observability** (`infrastructure/logging.rs`): subscriber **JSON terstruktur** (`tracing-subscriber` feature `json`) dengan `RUST_LOG` (default `info`); secret dari env (password `DATABASE_URL`, `RUSTFS_SECRET_KEY`, `RUSTFS_ACCESS_KEY`, min 8 byte) teregistrasi saat startup dan `redact()` menutup kemunculannya + pola `password=…`/`token=…`/`api_key=…`/`Bearer …` sebelum pesan masuk log. Aturan: teks dari luar (error infra, payload klien) wajib melewati `redact()` — titik pusat `AppError::internal()` dan startup-failure log `main.rs`.
- **Env vars** (selaras root `docker-compose.yml`): `REST_HOST`/`REST_PORT`, `DATABASE_URL`, `RUSTFS_ENDPOINT`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `RUSTFS_BUCKET`, `RUST_LOG` — lihat `osc_rest/.env.example`.

## 5. Security Controls & Threat Mitigation

- [x] **Correlation tracing** (`middleware/correlation_id.rs`): `X-Correlation-ID` di-ekstrak/generate (UUIDv7) pada SETIAP request, sanitasi ketat (charset `[A-Za-z0-9._/-]`, maks 64 byte — menutup log injection), menempel pada `tracing::info_span!` (muncul di semua log JSON request), di-echo sebagai header respons, dan disisipkan otomatis ke envelope error JSON; jalur streaming (SSE/WS 101) tidak pernah di-buffer.
- [x] **Log JSON terstruktur + redaksi secret** (`infrastructure/logging.rs`): siap dikonsumsi collector/SIEM; password DB, `RUSTFS_SECRET_KEY`/`ACCESS_KEY`, pola `password=…`/`token=…`/`api_key=…`/`Bearer …` ditutup `[REDACTED]` sebelum masuk log.
- [x] **Security headers** di semua respons (`middleware/security_headers.rs`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Strict-Transport-Security`, `Content-Security-Policy: default-src 'none'` (API-only), `Cache-Control: no-store`.
- [x] **Error masking** — `AppError::internal()` me-redaksi detail sebelum log; klien hanya menerima pesan generik; envelope tanpa stack trace/SQL error/path bucket. `From<DomainError>` memetakan `Unavailable` → log redaksi + 500 generik.
- [x] **SQL injection** — sqlx parameterized/runtime query; dilarang format string SQL dari input klien.
- [x] **Tanpa `.unwrap()`/`.expect()`** di request path; error di-propagate `Result` + `AppError` (unwrap terbatas pada startup: parse env/listener).
- [x] **Graceful shutdown** SIGINT/SIGTERM — drain koneksi saat `docker stop`.
- [x] **Non-root container** — Dockerfile runtime `debian:bookworm-slim`, UID 10001, `ca-certificates` + `curl` (khusus healthcheck compose). Builder stage **pinned** `lukemathwalker/cargo-chef:latest-rust-1.99.1-slim-bookworm` — tag melayang `latest-rust-1` kini berbasis trixie (glibc 2.41) dan membuat binary gagal di bookworm (`GLIBC_2.38 not found`); ditemukan & diperbaiki pada verifikasi compose Fase 6 (`osc_docs/verification.md`).
- [x] **Unit test fondasi** — 19 test: use case health (probe fake), sanitasi + middleware correlation (oneshot tower), redaksi, pemetaan error & kontrak JSON.
- [ ] **CORS ketat & rate limiting** (`tower-governor`) — fase auth.
- [ ] **JWT/PASETO + Argon2id + RBAC extractors** — fase auth.
- [ ] **Multipart size limits, magic-byte `.xlsx`, formula-injection sanitizing, `spawn_blocking`** — fase excel.

## 6. Verification

```bash
cd osc_rest
cargo fmt                    # normalisasi format
cargo check                  # verifikasi kompilasi
cargo clippy -- -D warnings  # lints — warning = gagal (standar rilis)
cargo test                   # 19 test fondasi: health, correlation, redaksi, error mapping
```

Build image & uji endpoint (butuh stack DB/storage hidup):
```bash
docker compose build osc_rest
docker compose up -d osc_base osc_file osc_rest
docker compose exec osc_rest curl -fsS http://localhost:8000/api/v1/health
# Verifikasi correlation tracing (header + envelope error JSON):
docker compose exec osc_rest curl -fsSi http://localhost:8000/api/v1/health | grep -i x-correlation-id
```

Kontrak machine-readable untuk `ai-site`/`ai-auto`/`ai-test`: `osc_docs/rest/contracts/core.schema.json` (JSON Schema draft 2020-12, `$defs`: `HealthReport`, `ErrorEnvelope`, `ErrorCode`, `XCorrelationIdHeader`; referensi lintas-domain via `core.schema.json#/$defs/<nama>`).
