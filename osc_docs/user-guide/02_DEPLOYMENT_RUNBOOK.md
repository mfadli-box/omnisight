# Panduan Operasional Penerapan: Docker Multi-VM dan Go Agent

## 1. Cakupan dan topologi

Runbook ini menjelaskan deployment stack Compose saat ini pada satu host atau pemisahan layanannya ke beberapa VM privat. Berkas Compose repositori adalah kerangka pengembangan/instalasi kecil pada satu host: menjalankan PostgreSQL (`osc_base`), Valkey (`osc_temp`), RustFS (`osc_save`), Rust API (`osc_rest`), dan Next.js (`osc_site`). Compose belum mengonfigurasi TLS produksi, aturan firewall VM, replikasi PostgreSQL, autentikasi/HA Valkey, cluster RustFS, atau ingress produksi. Lengkapi kontrol tersebut pada platform tujuan sebelum membuka akses eksternal.

Untuk deployment multi-VM, gunakan DNS dan subnet privat. Izinkan hanya aliran antar layanan berikut; larang akses publik ke layanan data:

| Sumber | Tujuan | Port/protokol | Keperluan |
|---|---|---|---|
| ingress/load balancer | `osc_site` | 3000 atau ingress TLS platform | UI/BFF browser |
| `osc_site` | `osc_rest` | 8080 di jaringan privat; sebaiknya TLS antar batas VM | Panggilan API BFF |
| `osc_rest` | PostgreSQL | 5432/TLS | Transaksi dan data tenant/RLS |
| `osc_rest` | Valkey | 6379/TLS + ACL produksi | Pembatasan laju, state MFA, circuit breaker |
| `osc_rest` | API S3 RustFS | 9000/TLS | Objek SOP/laporan privat |
| `osc_rest` | Intranet HRIS | hanya host dan port 80/443 yang disetujui | Autentikasi HRIS |
| Go Agent Store | `osc_rest` | HTTPS keluar 443 | Heartbeat, klaim job, dan laporan hasil |
| jaringan admin | pemantauan/SSH/konsol layanan | port manajemen yang disetujui | Operasi |

Jangan buka PostgreSQL, Valkey, S3 RustFS, atau port konsol RustFS ke internet publik. HRIS hanya boleh dijangkau dari jaringan API. Go Agent Store tidak menerima kredensial basis data, Valkey, atau RustFS.

## 2. Daftar periksa sebelum penerapan

- Pilih dan pin versi/digest image container yang sudah ditinjau. Berkas Compose saat ini memakai tag image bergerak untuk beberapa dependensi; ganti tag tersebut untuk produksi.
- Siapkan DNS, sertifikat TLS, aturan firewall, security group, rute privat, dan load balancer/reverse proxy. Atur header proxy tepercaya dan origin yang diizinkan.
- Buat secret unik dengan entropi tinggi: password aplikasi PostgreSQL, access/secret key RustFS, secret penanda tangan JWT, kunci enkripsi MFA, serta kredensial bearer/HMAC agent per node. Gunakan secret manager platform; jangan letakkan secret di Git, image layer, riwayat shell, tiket, atau runbook ini.
- Gunakan TLS PostgreSQL dan role aplikasi non-owner tanpa `BYPASSRLS`/superuser. Pisahkan kredensial migrasi/admin dari kredensial runtime.
- Atur ACL, TLS, persistensi/HA Valkey sesuai kebutuhan pembatasan MFA dan state circuit breaker. Tetapkan perilaku fail-closed saat dependensi keamanan tidak tersedia.
- Atur bucket RustFS privat, enkripsi, lifecycle/retensi, versioning/backup, key layanan dengan hak minimum, dan pemeriksaan pemulihan.
- Tetapkan `HRIS_ALLOWED_HOSTS` secara persis; konfirmasi kebijakan DNS/IP, egress firewall host, TLS, timeout, dan template URL ASMX yang disetujui.
- Tentukan jadwal backup, retensi, RPO/RTO, pemilik restore, tujuan alert, jendela perubahan, dan versi rollback.

## 3. Penerapan Compose pada satu host

Jalankan perintah dari direktori utama repositori pada host terlindungi. Buat berkas environment milik root di luar repositori atau ekspor variabel dari secret manager. Variabel Compose wajib mencakup `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `RUSTFS_ACCESS_KEY`, dan `RUSTFS_SECRET_KEY`. Atur juga `APP_ORIGIN`, `PUBLIC_APP_URL`, `HRIS_ALLOWED_HOSTS`, bucket/region RustFS, dan integrasi reset email sesuai kebutuhan. Jangan commit nilainya.

1. Tinjau berkas Compose, Dockerfile, tag image, path volume, healthcheck, dan port yang dipublikasikan. Konfigurasi saat ini hanya mempublikasikan port web; tempatkan di balik ingress TLS.
2. Jalankan PostgreSQL dan tunggu siap dengan `docker compose up -d --wait osc_base`. Pada instalasi baru, terapkan migrasi inti dan kebijakan RLS dengan role admin sebelum menyalakan REST.

   ```sh
   cat osc_base/migrations/001_init_core.sql osc_base/migrations/002_rls_policies.sql |
     docker compose exec -T osc_base sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```

   Untuk upgrade, ikuti jalur migrasi yang sesuai dengan skema terpasang. [Catatan fondasi database](../../osc_base/notes/20261120-core-01-base.md)

3. Bangun dan jalankan layanan lainnya dengan `docker compose up -d --build`.
4. Periksa kesehatan: `docker compose ps`; tinjau `docker compose logs --tail=100 osc_base osc_temp osc_save osc_rest osc_site` untuk kegagalan startup. Jangan aktifkan log debug yang memuat kredensial.
5. Provision company, role, dan administrator awal melalui alur bootstrap produksi. Gunakan `osc_base/seeds/001_seed_demo.sql` hanya untuk database pengembangan atau pengujian.
6. Periksa bahwa `/baas/v1/public/companies` di REST dan `/api/proxy/public/companies` di BFF merespons HTTP 200. REST Compose memakai endpoint company sebagai healthcheck agar koneksi dan izin baca skema ikut diperiksa. Dengan akun uji, periksa login, MFA, perpindahan tenant, dan transfer objek privat.
7. Konfigurasikan TLS ingress dan uji keamanan cookie, batas ukuran request, pembatasan laju, penyamaran access log, serta isolasi jaringan.

Sebelum upgrade, ambil backup database dan object storage. Terapkan migrasi lanjutan yang sudah ditinjau, deploy image yang dipin, verifikasi kesehatan dan alur smoke test, lalu simpan image lama serta titik pemulihan terdokumentasi sampai masa observasi selesai. Jangan pulihkan snapshot database tanpa menyelaraskan objek RustFS dan state Valkey/sesi yang sesuai.

## 4. Penerapan multi-VM

1. Siapkan satu atau beberapa VM untuk setiap peran: web/BFF, Rust API, PostgreSQL, Valkey, dan RustFS. Pin versi OS/runtime container; aktifkan firewall host, pembaruan keamanan, sinkronisasi waktu, audit log, enkripsi disk, dan pemantauan.
2. Tempatkan PostgreSQL, Valkey, dan RustFS pada jaringan privat nonpublik dengan disk persisten terenkripsi. Atur autentikasi bawaan layanan, TLS, backup, pemantauan kesehatan, dan latihan pemulihan.
3. Jalankan replika API di belakang load balancer privat. Suntikkan secret saat runtime. Terapkan migrasi sebagai tugas administrasi satu kali sebelum menambah replika API; jangan menjalankan migrasi skema pada startup setiap replika.
4. Jalankan Next.js/BFF di balik ingress TLS publik. Atur `INTERNAL_API_URL` ke endpoint API privat dan isi `APP_ORIGIN`/origin publik secara persis. Batasi CORS dan teruskan hanya header yang diharapkan.
5. Batasi akses jaringan keluar API ke PostgreSQL, Valkey, RustFS, host HRIS yang disetujui, endpoint email, dan tujuan telemetri. Batasi HRIS secara terpisah pada lapisan jaringan.
6. Validasi health/readiness dan TLS antar layanan dari setiap VM. Sebelum membuka trafik pengguna, uji login, challenge MFA, cakupan company/area, alur objek SOP, arsip laporan, dan kebijakan outage HRIS.
7. Pantau kesehatan dependensi API, counter login/MFA gagal, status circuit HRIS, kejadian fallback offline-cache, umur heartbeat, antrean job, kegagalan objek, kapasitas disk, status replikasi/backup database, serta masa berlaku sertifikat.

Definisi Compose repositori bukan orchestrator multi-VM. Pindahkan layanan, variabel environment, dependensi healthcheck, dan volume yang sama ke platform container atau pengelola layanan VM yang disetujui organisasi, lalu tinjau manifest sebelum rollout.

## 5. Pemasangan Go Agent di Ubuntu

### Kompilasi dan paket

Gunakan target repositori pada host build terkendali dengan Go 1.27.4 atau toolchain kompatibel yang lebih baru:

```sh
make build-agent-linux
```

Hasilnya adalah `osc_auto/dist/omnisight-agent-linux-amd64`. Verifikasi checksum/tanda tangan rilis melalui pipeline artefak organisasi sebelum menyalinnya ke host Store.

### Pemasangan pada host

1. Buat akun layanan dan direktori terlindungi:

   ```sh
   sudo useradd --system --home /var/lib/omnisight-agent --shell /usr/sbin/nologin omnisight-agent
   sudo install -d -o root -g omnisight-agent -m 0750 /etc/omnisight-agent
   sudo install -d -o omnisight-agent -g omnisight-agent -m 0700 /var/lib/omnisight-agent
   sudo install -o root -g root -m 0755 osc_auto/dist/omnisight-agent-linux-amd64 /usr/local/bin/omnisight-agent
   ```

2. Provision ID node unik, token bearer HTTPS per node, dan kunci HMAC 32 byte tersendiri (Base64) melalui proses enrollment secret yang disetujui. Atur `api_url`, `node_id`, `node_token`, `job_hmac_key_base64`, interval, direktori state absolut, serta daftar `allowed_services` lokal yang persis dalam `/etc/omnisight-agent/config.json`. Jangan gunakan ulang secret node atau menaruh nilainya di riwayat shell.
3. Batasi akses baca konfigurasi: `sudo chown root:omnisight-agent /etc/omnisight-agent/config.json && sudo chmod 0640 /etc/omnisight-agent/config.json`.
4. Pasang `osc_auto/deploy/linux/omnisight-agent.service` ke `/etc/systemd/system/omnisight-agent.service`, lalu jalankan `sudo systemctl daemon-reload`, `sudo systemctl enable --now omnisight-agent`, dan `sudo systemctl status omnisight-agent`.
5. Periksa `journalctl -u omnisight-agent` untuk nama kejadian dan error yang sudah disamarkan. Pastikan heartbeat node terlihat pada Store yang benar. Jangan memberi akses `systemctl` luas; allowlist perintah layanan diatur secara lokal pada konfigurasi terlindungi.

Pembaruan: hentikan layanan atau gunakan proses penggantian biner atomik yang disetujui, pasang biner yang checksum-nya sudah diverifikasi, simpan versi sebelumnya, mulai ulang, lalu verifikasi heartbeat dan hasil healthcheck. Pertahankan `/var/lib/omnisight-agent` saat upgrade karena menyimpan perlindungan replay dan laporan yang belum terkirim. Untuk penggantian node, cabut identitas backend dan provision identitas/direktori state node baru.

## 6. Pemasangan Go Agent di Windows Server

1. Build pada host terkendali dengan `make build-agent-windows`; verifikasi checksum/tanda tangan artefak rilis.
2. Buat konfigurasi JSON dari `osc_auto/config/agent.example.json` menggunakan kredensial node unik dan URL API HTTPS absolut. Skrip instalasi Windows mengatur path state persisten ke `%ProgramData%\OmniSight\State`.
3. Dari PowerShell yang dijalankan sebagai administrator, jalankan:

   ```powershell
   .\osc_auto\deploy\windows\install-service.ps1 `
     -BinaryPath .\osc_auto\dist\omnisight-agent-windows-amd64.exe `
     -ConfigPath .\agent-config.json
   ```

4. Verifikasi layanan:

   ```powershell
   Get-Service OmniSightAgent
   ```

   Agen saat ini menulis log terstruktur ke stderr. Konfigurasikan pengumpul log layanan Windows yang disetujui untuk menangkapnya; sampai tersedia, gunakan status layanan dan heartbeat backend untuk memastikan agen berjalan.

Installer menetapkan identitas `LocalService`, ACL konfigurasi/state, startup otomatis, dan pemulihan setelah gagal. Tinjau `allowed_services`; LocalService mungkin tidak dapat memeriksa semua layanan terlindungi. Berikan hanya izin lokal minimum untuk healthcheck yang diperlukan. Pertahankan `%ProgramData%\OmniSight\State` saat upgrade dan cabut token/kunci HMAC node sebelum menonaktifkan atau mengkloning image VM.

## 7. Rollback dan penanganan insiden

- **Rilis aplikasi bermasalah:** hentikan rollout, arahkan trafik ke build API/UI terakhir yang sehat, pertahankan log dan request ID, lalu rollback setelah memeriksa kompatibilitas skema lanjutan. Utamakan perbaikan maju jika migrasi tidak dapat dibatalkan dengan aman.
- **Masalah database:** hentikan penulisan bila integritas diragukan, pulihkan ke lingkungan pemulihan terisolasi, validasi RLS dan jumlah baris, lalu selaraskan data PostgreSQL dengan titik backup objek RustFS. Catat tindakan pemulihan.
- **Valkey outage:** ikuti kebijakan fail-closed untuk MFA/replay/pembatasan laju; jangan menonaktifkan kontrol agar login tetap tersedia.
- **RustFS outage:** hentikan upload non-idempoten berulang, simpan error/request ID, pulihkan layanan, lalu verifikasi kesesuaian objek dan metadata database.
- **Kredensial node bocor:** cabut identitas/token node dan kunci HMAC, karantina node Store, pertahankan state untuk investigasi, bangun/rotasi ulang, lalu enrollment dengan identitas baru.
- **State agent hilang:** hentikan agent dan nilai dampaknya pada laporan/replay yang tertunda. Jangan salin berkas state node lain. Enrollment ulang atau reset identitas node melalui prosedur operator yang diaudit.

Setelah pemulihan, pastikan kesehatan layanan, autentikasi/MFA, isolasi tenant, heartbeat store, hasil job yang disetujui, dan akses objek privat. Catat timestamp dan bukti yang sudah disamarkan pada laporan insiden.
