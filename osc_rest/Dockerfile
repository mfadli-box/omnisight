# STAGE 1: Mengompilasi Kode Binary Go
FROM golang:1.26.6-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./

RUN go mod download
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o main main.go

# STAGE 2: Runtime Image Ringan (non-root)
FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata wget \
    && addgroup -S omni -g 10001 \
    && adduser -S omni -u 10001 -G omni

WORKDIR /app
COPY --from=builder /app/main .

RUN mkdir -p /app/files /var/lib/omnisight/sessions \
    && chown -R omni:omni /app /var/lib/omnisight

USER omni

EXPOSE 37772
CMD ["./main"]
