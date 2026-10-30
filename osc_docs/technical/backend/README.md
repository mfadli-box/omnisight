# Backend Rust: osc_rest

## 1. Tujuan

`osc_rest` adalah satu-satunya pintu tulis ke database domain dan pintu utama bagi frontend, agent, serta `osc_auto`. Backend ini menangani:

- Autentikasi pengguna (lokal, HRIS, OIDC di masa depan).
- Otorisasi `read`/`post` berbasis perusahaan dan area.
- Use case domain dan transaksi database.
- Audit trail.
- Adapter integrasi eksternal.
- API publik untuk frontend dan API internal untuk `osc_auto`/agent.

## 2. Stack

| Kebutuhan | Pilihan |
|---|---|
| Bahasa | Rust stable terbaru |
| Web | Axum + Tower |
| Runtime | Tokio |
| Database | SQLx + PostgreSQL |
| Serialisasi | Serde |
| Validasi | Validator + validasi domain |
| Password | Argon2id |
| JWT | EdDSA/Ed25519, `jsonwebtoken` |
| Observability | tracing, OpenTelemetry, Prometheus |
| OpenAPI | utoipa |
| Error | thiserror di domain, anyhow hanya di adapter |
| Testing | unit, integration testcontainers, wiremock, k6 |

Kontrak rute mesin-terbaca: [../contracts/openapi.json](../contracts/openapi.json) dan [../contracts/permissions.json](../contracts/permissions.json). Keduanya disetujui bersama 0.6 (G0).

## 3. Clean architecture

```text
┌─────────────────────────────────────────────┐
│              osc_api (Axum)                 │
│  handler, DTO, middleware, OpenAPI          │
└──────────────────────┬──────────────────────┘
                       │ memanggil use case
┌──────────────────────▼──────────────────────┐
│           osc_application                   │
│  use case, command/query, port, policy      │
└──────────────────────┬──────────────────────┘
                       │ bergantung pada domain
┌──────────────────────▼──────────────────────┐
│              osc_domain                     │
│  entity, value object, aturan bisnis, error │
└──────────────────────▲──────────────────────┘
                       │ implementasi port
┌──────────────────────┴──────────────────────┐
│              osc_adapters                   │
│  PostgreSQL, HRIS, RouterOS, Docker, Wazuh, │
│  storage, mail, vault, OpenTelemetry        │
└─────────────────────────────────────────────┘
```

Aturan dependensi:

- `osc_domain` tidak bergantung pada framework, database, HTTP, atau crate eksternal berat.
- `osc_application` mendefinisikan trait port dan use case; tidak tahu Axum maupun SQLx.
- `osc_adapters` mengimplementasikan port.
- `osc_api` adalah composition root: menyusun adapter dan use case.
- Tidak ada akses database langsung dari handler.

## 4. Struktur crate

```text
osc_rest/
├── Cargo.toml
├── crates/
│   ├── domain/
│   │   ├── src/
│   │   │   ├── identity/
│   │   │   ├── asset/
│   │   │   ├── network/
│   │   │   ├── monitoring/
│   │   │   ├── ops/
│   │   │   ├── service_desk/
│   │   │   ├── content/
│   │   │   ├── audit/
│   │   │   └── shared/
│   │   └── tests/
│   ├── application/
│   │   ├── src/
│   │   │   ├── ports/
│   │   │   ├── use_cases/
│   │   │   └── dto/
│   │   └── tests/
│   ├── adapters/
│   │   ├── src/
│   │   │   ├── postgres/
│   │   │   ├── auth/
│   │   │   ├── hris/
│   │   │   ├── routeros/
│   │   │   ├── containers/
│   │   │   ├── edge/
│   │   │   ├── monitoring/
│   │   │   ├── itsm/
│   │   │   ├── cmdb/
│   │   │   ├── bastion/
│   │   │   ├── storage/
│   │   │   ├── mail/
│   │   │   └── vault/
│   │   └── tests/
│   └── api/
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/
│       │   ├── dto/
│       │   ├── openapi/
│       │   └── state.rs
│       └── tests/
├── openapi.json
└── README.md
```

## 5. Use case dan pola

### 5.1 Satu use case, satu tanggung jawab

Contoh use case:

- `LoginWithHris`
- `SwitchCompany`
- `ListAssets`
- `CheckoutAsset`
- `PlanFirewallChange`
- `ApproveFirewallChange`
- `DeployStack`
- `RestoreConfigBackup`
- `CreateTicket`
- `AppendAuditEvent`

Use case menerima command/query yang sudah tervalidasi, memuat data via port, memutuskan aturan domain, lalu menyimpan lewat unit of work.

### 5.2 Port

```rust
#[async_trait]
pub trait AssetRepository: Send + Sync {
    async fn list(
        &self,
        tenant: &TenantContext,
        filter: AssetFilter,
    ) -> Result<Page<Asset>, RepositoryError>;

    async fn find(
        &self,
        tenant: &TenantContext,
        id: AssetId,
    ) -> Result<Option<Asset>, RepositoryError>;

    async fn save(
        &self,
        tenant: &TenantContext,
        asset: &Asset,
        expected_version: i32,
    ) -> Result<(), RepositoryError>;
}
```

Port tidak mengekspos tipe SQLx. Error database dipetakan ke error domain/repository.

### 5.3 Unit of Work

```rust
#[async_trait]
pub trait UnitOfWork: Send + Sync {
    async fn begin(&self, tenant: &TenantContext) -> Result<Box<dyn Tx>, RepositoryError>;
}
```

Transaksi menetapkan `app.company_id`, `app.user_id`, dan `app.request_id` sebelum query domain. Audit ditulis di transaksi yang sama.

### 5.4 Outbox

Notifikasi dan webhook tidak dikirim langsung di request pengguna. Use case menulis `platform.outbox_events` dalam transaksi. Notifier `osc_auto` mengambil event lewat API internal, mengirim, lalu menandai selesai. Ini mencegah kehilangan event dan mempercepat respons.

### 5.5 Idempotency

- Endpoint `post` yang memicu aksi eksternal menerima `Idempotency-Key`.
- Kunci disimpan per pengguna/tenant dengan hash request.
- Request ulang dengan kunci sama mengembalikan hasil yang sama, bukan mengeksekusi dua kali.
- Berlaku untuk deploy, restore, firewall change, dan pembayaran/notifikasi eksternal bila ada.

### 5.6 Optimistic locking

Entity yang dapat diedit bersamaan memiliki `version`. Update menyertakan `expected_version`; jika tidak cocok, kembalikan kode konflik, bukan menimpa diam-diam.

## 6. Middleware

Urutan middleware yang direncanakan:

1. `request_id`: membuat/menerima `X-Request-Id`, memasang ke span.
2. `trace`: OpenTelemetry span.
3. `security_headers`: header keamanan.
4. `body_limit`: batas ukuran request.
5. `timeout`: batas waktu request.
6. `rate_limit`: per IP, per pengguna, per endpoint sensitif.
7. `cors`: allowlist origin.
8. `csrf`: untuk request cookie-based.
9. `authn`: verifikasi JWT, sesi, dan status pengguna.
10. `locale`: tentukan `en`/`id` dari `Accept-Language`, locale pengguna, atau locale perusahaan; pasang `Content-Language`.
11. `tenant`: validasi perusahaan aktif dan membership.
12. `authz`: cek izin `read`/`post` dan scope.
13. `audit`: catat aksi sukses/gagal yang relevan.
14. `error_map`: ubah semua error menjadi envelope HTTP 200.

## 7. Autentikasi

- Password lokal: Argon2id dengan parameter yang dituning (memori, iterasi, paralelisme).
- JWT: EdDSA, umur pendek, `kid` untuk rotasi kunci.
- Refresh token: opaque, disimpan sebagai hash, dirotasi, reuse detection.
- Sesi: dapat dicabut; perubahan peran atau status pengguna mencabut sesi terkait.
- MFA: TOTP/WebAuthn; wajib untuk admin dan aksi sensitif.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax/Strict` sesuai alur; CSRF token untuk POST.
- Jangan menyimpan token di `localStorage`.
- Jangan menaruh password, OTP, atau refresh token di log.

Detail alur ada di [topologi-dan-akses.md](topologi-dan-akses.md) dan [kontrak-api.md](kontrak-api.md).

## 8. Otorisasi

- Izin dasar hanya `read` dan `post`.
- Setiap route mendeklarasikan `module_code` dan `action`.
- Scope perusahaan berasal dari membership, bukan dari body.
- Scope area divalidasi untuk setiap entitas yang diakses.
- Aksi sensitif memiliki flag `is_sensitive` dan memerlukan approval.
- Penolakan akses tidak memakai HTTP 403, tetapi dicatat sebagai `AA00-00-0003`.
- Data di luar scope diperlakukan seperti tidak ditemukan untuk mencegah enumerasi.

## 9. Error handling

Semua error aplikasi dipetakan ke envelope:

```json
{
  "ok": false,
  "code": "AA00-00-0003",
  "message": "The request could not be processed.",
  "data": null,
  "meta": {
    "request_id": "0199...",
    "timestamp": "2026-10-30T09:00:00Z"
  }
}
```

Aturan:

- HTTP 200 untuk semua hasil bisnis, termasuk gagal login, izin ditolak, validasi gagal, dan error internal yang sudah ditangani.
- HTTP 403 tidak dipakai.
- HTTP 5xx tidak dikembalikan ke klien. Panic ditangkap dan dipetakan ke kode internal generik.
- Detail teknis hanya di log internal, tidak di respons.
- `request_id` selalu dikembalikan agar pengguna dapat melapor tanpa membocorkan detail.
- Health check internal tetap memakai status HTTP nyata untuk orchestrator, tetapi dibatasi jaringan internal.

Kebijakan lengkap ada di [kontrak-api.md](kontrak-api.md).

### 9.1 Lokalisasi pesan

- Bahasa yang didukung: `en` (default) dan `id`.
- Urutan locale: `Accept-Language` yang didukung, lalu `core.users.locale`, lalu `core.companies.locale`, lalu `en`.
- Katalog pesan ada di `osc_rest/locales/en.json` dan `osc_rest/locales/id.json`.
- Kunci pesan stabil, misalnya `auth.invalid_credentials`; jangan memakai teks pesan sebagai kunci.
- `code` dan `errors[].code` tidak berubah antar bahasa; hanya `message` dan `reason` yang diterjemahkan.
- Gunakan aturan plural/ICU untuk jumlah; jangan menyusun kalimat dengan penggabungan string.
- Terjemahan yang hilang jatuh ke `en` dan dicatat di log; tidak boleh menghasilkan 5xx.
- Pesan keamanan tetap generik di kedua bahasa.
- Label UI bukan tanggung jawab backend; frontend memakai katalognya sendiri.

## 10. Observability

- Log terstruktur JSON, wajib memiliki `request_id`, `trace_id`, `span_id`, `company_id`, `user_id`, `module_code`, `code`, `locale`.
- Redaksi otomatis untuk header otorisasi, cookie, password, token, dan field sensitif.
- Metrik:
  - `http_requests_total{route,method,code}`
  - `http_request_duration_seconds`
  - `auth_failures_total{reason}`
  - `authorization_denials_total{module}`
  - `db_pool_connections`
  - `outbox_pending`
  - `agent_ingest_lag_seconds`
- Trace OpenTelemetry ke collector internal.
- Alert untuk lonjakan kode penolakan, error internal, latency, dan koneksi DB.

## 11. Konfigurasi

- Konfigurasi dari environment + file, divalidasi saat start.
- Rahasia dari secret file/vault, bukan environment yang tercetak di log.
- Fail fast jika konfigurasi wajib tidak ada.
- Contoh variabel:

```text
OSC_ENV=production
OSC_HTTP_ADDR=0.0.0.0:8080
OSC_DATABASE_URL=postgres://...
OSC_DATABASE_MAX_CONNECTIONS=20
OSC_JWT_ISSUER=omnisight
OSC_JWT_AUDIENCE=omnisight-portal
OSC_JWT_KEY_FILE=/run/secrets/jwt_private_key
OSC_JWT_PUBLIC_KEY_FILE=/run/secrets/jwt_public_key
OSC_CORS_ORIGINS=https://portal.example.internal
OSC_DEFAULT_LOCALE=en
OSC_SUPPORTED_LOCALES=en,id
OSC_OTLP_ENDPOINT=http://otel-collector:4317
OSC_VAULT_ADDR=https://vault.example.internal
OSC_LOG_LEVEL=info
```

## 12. Testing

| Jenis | Cakupan |
|---|---|
| Unit domain | Aturan bisnis, state machine, policy |
| Integration repository | PostgreSQL nyata via testcontainers, RLS, constraint |
| Integration API | Login, izin, scope, envelope, audit |
| Contract adapter | Mock server HRIS/RouterOS/Docker API |
| Security | IDOR, cross-tenant, injection, rate limit, CSRF |
| Migration | Database kosong + data staging tersamarkan |
| Load | k6 untuk endpoint kritis |

Definition of done untuk backend:

- Test unit dan integration lulus.
- Tidak ada `unwrap()` pada jalur request yang bisa gagal.
- Semua endpoint punya deklarasi modul/izin.
- Audit dan redaksi diuji.
- `cargo audit` dan `cargo deny` bersih dari temuan kritis.
- OpenAPI diperbarui.

## 13. Larangan

- Tidak memakai HTTP 403.
- Tidak mengembalikan 5xx untuk error aplikasi yang tertangani.
- Tidak mengeksekusi perintah shell dari input pengguna.
- Tidak menyimpan rahasia di log, database, atau JWT.
- Tidak mempercayai `company_id`, `user_id`, role, atau scope dari body/header tanpa validasi.
- Tidak melakukan query tanpa filter tenant dan scope.
- Tidak memakai `SELECT *`.
- Tidak menonaktifkan TLS verification di produksi.
- Tidak memberi akses Docker socket mentah ke `osc_rest`.

## 14. Dokumen terkait

- [Registry kode error](kode-error.md)
- [Fungsi backend](../../qaqc/function/backend/README.md)
- [Alur data backend](../../qaqc/data-flow/backend/README.md)
- [Unit test backend](../../qaqc/unit-test/backend/README.md)
- [Matriks izin](../../security/matriks-izin.md)
- [UAT modul](../../qaqc/acceptance/README.md)

