# Unit Test Backend

Status: Disetujui (0.6)

Backend Rust `osc_rest` memakai clean architecture. Unit test difokuskan pada domain dan application layer; adapter diuji dengan kontrak dan integration test.

## 1. Lapisan dan alat

| Lapisan | Yang diuji | Alat |
|---|---|---|
| `osc_domain` | Entity, value object, aturan bisnis | `#[test]`, proptest bila perlu |
| `osc_application` | Use case, policy, port | Fake repository dan fake clock |
| `osc_adapters` | Kontrak adapter | wiremock, testcontainers |
| `osc_api` | Handler, DTO, middleware | `tower::ServiceExt`, request test |

Perintah:

```bash
cargo test --workspace
cargo nextest run --workspace
cargo llvm-cov --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

## 2. Matriks kasus wajib

| Area | Kasus |
|---|---|
| Domain | Aturan aset, status tiket, approval, masa berlaku akses |
| Izin | `read`/`post`, izin submenu sensitif, area di luar scope |
| Login lokal | Password salah, akun terkunci, MFA wajib |
| Login HRIS | Mapping sukses/gagal, timeout, fallback kebijakan |
| Ganti perusahaan | Membership valid, area tidak valid, sesi diperbarui |
| Idempotency | Kunci sama + body sama, kunci sama + body berbeda |
| Error | Kode stabil, tanpa 403/5xx, pesan fallback `en` |
| Lokalisasi | Urutan `Accept-Language` > user > company > `en` |
| Audit | Field sensitif diredaksi, request id dan aktor tercatat |
| Adapter | Timeout, 429, respons tidak valid, circuit breaker |

## 3. Test double

- In-memory repository dengan perilaku sama seperti kontrak.
- Fake clock untuk expiry token, SLA, dan retensi.
- Fake ID generator untuk UUID deterministik.
- Fake hasher untuk password di use case; Argon2 diuji terpisah.
- Wiremock untuk HRIS, RouterOS, Wazuh, dan API eksternal.
- Testcontainers hanya untuk adapter PostgreSQL dan integration test.

## 4. Aturan

- Domain dan application test tidak membuka koneksi database atau HTTP.
- Handler test memakai use case asli dengan adapter palsu.
- Setiap kode error yang dipakai UI memiliki tes pemetaan.
- Tes RLS dan query tetap berada di integration test database.
- Jangan memakai snapshot besar untuk DTO; uji field kontrak penting.
- Log tes tidak boleh memuat token, password, atau payload sensitif.

## 5. Cakupan

- Minimal 80% untuk domain dan application.
- 100% untuk policy izin, pemetaan kode error kritis, dan idempotency.
- Adapter contract test wajib untuk setiap port eksternal.

## 6. Checklist

- [ ] Aturan domain dan use case diuji.
- [ ] Policy izin dan scope diuji positif/negatif.
- [ ] Login lokal, HRIS, dan MFA diuji.
- [ ] Idempotency dan audit diuji.
- [ ] Kode error stabil dan terlokalisasi.
- [ ] Adapter memiliki contract test.
- [ ] Tidak ada database/HTTP nyata di unit test.
- [ ] `clippy` dan semua tes lulus.
