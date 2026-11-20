# Agen OmniSight untuk Store

Agen Go lintas platform untuk Linux/Ubuntu dan Windows. Inti agen memakai Go 1.27.4 dengan `CGO_ENABLED=0`; adapter systemd Linux dan Windows Service menjalankan loop agen yang sama.

## Kontrak backend

Agen mengharapkan kontrak backend yang dijelaskan di `osc_docs/planning/01_core_specs.md`:

- `POST /agent/v1/heartbeat`
- `POST /agent/v1/jobs/claim`
- `POST /agent/v1/jobs/{job_id}/result`

Request memakai HTTPS, token `Authorization: Bearer` per node, dan `X-Node-ID`. Pengiriman hasil memakai `Idempotency-Key`. Sebelum agen dipasang, backend harus menyediakan verifikasi token node, otorisasi, pembatasan laju, penyewaan job, dan terminasi HTTPS. Rute ini belum tersedia di `osc_rest`.

Respons claim adalah `204 No Content` bila tidak ada job, atau JSON `{ "data": { "payload": <JSON job>, "signature": "<HMAC-SHA256 hex>" } }`. HMAC dihitung atas byte UTF-8 persis dari `payload` menggunakan kunci rahasia node sepanjang 32 byte. Payload bertanda tangan berisi `job_id`, `nonce` unik, `audience` (ID node persis), `issued_at` dan `expires_at` dalam Unix time, `command`, serta `args` string opsional. Agen menolak job kedaluwarsa, job yang diterbitkan lebih dari 30 detik ke depan, job dengan masa berlaku lebih dari 15 menit, tanda tangan tidak valid, ID/nonce yang dipakai ulang, dan JSON dengan field yang tidak dikenal.

Perintah yang diizinkan ditetapkan saat kompilasi:

- `system.health` tidak menerima argumen dan mengembalikan ringkasan OS/CPU/memori/disk/uptime.
- `service.status` hanya menerima `{"service":"<nama>"}` jika nama layanan itu tercantum persis pada daftar `allowed_services` lokal. Perintah memakai executable OS tetap secara langsung; tidak ada shell atau opsi executable arbitrer.

Output dibatasi. Hasil disimpan dalam antrean persisten dengan izin terbatas dan dikirim ulang sampai diterima, termasuk setelah proses dimulai ulang. Nomor urut heartbeat serta ID replay disimpan secara atomik. Jalankan hanya satu proses agen untuk setiap node dan direktori state.

## Konfigurasi dan rahasia

Mulai dari `config/agent.example.json`, atur `api_url` HTTPS yang benar, sediakan ID node unik dan token bearer, lalu buat kunci HMAC acak 32 byte yang terpisah untuk setiap node. Encode kunci HMAC dengan Base64. Jangan gunakan ulang kunci HMAC sebagai token API. Nilai contoh sengaja tidak valid. Lindungi konfigurasi agar hanya identitas layanan dan administrator yang dapat membacanya. Simpan kunci penanda tangan backend di backend; jangan pernah menaruh kunci penanda tangan backend di node.

Di Linux, atur `state_dir` ke `/var/lib/omnisight-agent`. Di Windows, installer mengubahnya ke `%ProgramData%\OmniSight\State`. State menyimpan perlindungan replay dan laporan yang belum terkirim, jadi pertahankan saat upgrade dan backup; jangan berbagi state antar-node.

## Kompilasi dan instalasi

Jalankan dari direktori utama repositori:

```sh
make build-agent
```

Target ini menghasilkan `osc_auto/dist/omnisight-agent-linux-amd64` dan `osc_auto/dist/omnisight-agent-windows-amd64.exe`, keduanya dibuat tanpa CGO.

Linux: buat akun khusus `omnisight-agent`, pasang biner di `/usr/local/bin/omnisight-agent`, letakkan konfigurasi yang sudah diprovisi di `/etc/omnisight-agent/config.json` dengan pemilik `root:omnisight-agent` dan mode `0640`, pasang `deploy/linux/omnisight-agent.service` ke `/etc/systemd/system/`, lalu jalankan `systemctl daemon-reload` dan `systemctl enable --now omnisight-agent`. Unit menerapkan pembatasan filesystem, privilege, dan capability systemd. Pastikan pemeriksaan layanan dan lokasi executable sesuai dengan host.

Windows (PowerShell yang dijalankan sebagai administrator):

```powershell
.\osc_auto\deploy\windows\install-service.ps1 -BinaryPath .\osc_auto\dist\omnisight-agent-windows-amd64.exe -ConfigPath .\agent-config.json
```

Installer memasang layanan dengan identitas `LocalService`, mengatur ACL untuk direktori konfigurasi dan state, serta mengonfigurasi pemulihan otomatis setelah layanan gagal. Tinjau daftar layanan yang diizinkan dan hak host sebelum instalasi.

## Catatan operasional

Agen menggunakan timeout HTTPS dan percobaan ulang terbatas untuk gangguan transport sementara. Log berisi nama kejadian, ID node, dan error yang sudah disamarkan; kredensial maupun output job tidak ditulis ke log. Output job dikirim ke endpoint hasil backend, yang dapat menyimpan atau mengarsipkannya di RustFS. Node tidak menerima kredensial RustFS langsung. Gunakan token node dan kunci HMAC yang berbeda untuk setiap node, rotasi kredensial melalui proses siklus hidup node, dan buat peringatan untuk kegagalan heartbeat atau pengiriman hasil yang berulang.
