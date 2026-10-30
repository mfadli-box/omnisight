# Alert dan Eskalasi

Status: Disetujui (0.6)

Dokumen ini mengatur cara OmniSight menghasilkan, mengirim, dan mengeskalasi alert operasional. Aturan alert berlaku untuk modul AE Monitoring, sinyal keamanan AL, serta alert platform itu sendiri. Konfigurasi teknis rule berada di `monitor.alert_rules` dan menu `AE03`; siklus insiden berada di `AE04`.

Ambang di dokumen ini adalah **nilai awal**. Setiap perusahaan dapat menyesuaikannya melalui `AE03` dengan alasan dan audit. Perubahan ambang tidak boleh mengurangi kontrol keamanan wajib.

## 1. Prinsip

1. **Alert harus dapat ditindaklanjuti**: setiap rule punya pemilik, arti, dan runbook.
2. **Sedikit tetapi tepat**: alert berisik diperbaiki, bukan diabaikan.
3. **Satu alert, satu fingerprint**: alert berulang untuk target dan kondisi yang sama digabung.
4. **Severity menentukan respons**, bukan sekadar warna.
5. **Keamanan tidak dapat dibungkam**: alert keamanan kritis tidak boleh di-silence tanpa persetujuan.
6. **Tidak ada rahasia di notifikasi**: pesan tidak memuat kredensial, token, atau data pribadi berlebih.
7. **Setiap perubahan tercatat**: rule, ambang, silence, dan eskalasi masuk audit.

## 2. Model alert

Rule alert memakai field berikut:

| Field | Arti |
|---|---|
| `target_kind` | `host`, `container`, `network`, `certificate` |
| `metric_code` | Metrik atau kondisi yang dipantau |
| `operator` | `gt`, `gte`, `lt`, `lte`, `eq`, `neq` |
| `threshold` | Nilai pembanding |
| `for_seconds` | Durasi kondisi harus bertahan sebelum firing |
| `severity` | `info`, `warning`, `critical` |
| `channels` | Kanal notifikasi |

Siklus status:

```text
evaluasi rule (tidak disimpan)
        ↓ kondisi terpenuhi selama for_seconds
firing → acknowledged → resolved
   ↘ silenced (sementara, dengan batas waktu)
```

Aturan:

- Kondisi yang belum memenuhi `for_seconds` tidak mengirim notifikasi dan tidak membuat baris alert.
- Fingerprint dibentuk dari rule, target, dan scope; alert dengan fingerprint sama tidak dibuat ulang.
- Alert yang pulih sendiri menjadi `resolved` dengan catatan durasi.
- `acknowledged` berarti ada pemilik; bukan berarti masalah selesai.
- `silenced` selalu memiliki waktu berakhir, alasan, dan pembuat.
- Alert yang sudah `firing` tetap `firing` saat target offline, dengan label `target_offline=true`; jangan resolve otomatis hanya karena metrik berhenti.

## 3. Severity dan target respons

| Severity | Arti | Ack | Eskalasi bila belum di-ack | Kanal awal |
|---|---|---|---|---|
| `critical` | Layanan atau kontrol keamanan terganggu; risiko data/operasi tinggi | 15 menit, 24/7 | L2 setelah 15 menit, L3 setelah 30 menit | In-app, email, webhook/chat on-call |
| `warning` | Degradasi atau kapasitas menuju batas | 4 jam kerja | L2 pada hari kerja berikutnya | In-app, email |
| `info` | Perubahan status yang perlu diketahui | Tidak wajib | Tidak ada | In-app, ringkasan harian |

Catatan:

- Target respons adalah target operasional internal, bukan SLA klien, kecuali tertulis di kontrak.
- Alert keamanan kritis selalu 24/7, termasuk di luar jam kerja.
- `ack` tidak menutup alert; insiden tetap harus ditangani sampai `resolved`.
- Jika satu insiden memicu banyak alert, pemilik membuat satu insiden `AE04` dan menautkan alert terkait.

## 4. Ambang default

Nilai di bawah adalah titik awal. Sesuaikan per perusahaan setelah dua minggu baseline.

### 4.1 Host dan agent

| ID | Kondisi | Ambang | For | Severity | Tindakan |
|---|---|---|---|---|---|
| `ALT-HOST-01` | Agent tidak mengirim heartbeat | > 120 s | 120 s | warning | Cek jaringan, jam, sertifikat |
| `ALT-HOST-02` | Agent tidak mengirim heartbeat | > 300 s | 300 s | critical | Anggap host tidak terpantau |
| `ALT-HOST-03` | CPU tinggi | > 85% | 10 m | warning | Cek proses dan beban |
| `ALT-HOST-04` | CPU sangat tinggi | > 95% | 5 m | critical | Cek runaway process |
| `ALT-HOST-05` | RAM tinggi | > 90% | 10 m | warning | Cek memory leak |
| `ALT-HOST-06` | RAM sangat tinggi | > 97% | 5 m | critical | Risiko OOM |
| `ALT-HOST-07` | Disk terpakai | > 80% | 15 m | warning | Bersihkan log, tinjau retensi |
| `ALT-HOST-08` | Disk terpakai | > 90% | 5 m | critical | Tindakan segera |
| `ALT-HOST-09` | Inode terpakai | > 85% | 15 m | warning | Cek file kecil/log |
| `ALT-HOST-10` | Load per core | > 1.5 | 15 m | warning | Cek proses |
| `ALT-HOST-11` | Beda waktu server | > 60 s | 5 m | warning | Cek NTP; token/JWT sensitif waktu |
| `ALT-AGT-01` | Sertifikat agent kedaluwarsa | < 30 hari | - | warning | Rotasi otomatis |
| `ALT-AGT-02` | Sertifikat agent kedaluwarsa | < 7 hari | - | critical | Rotasi segera |
| `ALT-AGT-03` | Buffer lokal agent menumpuk | > 10.000 event atau > 15 menit | 5 m | warning | Cek koneksi collector |
| `ALT-AGT-04` | Versi agent tidak didukung | Versi di bawah minimum | - | warning | Jadwalkan upgrade |

### 4.2 Container dan layanan

| ID | Kondisi | Ambang | For | Severity | Tindakan |
|---|---|---|---|---|---|
| `ALT-CTR-01` | Endpoint Docker/Podman tidak terjangkau | 3 pemeriksaan gagal | 3 m | critical | Cek host dan socket proxy |
| `ALT-CTR-02` | Health check layanan gagal | 3 kali berturut | 2 m | warning | Cek log dan dependency |
| `ALT-CTR-03` | Container restart berulang | ≥ 3 kali / 10 m | 10 m | warning | Cek exit code |
| `ALT-CTR-04` | Container restart berulang | ≥ 5 kali / 10 m | 10 m | critical | Hentikan loop, rollback bila perlu |
| `ALT-CTR-05` | Deploy gagal | 1 kejadian | - | critical | Cek plan, image, health |
| `ALT-CTR-06` | Rollback otomatis dijalankan | 1 kejadian | - | warning | Tinjau penyebab |
| `ALT-CTR-07` | Image tidak dipin ke digest | 1 kejadian | - | warning | Perbaiki compose |

### 4.3 Jaringan dan edge

| ID | Kondisi | Ambang | For | Severity | Tindakan |
|---|---|---|---|---|---|
| `ALT-NET-01` | Perangkat tidak terjangkau | 2 m | 2 m | warning | Cek daya/jalur |
| `ALT-NET-02` | Perangkat tidak terjangkau | 5 m | 5 m | critical | Anggap layanan terganggu |
| `ALT-NET-03` | Interface down (bukan admin down) | 1 kejadian | 2 m | warning | Cek kabel/SFP |
| `ALT-NET-04` | Packet loss | > 5% | 10 m | warning | Cek link/utilisasi |
| `ALT-NET-05` | Packet loss | > 20% | 5 m | critical | Cek jalur utama |
| `ALT-NET-06` | Latensi | > 100 ms | 10 m | warning | Cek jalur dan queue |
| `ALT-NET-07` | MikroTik tidak dapat dikelola | 2 m | 2 m | critical | Gunakan jalur cadangan |
| `ALT-NET-08` | Perubahan firewall gagal/rollback | 1 kejadian | - | critical | Verifikasi koneksi manajemen |
| `ALT-NET-09` | Drift konfigurasi perangkat | 1 kejadian | - | warning | Tinjau snapshot dan perubahan |
| `ALT-EDGE-01` | Sertifikat TLS kedaluwarsa | < 30 hari | - | warning | Renew |
| `ALT-EDGE-02` | Sertifikat TLS kedaluwarsa | < 14 hari | - | critical | Renew segera |
| `ALT-EDGE-03` | Domain kedaluwarsa | < 30 hari | - | warning | Perpanjang |
| `ALT-EDGE-04` | Validasi konfigurasi Nginx gagal | 1 kejadian | - | critical | Jangan reload; rollback |
| `ALT-EDGE-05` | Upstream health gagal | 3 pemeriksaan | 3 m | warning | Cek layanan dan rute |

### 4.4 Backup dan pemulihan

| ID | Kondisi | Ambang | For | Severity | Tindakan |
|---|---|---|---|---|---|
| `ALT-BKP-01` | Job backup gagal | 1 kali | - | warning | Cek kredensial dan target |
| `ALT-BKP-02` | Job backup gagal berturut | 2 kali | - | critical | Eskalasi; cek ruang |
| `ALT-BKP-03` | Tidak ada snapshot sukses | > 2× interval jadwal | - | critical | Anggap proteksi hilang |
| `ALT-BKP-04` | Checksum snapshot tidak cocok | 1 kejadian | - | critical | Jangan pakai snapshot |
| `ALT-BKP-05` | Uji restore gagal | 1 kejadian | - | critical | Tinjau prosedur restore |
| `ALT-BKP-06` | Penyimpanan backup hampir penuh | > 85% | 15 m | warning | Tambah kapasitas |

### 4.5 Platform OmniSight

| ID | Kondisi | Ambang | For | Severity | Tindakan |
|---|---|---|---|---|---|
| `ALT-PLAT-01` | Latency baca p95 | > 500 ms | 10 m | warning | Cek query dan pool |
| `ALT-PLAT-02` | Latency baca p95 | > 2 s | 5 m | critical | Cek database dan beban |
| `ALT-PLAT-03` | Error internal `AA00-00-0100` | > 0.5% request | 5 m | critical | Cek log dengan request id |
| `ALT-PLAT-04` | Layanan pendukung `AA00-00-0900` | > 1% request | 5 m | critical | Cek adapter dan dependency |
| `ALT-PLAT-05` | Penolakan akses `AA00-00-0003` | 3× baseline 1 jam | 15 m | warning | Cek pola penyalahgunaan |
| `ALT-PLAT-06` | Koneksi pool database | > 80% | 10 m | warning | Cek kebocoran koneksi |
| `ALT-PLAT-07` | Replication lag | > 30 s | 5 m | warning | Cek jaringan dan IO |
| `ALT-PLAT-08` | Replication lag | > 120 s | 5 m | critical | Anggap replica tidak layak baca |
| `ALT-PLAT-09` | Outbox pending | > 1.000 atau tertua > 5 m | 5 m | warning | Cek worker |
| `ALT-PLAT-10` | Outbox tertua | > 15 m | 5 m | critical | Data turunan tertinggal |
| `ALT-PLAT-11` | Job terjadwal gagal | 2 kali berturut | - | warning | Cek scheduler dan retry |
| `ALT-PLAT-12` | Hash chain audit tidak valid | 1 kejadian | - | critical | Anggap integritas audit terganggu |
| `ALT-PLAT-13` | Disk host platform | > 85% | 10 m | warning | Bersihkan log/partisi |

### 4.6 Keamanan

| ID | Kondisi | Ambang | For | Severity | Tindakan |
|---|---|---|---|---|---|
| `ALT-SEC-01` | Login gagal berulang per akun | ≥ 10 dalam 10 m | 10 m | warning | Cek sumber; tahan akun sementara |
| `ALT-SEC-02` | Login gagal berulang per IP | ≥ 50 dalam 10 m | 10 m | critical | Kemungkinan credential stuffing |
| `ALT-SEC-03` | Kejadian Wazuh level tinggi | Level ≥ 12 | 1 kejadian | critical | Triase `AL03`/`AE06` |
| `ALT-SEC-04` | MFA dinonaktifkan untuk peran istimewa | 1 kejadian | - | critical | Tinjau dan pulihkan |
| `ALT-SEC-05` | Pemberian peran platform/sensitif | 1 kejadian | - | warning | Verifikasi dengan pemilik |
| `ALT-SEC-06` | Impersonasi dimulai | 1 kejadian | - | info | Catat alasan dan durasi |
| `ALT-SEC-07` | Pola pemakaian API key menyimpang | 3× baseline | 15 m | warning | Tinjau scope dan pemilik |
| `ALT-SEC-08` | Perubahan firewall dieksekusi | 1 kejadian | - | info | Catat perubahan |

## 5. Routing dan eskalasi

| Domain | Pemilik L1 | Eskalasi L2 | Eskalasi L3 |
|---|---|---|---|
| Host, agent, container | NOC on-call | Platform/OS Lead | Platform Owner |
| Jaringan, edge | NOC on-call | Network Lead | Platform Owner |
| Backup dan restore | NOC on-call | Backup Owner | Platform Owner |
| Platform OmniSight | NOC on-call | Backend Lead | Platform Owner |
| Keamanan | Security on-call | Security Lead | Platform Owner |

Aturan:

- Kanal awal mengikuti severity; kanal tambahan tidak menggantikan in-app.
- Eskalasi berbasis waktu berjalan otomatis; penerima baru mendapat ringkasan, bukan seluruh riwayat.
- Jika penerima L1 sedang silence, eskalasi tetap berjalan.
- Kontak on-call disimpan di sistem terpisah dan tidak ditulis di dokumen ini.
- Perubahan penerima atau jadwal on-call dicatat dan diuji.

## 6. Isi notifikasi

Setiap notifikasi memuat:

- Kode rule dan severity.
- Perusahaan, area, dan target.
- Kondisi aktual dan ambang.
- Waktu mulai dan durasi.
- Tautan ke alert, insiden, dan runbook.
- `request_id` bila aksi berasal dari API.

Larangan:

- Tidak memuat kredensial, token, kunci, atau isi konfigurasi sensitif.
- Tidak memuat data pribadi melebihi identifier yang diperlukan.
- Tidak memuat tautan yang dapat diakses tanpa autentikasi.
- Tidak menyertakan lampiran berisi data mentah.

## 7. Silence dan maintenance window

- Maintenance window dibuat di `AE03`/`AE04` dengan target, waktu mulai, waktu selesai, alasan, dan pembuat.
- Silence memiliki batas waktu maksimum 24 jam; perpanjangan memerlukan approval baru.
- Silence pada alert `critical` hanya boleh saat maintenance yang disetujui dan tidak berlaku untuk alert keamanan `ALT-SEC-*`.
- Silence tidak menghapus alert; alert tetap tercatat dan muncul setelah window berakhir jika kondisi masih ada.
- Maintenance window yang berakhir otomatis; tidak ada silence permanen.
- Setiap silence dan perubahan window masuk audit.

## 8. Siklus insiden

1. **Deteksi**: alert `firing` atau laporan pengguna.
2. **Acknowledge**: pemilik mengambil alert dan membuat/menautkan insiden `AE04`.
3. **Triase**: tentukan severity, dampak, dan scope perusahaan/area.
4. **Mitigasi**: jalankan runbook; gunakan rollback bila tersedia.
5. **Resolve**: pastikan metrik pulih dan alert `resolved`.
6. **Tutup**: catat penyebab, tindakan, dan bukti.
7. **Postmortem**: wajib untuk `critical`, maksimal 5 hari kerja; berisi garis waktu, akar masalah, dan tindakan pencegahan.

Insiden yang menyentuh data atau keamanan mengikuti [security/README.md](../security/README.md) dan dicatat di `AL`.

## 9. Kontrol kebisingan

- Gunakan `for_seconds` agar lonjakan sesaat tidak memicu alert.
- Gunakan hysteresis: nilai pulih harus melewati ambang pemulihan, bukan tepat di ambang.
- Gabungkan alert satu target dengan fingerprint yang sama.
- Inhibisi: host tidak terjangkau menekan alert CPU/RAM/disk host tersebut.
- Alert yang berulang tanpa tindakan ditinjau; perbaiki rule atau perbaiki sistem.
- Tinjau 10 rule paling berisik setiap bulan.
- Target awal: tidak lebih dari 5 alert per host per hari; penyimpangan dibahas di review operasi.
- Alert yang tidak pernah ditindaklanjuti dihapus atau diubah, bukan dibiarkan.

## 10. Pengujian dan latihan

- Rule baru diuji di staging dengan data sintetis.
- Uji kirim satu alert per kanal dan pastikan penerima, tautan, dan redaksi benar.
- Uji eskalasi berbasis waktu minimal per kuartal.
- Uji silence: pastikan berakhir otomatis dan tidak menekan alert keamanan.
- Uji inhibitor: matikan host uji dan pastikan alert turunan ditekan.
- Jangan mengirim alert uji ke produksi tanpa maintenance window dan pemberitahuan.

## 11. Perubahan ambang

- Ambang default diubah melalui review ops dan security.
- Override per perusahaan dicatat dengan alasan dan masa berlaku.
- Perubahan ambang `ALT-SEC-*` dan `ALT-PLAT-12` memerlukan persetujuan Security Lead.
- Perubahan harus memuat dampak ke runbook dan UAT terkait.
- Setelah perubahan, pantau selama 7 hari dan tinjau hasilnya.

## 12. Checklist

- [ ] Setiap rule punya pemilik, severity, dan runbook.
- [ ] Alert `firing` dikirim ke kanal yang benar.
- [ ] Eskalasi waktu berjalan dan diuji.
- [ ] Silence memiliki batas waktu dan audit.
- [ ] Alert keamanan tidak dapat dibungkam.
- [ ] Inhibisi dan deduplikasi bekerja.
- [ ] Notifikasi tidak memuat rahasia atau data pribadi berlebih.
- [ ] Postmortem `critical` selesai dalam 5 hari kerja.
- [ ] Rule paling berisik ditinjau bulanan.
- [ ] Perubahan ambang tercatat dan diuji.

## 13. Dokumen terkait

- [Operasi dan deployment](README.md)
- [Runbook impor data](impor-data.md)
- [Keamanan](../security/README.md)
- [Skema operasi dan monitoring](../technical/database/skema-operasi-monitoring.md)
- [Agent](../technical/agent/README.md)
- [UAT Monitoring](../qaqc/acceptance/ae-monitoring.md)
- [Fungsi backend](../qaqc/function/backend/README.md)
