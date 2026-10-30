# osc_auto

Folder ini direncanakan untuk **microservice Go**: collector, scheduler, notifier, worker backup/sync.

- Tidak menulis langsung ke database domain; memakai API internal `osc_rest`.
- Dapat berjalan di Ubuntu dan Windows.
- Compose satuan per agent ada di [dokumentasi agent](../osc_docs/technical/agent/README.md).
- Folder ini belum berisi kode. Implementasi menunggu persetujuan dokumen.

Status: dokumentasi.
