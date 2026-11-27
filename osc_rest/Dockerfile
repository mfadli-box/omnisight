# ==============================================================================
# Stage 1: Cargo Chef / Builder Stage
# ==============================================================================
FROM rust:1.82-alpine AS builder

# Install dependensi sistem untuk kompilasi Rust (OpenSSL & Build Essentials)
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig git

WORKDIR /app

# Copy manifes dependensi terlebih dahulu untuk optimasi Docker layer caching
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy seluruh source code backend Rust
COPY src ./src
COPY notes ./notes

# Kompilasi binary rilis akhir
RUN cargo build --release --bin osc_rest && \
    strip target/release/osc_rest

# ==============================================================================
# Stage 2: Runtime Minimal SecOps Stage
# ==============================================================================
FROM alpine:3.20 AS runner

# Install sertifikat SSL/TLS & tzdata
RUN apk add --no-cache ca-certificates tzdata curl && \
    addgroup -g 10001 -S oscgroup && \
    adduser -u 10001 -S oscuser -G oscgroup

WORKDIR /app

# Copy binary dari builder stage
COPY --from=builder /app/target/release/osc_rest /usr/local/bin/osc_rest

# Set kepemilikan berkas ke non-root user
USER oscuser:oscgroup

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD curl -fsS -o /dev/null http://127.0.0.1:8080/baas/v1/public/companies || exit 1

ENTRYPOINT ["/usr/local/bin/osc_rest"]