# osc_rest

Backend REST API **Rust + Axum** untuk OmniSight.

- Satu-satunya pintu tulis ke database domain.
- WP-01 hanya menyediakan endpoint internal `/internal/healthz` dan `/internal/metrics`.
- Belum ada autentikasi, otorisasi domain, audit, atau adapter integrasi.
- Arsitektur, aturan API, dan kebijakan respons dijelaskan di [dokumentasi backend](../osc_docs/technical/backend/README.md).

## Perintah

```bash
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo build --locked --release
cargo run --locked
```

Endpoint mendengarkan `OSC_REST_BIND` (default `0.0.0.0:8080`) dan hanya boleh
diakses dari jaringan internal:

```bash
curl -fsS http://127.0.0.1:8080/internal/healthz
curl -fsS http://127.0.0.1:8080/internal/metrics
```

Dockerfile menjalankan binary sebagai UID/GID non-root `10001:10001`.

Status: scaffold WP-01.
