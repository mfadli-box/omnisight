# syntax=docker/dockerfile:1
# =============================================================================
# flow_worker_agent — Dockerfile produksi (standar ai-main / ai-auto):
#   builder : golang:1.26-alpine, build statis CGO_ENABLED=0 (trimpath,
#             -s -w) → tanpa dependensi libc apa pun.
#   runtime : gcr.io/distroless/static-debian12:nonroot (non-root UID 65532)
#             + /bin/busybox statis (dari busybox:stable-musl) HANYA sebagai
#             probe healthcheck (nc) — distroless tidak punya shell.
#
# State enrollment (state.json hasil `--enroll`, HMAC secret) disimpan di
# /var/lib/flow_worker_agent — direktori ini di-COPY dengan ownership
# nonroot sehingga named volume Docker mewarisi ownership benar pada
# mount pertama (state WAJIB persisten agar tidak re-enroll).
# =============================================================================

FROM golang:1.26-alpine AS builder
WORKDIR /src
ENV CGO_ENABLED=0 \
    GOTOOLCHAIN=auto
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN mkdir -p /out/var/lib/flow_worker_agent \
    && go build -trimpath -ldflags="-s -w" \
        -o /out/flow_worker_agent ./cmd/flow_worker_agent

FROM gcr.io/distroless/static-debian12:nonroot AS runtime
COPY --from=builder /out/flow_worker_agent /usr/local/bin/flow_worker_agent
COPY --from=busybox:stable-musl /bin/busybox /bin/busybox
# Seed direktori state dengan ownership nonroot (inisialisasi named volume).
COPY --from=builder --chown=nonroot:nonroot /out/var/lib/flow_worker_agent /var/lib/flow_worker_agent

USER nonroot:nonroot
ENV FLOW_WORKER_STATE_PATH=/var/lib/flow_worker_agent/state.json \
    FLOW_WORKER_LOG_LEVEL=info

ENTRYPOINT ["/usr/local/bin/flow_worker_agent"]
