# syntax=docker/dockerfile:1
# =============================================================================
# osc_rest — multi-stage Dockerfile produksi (standar ai-main):
#   builder : cargo-chef (dependency caching) di rust 1.99.1 slim-bookworm
#             (PINNED — tag melayang `latest-rust-1` kini berbasis trixie
#             yang glibc-nya lebih baru dari runtime bookworm → binary
#             gagal jalan: "GLIBC_2.38 not found")
#   runtime : gcr.io/distroless/cc-debian12:nonroot (non-root UID 65532)
#             + /bin/busybox statis (dari busybox:stable-musl) HANYA sebagai
#             probe healthcheck wget — distroless tidak punya shell/curl.
#             CA certificates sudah dibundel di dalam distroless.
# Catatan    : image runtime TIDAK punya shell → `docker exec` interaktif
#             tidak tersedia; debugging via `docker logs` (JSON logging).
# =============================================================================

FROM lukemathwalker/cargo-chef:latest-rust-1.99.1-slim-bookworm AS chef
WORKDIR /app

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json ./recipe.json
# Build semua dependency lebih dulu (cache-friendly)
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin osc_rest

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
COPY --from=builder /app/target/release/osc_rest /usr/local/bin/osc_rest
# Busybox statis (musl) untuk probe healthcheck compose (wget/nc) —
# tidak ada entrypoint-nya, tidak bisa dipakai sebagai shell.
COPY --from=busybox:stable-musl /bin/busybox /bin/busybox

USER nonroot:nonroot
ENV REST_HOST=0.0.0.0 \
    REST_PORT=8000 \
    RUST_LOG=info
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/osc_rest"]
