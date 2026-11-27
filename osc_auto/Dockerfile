# ==============================================================================
# Stage 1: Golang Static Compiler Stage
# ==============================================================================
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Copy module manifest & download dependensi (gopsutil, dll)
COPY go.mod go.sum ./
RUN go mod download

# Copy source code agent
COPY . .

# Kompilasi biner statis tanpa CGO untuk arsitektur Linux AMD64
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s -extldflags '-static'" \
    -o /app/osc_auto ./cmd/agent

# ==============================================================================
# Stage 2: Runtime Distroless / Minimal Alpine Stage
# ==============================================================================
FROM alpine:3.20 AS runner

# Utilities pendukung inspeksi metrik host (procps, sysstat) & CA Certificates
RUN apk add --no-cache ca-certificates tzdata procps sysstat

WORKDIR /app

COPY --from=builder /app/osc_auto /usr/local/bin/osc_auto

# Agent membutuhkan akses baca ke /proc & /sys untuk telemetri host
ENTRYPOINT ["/usr/local/bin/osc_auto"]
