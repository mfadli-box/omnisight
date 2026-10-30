# Adapter dan Integrasi

## 1. Prinsip

Adapter adalah satu-satunya tempat kode yang berbicara dengan sistem eksternal. Domain dan use case tidak boleh mengetahui detail HTTP, SQL, socket, atau CLI.

```text
Use case → Port (trait) → Adapter → Sistem eksternal
```

Aturan wajib untuk semua adapter:

- Timeout eksplisit.
- Retry terbatas dengan backoff dan jitter, hanya untuk operasi idempotent.
- Circuit breaker untuk mencegah badai kegagalan.
- Validasi input dan output.
- Error eksternal dipetakan ke kode OmniSight.
- Kredensial hanya referensi vault; tidak pernah ditulis ke log.
- Semua panggilan keluar memakai TLS verifikasi penuh.
- Tidak ada redirect otomatis ke host yang tidak diizinkan.
- Batas ukuran respons.
- Observability: span, metrik latency, success rate, tanpa data sensitif.

## 2. Port utama

```rust
#[async_trait]
pub trait HrisPort: Send + Sync {
    async fn authenticate(&self, req: HrisAuthRequest) -> Result<HrisAuthResult, HrisError>;
    async fn health(&self, connection_id: ConnectionId) -> Result<Health, HrisError>;
}

#[async_trait]
pub trait RouterOsPort: Send + Sync {
    async fn snapshot(&self, target: RouterTarget, kind: SnapshotKind) -> Result<Snapshot, RouterOsError>;
    async fn apply_firewall_plan(&self, target: RouterTarget, plan: FirewallPlan) -> Result<ApplyResult, RouterOsError>;
    async fn rollback(&self, target: RouterTarget, snapshot: SnapshotRef) -> Result<RollbackResult, RouterOsError>;
}

#[async_trait]
pub trait ContainerEnginePort: Send + Sync {
    async fn inspect(&self, endpoint: EndpointRef) -> Result<EngineSnapshot, ContainerError>;
    async fn deploy(&self, endpoint: EndpointRef, revision: ComposeRevision) -> Result<DeployResult, ContainerError>;
    async fn rollback(&self, endpoint: EndpointRef, revision: ComposeRevision) -> Result<DeployResult, ContainerError>;
}

#[async_trait]
pub trait MonitoringProviderPort: Send + Sync {
    async fn sync_inventory(&self, integration: IntegrationRef) -> Result<SyncReport, ProviderError>;
    async fn fetch_events(&self, integration: IntegrationRef, since: Timestamp) -> Result<Vec<SecurityEvent>, ProviderError>;
}
```

Port lain mengikuti pola yang sama: `ItsmPort`, `CmdbPort`, `BastionPort`, `CmsPort`, `EdgePort`, `StoragePort`, `MailPort`, `VaultPort`.

## 3. Ringkasan adapter

| Adapter | Protokol | Autentikasi | Operasi awal | Risiko utama |
|---|---|---|---|---|
| HRIS | HTTPS JSON | Service token/basic/API key | Login, mapping user/role | SSRF, kebocoran password, akun ganda |
| RouterOS | REST/API 8728/8729 | Akun terbatas | Snapshot, baca firewall, perubahan dengan approval | Lockout, perubahan destruktif |
| Docker/Podman | HTTP API via socket proxy | TLS/token | Inspect, deploy, rollback | Socket terlalu luas, container privileged |
| Nginx edge | HTTPS API/agent | mTLS/token | Apply config, reload, rollback | Config rusak, downtime |
| Wazuh | HTTPS API | Token read-only | Alert, agent status | Active response tanpa approval |
| LibreNMS | HTTPS API | Token read-only | Sync device, alert | Duplikasi inventaris |
| JumpServer | HTTPS API | Token scoped | Access request, session metadata | Rekaman sensitif |
| GLPI | HTTPS API | App token + user token | Sync ticket/contract | Duplikasi tiket |
| NetBox | HTTPS API | Token read-only | Sync inventory/IPAM | Konflik data |
| Snipe-IT | HTTPS API | Token scoped | Sync asset | Data pribadi berlebih |
| Directus | HTTPS REST/GraphQL | Token scoped | Baca konten | Duplikasi otorisasi |
| Beszel | HTTPS API | Token | Impor metrik | Dua agent di host sama |
| Oxidized | File/Git/CLI | Kredensial terbatas | Impor snapshot | Config sensitif |

## 4. HRIS

### Alur

1. Terima identifier + password dari user.
2. Pilih koneksi dan aturan berdasarkan perusahaan + match condition.
3. Bangun request dari `request_spec`.
4. Kirim ke HRIS dengan timeout 5 detik dan retry maksimal 1 untuk operasi idempotent.
5. Evaluasi `success_when`.
6. Mapping field dan role.
7. Cari/upsert user dan membership.
8. Buat sesi.
9. Catat log tanpa data sensitif.

### Dukungan GET dan POST

- Method ditentukan aturan.
- POST: body template JSON.
- GET: query template.
- Header statis dari `extra_headers`; header rahasia berasal dari vault.
- Hanya `username` dan `password` yang menjadi variabel rahasia.

### Proteksi SSRF

- `base_url` wajib HTTPS.
- Allowlist host dan port.
- Resolve DNS, tolak IP loopback, link-local, private, metadata cloud, dan multicast.
- Tolak redirect ke host lain; jika perlu redirect, validasi ulang target.
- Batas ukuran respons, misalnya 256 KB.
- Tidak memakai proxy otomatis dari environment tanpa kontrol.
- Timeout koneksi dan total.

### Mapping

- `field_map` memakai JSONPath terbatas.
- `role_map` hanya boleh memetakan ke role yang sudah ada di perusahaan.
- Auto-provision default `viewer`.
- Jika mapping area gagal, user dibuat tanpa area dan admin diberi notifikasi; tidak otomatis mendapat akses luas.
- Konflik email: jangan menggabungkan akun otomatis tanpa verifikasi; kirim ke review admin.

### Kegagalan

| Kondisi | Perilaku |
|---|---|
| HRIS 401/403 | Kode `AB-04-1001`, pesan generik |
| HRIS 429 | Backoff, kode `AB-04-1005` |
| HRIS 5xx/timeout | Kode `AB-04-1002`, fail-closed |
| Respons tidak sesuai skema | Kode `AB-04-1006`, alert |
| Mapping role tidak ditemukan | Tolak login, kode `AB-04-1007`, log untuk admin |

Fallback lokal hanya jika `fallback_policy.mode = local_if_mfa` dan MFA aktif. Default `deny`.

## 5. RouterOS

### Mode akses

- **Baca**: akun read-only untuk inventaris, health, dan snapshot.
- **Tulis**: akun khusus yang hanya dipakai selama perubahan disetujui.
- API hanya lewat agent/tunnel; tidak diekspos ke internet.
- Dukungan RouterOS v7 REST; API 8728/8729 untuk kompatibilitas.
- TLS wajib untuk lintas jaringan.

### Allowlist aksi

Contoh operasi yang diizinkan:

- Baca identitas router, resource, interface, IP address, route, firewall.
- Backup konfigurasi.
- Tambah/ubah/hapus aturan firewall **melalui rencana terstruktur**.
- Tambah/ubah IP address dan route tertentu.
- Reboot hanya dengan approval khusus dan maintenance window.

Yang dilarang:

- Perintah bebas atau scripting arbitrer.
- Mengubah user admin, password, atau sertifikat tanpa alur khusus.
- Menonaktifkan logging atau firewall safety rule.
- Mengakses alamat di luar target.

### Alur perubahan

```text
Plan → Validasi → Diff → Approval → Snapshot → Apply → Verify → Commit/Rollback
```

- Plan berisi operasi terstruktur, bukan string perintah.
- Snapshot `pre_change` wajib.
- Setelah apply, agent memverifikasi konektivitas manajemen.
- Jika verifikasi gagal dalam batas waktu, rollback otomatis.
- Semua langkah dan output dicatat.

### Lockout prevention

- Jangan pernah mengubah aturan yang melindungi jalur manajemen tanpa simulasi.
- Gunakan jadwal rollback otomatis sebelum apply.
- Perubahan produksi memerlukan dua approver bila kebijakan aktif.
- Simpan snapshot di luar router.

## 6. Docker dan Podman

### Akses API

- Jangan mount `/var/run/docker.sock` ke aplikasi.
- Gunakan socket proxy dengan endpoint allowlist:

```text
Allowed: /containers, /images, /networks, /volumes, /services, /tasks, /info, /version
Denied: /exec, /build, /swarm/init, /secrets, /configs, /system
```

- Podman memakai API yang setara; validasi versi dan kompatibilitas.
- TLS untuk API jarak jauh; tidak pernah terbuka publik.

### Deploy

1. Terima compose atau referensi Git.
2. Validasi sintaks dengan `compose config`.
3. Tolak `privileged`, `network_mode: host`, dan mount sensitif tanpa kebijakan khusus.
4. Pin image ke digest.
5. Pindai image (Trivy/Grype) bila tersedia.
6. Minta approval untuk produksi.
7. Simpan revisi sebelumnya.
8. Deploy.
9. Health check.
10. Rollback jika gagal.

### Larangan

- Tidak ada shell interaktif dari UI.
- Tidak ada `docker exec` bebas.
- Tidak ada secret di compose yang tersimpan sebagai teks biasa.
- Tidak ada image `latest` di produksi.
- Tidak ada container privileged tanpa persetujuan keamanan.

## 7. Edge dan Nginx

- Konfigurasi dihasilkan dari template.
- Validasi dengan `nginx -t` sebelum reload.
- Reload atomik; simpan config sebelumnya.
- Jika reload gagal, rollback dan alert.
- Domain duplikat ditolak.
- Upstream divalidasi untuk mencegah SSRF.
- Private key sertifikat di vault.
- Auto-renew dengan pengawasan; alert 30/14/7 hari sebelum kedaluwarsa.

## 8. Wazuh

- Integrasi read-only untuk alert, agent status, dan severity.
- Active response hanya jika diaktifkan dan memerlukan approval.
- Jangan menyimpan salinan penuh log Wazuh; simpan referensi + ringkasan.
- Token terbatas; API tidak diekspos.
- Sampling/indeks untuk volume besar.

## 9. LibreNMS

- Sinkronisasi inventaris perangkat dan status.
- Metrik historis boleh tetap di LibreNMS.
- Tentukan arah sinkronisasi:
  - OmniSight → LibreNMS: device baru dikirim.
  - LibreNMS → OmniSight: status/lokasi diimpor.
- Konflik masuk antrean review.
- Token read-only untuk impor.

## 10. JumpServer

- OmniSight mengelola permintaan akses dan approval.
- JumpServer mengelola koneksi, rekaman, dan sesi.
- MFA wajib.
- Target produksi memerlukan approval.
- Sesi berakhir otomatis.
- Metadata sesi disinkronkan; rekaman tetap di JumpServer.

## 11. GLPI, NetBox, Snipe-IT

| Integrasi | Arah awal | Aturan konflik |
|---|---|---|
| GLPI | Tiket OmniSight → GLPI atau sebaliknya, pilih satu sumber | ID eksternal disimpan; konflik review |
| NetBox | Impor inventaris/IPAM ke OmniSight | OmniSight menang untuk aset tenant; NetBox untuk data pusat bila disepakati |
| Snipe-IT | Impor aset atau sinkron dua arah terbatas | Serial unik; konflik review |

Aturan umum:

- Jangan mengimpor data pribadi yang tidak diperlukan.
- Jangan menimpa data lokal tanpa jejak.
- Sinkronisasi idempotent.
- Semua operasi tulis eksternal diaudit.

## 12. Directus

- Hanya untuk konten (blog, halaman, artikel) bila klien membutuhkannya.
- Token read-only untuk konten publik.
- Webhook diverifikasi HMAC.
- Jangan memakai Directus untuk otorisasi OmniSight.
- Cache konten dengan TTL dan invalidasi berbasis webhook.

## 13. Beszel dan Oxidized

### Beszel

- Bila klien sudah memakai Beszel, impor status/metrik; jangan pasang agent OmniSight yang mengukur hal sama.
- Tandai sumber data di UI.
- Hindari duplikasi alert; petakan alert Beszel ke alert OmniSight atau tampilkan sebagai tautan.

### Oxidized

- Impor snapshot dari output repository atau trigger terbatas.
- Checksum dan diff dihitung ulang.
- Restore tetap memakai alur approval OmniSight.
- Jangan menyimpan kredensial perangkat di aplikasi.

## 14. Ketahanan dan observability adapter

Setiap adapter memiliki:

- Metrik: request total, latency, error rate, circuit state.
- Log terstruktur dengan `integration_id`, `operation`, `request_id`, tanpa rahasia.
- Circuit breaker: buka setelah ambang kegagalan, setengah terbuka setelah cooldown.
- Bulkhead: pool koneksi/timeout terpisah per integrasi.
- Dead letter/retry untuk sinkronisasi gagal.
- Health check yang dapat ditampilkan di AA02.

## 15. Error mapping

| Kondisi eksternal | Kode OmniSight |
|---|---|
| Timeout | `AA00-00-0900` |
| Koneksi ditolak | `AA00-00-0900` |
| 401/403 dari integrasi | `AA00-00-0900` untuk pengguna, detail di log |
| 429 | `AA00-00-0006` |
| Respons tidak valid | `AA00-00-0100` |
| Data konflik | `AA00-00-0005` |
| Validasi target gagal | Kode modul terkait |

Pengguna tidak boleh melihat detail kredensial atau alamat internal.

## 16. Checklist adapter

- [ ] Timeout dan retry terbatas.
- [ ] Circuit breaker dan bulkhead.
- [ ] Kredensial dari vault.
- [ ] TLS verifikasi penuh.
- [ ] Allowlist tujuan dan proteksi SSRF.
- [ ] Batas ukuran respons.
- [ ] Error dipetakan ke kode stabil.
- [ ] Idempotency untuk operasi tulis.
- [ ] Log tanpa rahasia.
- [ ] Health check terdaftar di dashboard.
- [ ] Pengujian dengan mock server dan sandbox.
