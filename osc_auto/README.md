# osc_auto

Microservice **Go** untuk collector, scheduler, notifier, dan worker backup/sync.

- Tidak menulis langsung ke database domain; memakai API internal `osc_rest`.
- Dapat berjalan di Ubuntu dan Windows.
- Compose satuan per agent ada di [dokumentasi agent](../osc_docs/technical/agent/README.md).
- WP-01 hanya menyediakan satu entrypoint placeholder tanpa fitur domain.

## Perintah

```bash
go vet ./...
go test ./...
go build ./...
go run ./cmd/osc-auto
```

Entrypoint placeholder menunggu sinyal SIGINT/SIGTERM lalu berhenti.

Status: scaffold WP-01.
