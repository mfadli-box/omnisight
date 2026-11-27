# MP-CM02-AG — Konteks tenant dinamis agen

## Objektif

Mengambil penempatan tenant agen dari `osc_rest` setiap lima menit dan mencantumkan identitas tenant pada setiap payload telemetri.

## Scope/Keputusan

- `OMNISIGHT_TENANT_CONFIG_URL` wajib menunjuk ke endpoint HTTPS `GET /api/v1/agent/tenant-context`. Agen mengirim `Authorization: Bearer <agent_token>` dan `X-Agent-ID: <agent_id>`; redirect ditolak.
- Respons JSON harus berisi `agent_id`, `company_id`, `area_id`, `store_id`, `company_code`, dan `area_code`. `agent_id` harus cocok dengan identitas agen. Ketiga ID harus UUID bukan nol; kedua kode harus 1–20 karakter alfanumerik, garis bawah, atau tanda hubung. Backend wajib memastikan ID dan kode berasal dari relasi tenant yang aktif serta terikat pada agen terautentikasi.
- Konfigurasi baru diterapkan atomik tanpa restart. Respons yang gagal tidak menggantikan konfigurasi sebelumnya. Konfigurasi kedaluwarsa setelah sepuluh menit tanpa pembaruan sukses; telemetri tidak dikirim sampai konteks valid tersedia.
- Payload telemetri membawa keenam field konteks tenant sebagai field tingkat atas, bersama `agent_id`, `timestamp`, dan `metrics`. Tanda tangan HMAC dihitung dari body akhir sehingga tag tenant ikut terlindungi.

## Hasil Eksekusi

- Menambahkan poller di `internal/config/tenant_poller.go` dan menghubungkannya ke pengirim telemetri dalam `cmd/agent/main.go`.
- Menambahkan tes TLS, otorisasi request, pembaruan otomatis, validasi respons, kedaluwarsa konteks, penolakan redirect, dan penandatanganan payload bertag.
- Endpoint agen `GET /api/v1/agent/tenant-context` belum ada di `osc_rest`; integrasi nyata membutuhkan endpoint tersebut dengan autentikasi token agen dan validasi relasi tenant di backend.

## Status Verifikasi

- `passed`: `go test ./...` pada `osc_auto`.
- `passed`: `go test -race ./internal/config ./src/collector`.
- `passed`: kompilasi Linux AMD64 dan Windows AMD64.
- `not run`: integrasi end to end ke `osc_rest` karena endpoint konteks tenant agen belum tersedia.
