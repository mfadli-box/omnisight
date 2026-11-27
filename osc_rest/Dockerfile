# ==============================================================================
# Stage 1: Rust Builder Stage
# ==============================================================================
FROM rust:1.99.1-alpine3.23 AS builder

# Install dependensi sistem untuk kompilasi Rust (OpenSSL & Build Essentials)
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig git

WORKDIR /app

# Copy manifes dependensi terlebih dahulu untuk optimasi Docker layer caching
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && touch src/main.rs && cargo fetch --locked && rm src/main.rs

# Copy seluruh source code backend Rust
COPY src ./src
COPY notes ./notes

# Kompilasi binary rilis akhir
RUN cargo build --locked --release --bin osc-rest && \
    strip target/release/osc-rest

# ==============================================================================
# Stage 2: Runtime Minimal SecOps Stage
# ==============================================================================
FROM alpine:3.23 AS runner

# Install sertifikat SSL/TLS & tzdata
RUN apk add --no-cache ca-certificates tzdata curl && \
    addgroup -g 10001 -S oscgroup && \
    adduser -u 10001 -S oscuser -G oscgroup

WORKDIR /app

# Copy binary dari builder stage
COPY --from=builder /app/target/release/osc-rest /usr/local/bin/osc_rest

# Set kepemilikan berkas ke non-root user
USER oscuser:oscgroup

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD curl -fsS -o /dev/null http://127.0.0.1:8080/baas/v1/public/companies || exit 1

ENTRYPOINT ["/usr/local/bin/osc_rest"]
