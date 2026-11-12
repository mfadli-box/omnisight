# syntax=docker/dockerfile:1
# =============================================================================
# osc_rest — multi-stage Dockerfile (standar ai-main):
#   builder : cargo-chef (dependency caching) di rust 1.99.1 slim-bookworm
#             (PINNED — tag melayang `latest-rust-1` kini berbasis trixie
#             yang glibc-nya lebih baru dari runtime bookworm → binary
#             gagal jalan: "GLIBC_2.38 not found")
#   runtime : debian:bookworm-slim + ca-certificates + curl (untuk healthcheck)
#             berjalan sebagai non-root UID 10001
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

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home osc

COPY --from=builder /app/target/release/osc_rest /usr/local/bin/osc_rest

USER osc
ENV REST_HOST=0.0.0.0 \
    REST_PORT=8000 \
    RUST_LOG=info
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/osc_rest"]
