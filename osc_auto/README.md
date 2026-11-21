# Agen OmniSight

Agen mengirim metrik host Linux/Ubuntu dan Windows ke `osc_rest`. Gunakan Go 1.26 atau lebih baru untuk membuat biner tanpa CGO.

## Konfigurasi

Salin `config/agent.example.yaml` ke `agent.yaml`, atau berikan lokasinya dengan `--config`. Variabel lingkungan berikut menimpa nilai YAML dan dapat dipakai tanpa file konfigurasi.

| YAML | Variabel lingkungan | Nilai |
| --- | --- | --- |
| `hub_url` | `HUB_URL` | URL dasar HTTPS untuk `osc_rest`. HTTP diizinkan pada loopback. |
| `node_id` | `NODE_ID` | ID yang terdaftar di hub. |
| `agent_secret` | `AGENT_SECRET` | Rahasia acak per node, 32–512 byte. Jika memakai teks Base64, gunakan teks yang sama di kedua sisi. |
| `poll_interval_sec` | `POLL_INTERVAL_SEC` | Jeda antar-pengiriman dalam detik, 1–600. Default 30. |
| `telemetry_enabled` | `TELEMETRY_ENABLED` | Aktifkan telemetri historis bagi node dengan UUID kanonis. Default `false`. |
| `allowed_services` | | Daftar nama layanan lokal yang dapat diperiksa. Default kosong. |

Masukkan setiap pasangan ID dan rahasia ke objek JSON `AGENT_HEARTBEAT_SECRETS` pada `osc_rest`. Lindungi sumber konfigurasi agar hanya identitas layanan dan administrator yang dapat membacanya. Restart `osc_rest` setelah memperbarui pendaftaran. Jalankan satu agen per ID dan sinkronkan jam hub serta node.

## Heartbeat

Agen langsung mengirim `POST /baas/v1/agents/heartbeat` saat dimulai. JSON berisi `os`, `uptime_seconds`, `cpu_percent`, `ram_percent`, dan `disk_percent`. Linux mengukur filesystem `/` dan Windows mengukur drive sistem.

- `X-Agent-Id` berisi ID node dan `X-Timestamp` berisi Unix time dalam detik.
- `X-Signature` berisi hex huruf kecil dari HMAC-SHA256 atas `node_id + "\n" + timestamp + "\n" + body`. Gunakan byte JSON persis yang dikirim dan byte UTF-8 rahasia sesuai konfigurasi.
- Hub mengembalikan `204` untuk heartbeat yang diterima. ID, tanda tangan, dan waktu diperiksa dengan toleransi 120 detik. Timestamp duplikat atau lebih lama untuk node yang sama ditolak dengan `409`.
- Valkey menyimpan heartbeat terbaru selama 900 detik pada `osc:agent:heartbeat:<node_id>`. Agen menunggu interval berikutnya untuk mengirim sampel baru setelah kegagalan HTTP atau timeout 10 detik.

## Telemetri historis

Setel `telemetry_enabled: true` dan gunakan UUID huruf kecil dari `osc_agent_node.id`. Tambahkan UUID tersebut ke `AGENT_HEARTBEAT_SECRETS` dan provision cakupannya pada hub sesuai [catatan penerapan](../notes/20261121-01-beszel.md). Dalam mode ini agent mengirim `POST /baas/v1/agents/telemetry` dan hub memperbarui heartbeat yang dipakai OP02.

Collector memakai counter host native. Data S.M.A.R.T. membutuhkan executable `smartctl` pada PATH layanan dan izin membaca perangkat. Statistik kontainer membutuhkan CLI Docker pada PATH dan akses ke socket Unix atau named pipe lokal. Windows memakai PowerShell dan CIM untuk counter tambahan. Load average Unix tidak tersedia pada Windows. Pengukuran opsional yang gagal muncul sebagai daftar kosong atau nilai kosong; metrik inti tetap dikirim.

## Diagnostik lokal

Jalankan, misalnya, `omnisight-agent --command 'uptime'` atau `omnisight-agent --command 'systemctl status' --service nginx.service`. Executor hanya menerima nama perintah persis dari kode. Input layanan harus cocok persis dengan `allowed_services`. Proses memakai executable dan opsi tetap, timeout 20 detik, serta batas output 8 KiB.

| Perintah | Linux | Windows |
| --- | --- | --- |
| `uptime` | `/usr/bin/uptime` | API uptime sistem |
| `df` | `df -P /` | Pemakaian drive sistem |
| `docker ps` | Docker CLI di `/usr/bin/docker`, socket lokal | Docker Desktop CLI di Program Files, named pipe lokal |
| `systemctl status` | Status unit systemd tanpa pager dan jurnal | Kueri layanan Windows via `sc.exe` |

`docker ps` memerlukan akses ke daemon lokal. Wrapper layanan menggunakan akun berprivilege rendah dan tidak menambahkan akses ke daemon.

## Build dan pemasangan layanan

Jalankan `make build-agent` dari root repositori. Target menghasilkan `osc_auto/dist/omnisight-agent-linux-amd64` dan `osc_auto/dist/omnisight-agent-windows-amd64.exe` dengan `CGO_ENABLED=0`.

Di Linux, buat akun sistem `omnisight-agent`, pasang biner di `/usr/local/bin/omnisight-agent`, dan letakkan konfigurasi di `/etc/omnisight-agent/agent.yaml` dengan pemilik `root:omnisight-agent` dan mode `0640`. Pasang `deploy/linux/omnisight-agent.service` ke `/etc/systemd/system/`, lalu jalankan `systemctl daemon-reload` dan `systemctl enable --now omnisight-agent`.

Di Windows, jalankan PowerShell sebagai administrator.

```powershell
.\osc_auto\deploy\windows\install-service.ps1 -BinaryPath .\osc_auto\dist\omnisight-agent-windows-amd64.exe -ConfigPath .\agent.yaml
```

Installer menjalankan layanan sebagai `LocalService`, memasang konfigurasi dengan ACL terbatas, dan mengaktifkan restart setelah kegagalan.

## Instalasi JSON sebelumnya

`--config /path/config.json` memilih mode bearer sebelumnya. Mode ini membutuhkan backend yang menyediakan `/agent/v1/heartbeat`, `/agent/v1/jobs/claim`, dan `/agent/v1/jobs/{job_id}/result`. Job bertanda tangan tetap menggunakan HMAC, pemeriksaan audience dan masa berlaku, serta penyimpanan replay dan hasil yang persisten. Simpan direktori state saat upgrade atau rollback dan gunakan satu proses per node dan direktori state. Konfigurasi YAML mendukung heartbeat dan telemetri historis. Diagnostik pada mode YAML tersedia melalui CLI.

Mulai dari `config/agent.example.json` untuk mode bearer. Gunakan `Authorization: Bearer` per node, `X-Node-ID`, serta `Idempotency-Key` saat mengirim hasil. Konfigurasi memakai token bearer dan kunci job acak 32 byte yang berbeda dan disimpan sebagai Base64.

Claim mengembalikan `204` bila antrean kosong atau envelope `{"data":{"payload":<JSON job>,"signature":"<hex HMAC-SHA256>"}}`. Tanda tangan mencakup byte mentah `payload`. Job berisi `job_id`, `nonce`, `audience`, `issued_at`, `expires_at`, `command`, dan `args` opsional. Selain empat diagnostik, jalur job lama menerima `system.health` tanpa argumen dan `service.status` dengan satu nama layanan dari daftar konfigurasi. Unit Linux dapat memakai JSON dengan mengubah argumen `--config` dan memakai `state_dir` di `/var/lib/omnisight-agent`. Installer Windows menyiapkan state JSON di `%ProgramData%\OmniSight\State`.
