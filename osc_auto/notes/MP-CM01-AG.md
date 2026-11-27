# MP-CM01-AG — Registrasi fingerprint agent

## Objektif

Mengumpulkan identitas host Linux dan Windows, mendaftarkan agent melalui `POST /api/v1/agent/register`, serta menyimpan identitas yang diterima dengan enkripsi AES-256-GCM.

## Scope/Keputusan

- Fingerprint SHA-256 dibuat dari UUID motherboard, MAC aktif, serial CPU, dan hostname. Identitas perangkat yang tidak tersedia dibiarkan kosong; registrasi ditolak jika seluruh identitas perangkat kosong.
- Kontrak permintaan berisi `motherboard_uuid`, `mac_address`, `cpu_serial`, `hostname`, dan `fingerprint`. Respons yang diperlukan berisi `agent_id` dan `agent_token` (token dipakai sebagai rahasia HMAC telemetri).
- URL registrasi berasal dari `OMNISIGHT_TELEMETRY_URL` dan wajib HTTPS dengan path tepat. Kunci AES 32 byte diberikan melalui `OMNISIGHT_AGENT_KEY` dalam format base64 dan harus dikelola terpisah dari berkas identitas. `OMNISIGHT_AGENT_CONFIG` dapat mengubah lokasi berkas; default Linux `/etc/omnisight/agent.json`, Windows `C:\ProgramData\OmniSight\agent.json`.
- Berkas baru dibuat dengan mode `0600` pada Linux. Pada Windows, administrator deployment perlu membatasi ACL direktori dan berkas; mode POSIX tidak menjamin ACL Windows.
- Variabel lama `OMNISIGHT_AGENT_ID` dan `OMNISIGHT_AGENT_SECRET` tetap dapat dipakai untuk deployment yang sudah diprovisi.

## Hasil Eksekusi

- Menambahkan kolektor fingerprint, klien registrasi, enkripsi identitas, dan pemuatan identitas saat agent mulai. Dockerfile diperbarui agar membangun seluruh paket agent dengan Go 1.26.
- Route registrasi belum ditemukan dalam `osc_rest`; kontrak harus diselaraskan dan endpoint backend dibuat sebelum registrasi end to end dapat berjalan.
- Service Linux berjalan sebagai `omnisight-agent`, sehingga direktori `/etc/omnisight` harus disiapkan dengan hak tulis untuk akun tersebut atau `OMNISIGHT_AGENT_CONFIG` diarahkan ke lokasi persisten yang dapat ditulis. Kunci AES harus disuplai aman oleh deployment.

## Status Verifikasi

- `passed`: `go test ./...` dengan cache dan modul Go di `/tmp`; uji mencakup registrasi TLS, penolakan HTTP, round trip enkripsi, dan deteksi perubahan berkas.
- `passed`: kompilasi `GOOS=windows GOARCH=amd64 go build ./cmd/agent`.
- `passed`: kompilasi Linux `go build -buildvcs=false ./cmd/agent`; flag diperlukan karena direktori kerja tidak memiliki metadata Git yang dapat dibaca.
- `not run`: registrasi terhadap `osc_rest` karena endpoint backend belum tersedia.
