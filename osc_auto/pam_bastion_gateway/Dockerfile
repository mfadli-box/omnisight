# syntax=docker/dockerfile:1
# =============================================================================
# pam_bastion_gateway — Dockerfile produksi (standar ai-main / ai-auto):
#   builder : golang:1.26-alpine, build statis CGO_ENABLED=0 (trimpath,
#             -s -w) → tanpa dependensi libc apa pun.
#   runtime : gcr.io/distroless/static-debian12:nonroot (non-root UID 65532)
#             + /bin/busybox statis (dari busybox:stable-musl) HANYA sebagai
#             probe healthcheck (nc) — distroless tidak punya shell.
#
# State gateway disimpan di /var/lib/pam_bastion_gateway:
#   - state.json (kredensial hasil `--enroll`, dienkripsi AES-256-GCM)
#   - known_hosts (TOFU host key target SSH — deny-on-change)
#   - recordings/ (dump rekaman sesi sebelum diunggah ke osc_rest)
# Direktori ini di-COPY dengan ownership nonroot sehingga named volume
# Docker mewarisi ownership benar pada mount pertama.
# =============================================================================

FROM golang:1.26-alpine AS builder
WORKDIR /src
ENV CGO_ENABLED=0 \
    GOTOOLCHAIN=auto
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN mkdir -p /out/var/lib/pam_bastion_gateway/recordings \
    && go build -trimpath -ldflags="-s -w" \
        -o /out/pam_bastion_gateway ./cmd/pam_bastion_gateway

FROM gcr.io/distroless/static-debian12:nonroot AS runtime
COPY --from=builder /out/pam_bastion_gateway /usr/local/bin/pam_bastion_gateway
COPY --from=busybox:stable-musl /bin/busybox /bin/busybox
# Seed direktori state + recordings dengan ownership nonroot.
COPY --from=builder --chown=nonroot:nonroot /out/var/lib/pam_bastion_gateway /var/lib/pam_bastion_gateway

USER nonroot:nonroot
ENV PAM_GATEWAY_STATE_PATH=/var/lib/pam_bastion_gateway/state.json \
    PAM_GATEWAY_RECORDING_DIR=/var/lib/pam_bastion_gateway/recordings \
    PAM_GATEWAY_LOG_LEVEL=info

ENTRYPOINT ["/usr/local/bin/pam_bastion_gateway"]
