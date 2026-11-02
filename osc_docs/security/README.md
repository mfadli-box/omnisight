# Keamanan OmniSight

## 1. Sikap dasar

Tidak ada sistem yang "100% tidak bisa diretas". Tujuan OmniSight adalah:

- Mengurangi permukaan serangan.
- Membatasi dampak jika satu lapisan gagal.
- Mendeteksi dan merespons lebih cepat.
- Membuktikan siapa melakukan apa melalui audit.

Dokumen ini menjadi baseline. Setiap fitur baru wajib melewati checklist keamanan sebelum rilis.

## 2. Aset yang dilindungi

| Aset | Dampak jika bocor/berubah |
|---|---|
| Kredensial pengguna | Pengambilalihan akun |
| Sesi dan token | Akses tidak sah |
| Data lintas perusahaan | Pelanggaran privasi dan kontrak |
| Kredensial perangkat/jaringan | Perubahan konfigurasi berbahaya |
| Konfigurasi Nginx/sertifikat | Downtime, penyadapan |
| Docker/Podman API | Eksekusi container berbahaya |
| Konfigurasi firewall | Lockout atau pembukaan akses |
| Rekaman bastion | Kebocoran data sensitif |
| Audit trail | Kehilangan bukti, manipulasi |
| Backup | Kehilangan data dan pemulihan palsu |
| Vault/secret | Kompromi seluruh integrasi |

## 3. Threat model ringkas (STRIDE)

| Ancaman | Contoh | Kontrol utama |
|---|---|---|
| Spoofing | Menebak sesi, mencuri cookie, memalsukan agent | JWT EdDSA, cookie HttpOnly, mTLS agent, MFA |
| Tampering | Mengubah body, ID, atau audit | Validasi server, RLS, hash chain audit, signature |
| Repudiation | Menyangkal aksi | Audit aktor + request id + approval |
| Information disclosure | IDOR lintas tenant, error detail | Scope check, RLS, pesan generik, redaksi log |
| Denial of service | Login/ingest/API flooding | Rate limit, body limit, timeout, WAF, backpressure |
| Elevation of privilege | Role injection, SSRF ke metadata, Docker socket | Deny by default, allowlist, vault, socket proxy |

## 4. Zona dan batas kepercayaan

Lihat [topologi dan akses](../technical/backend/topologi-dan-akses.md). Ringkas:

- Internet hanya mencapai edge 443.
- Aplikasi tidak mengekspos database, Docker API, RouterOS API, atau metrics.
- Agent hanya outbound.
- Admin hanya melalui bastion/VPN + MFA.
- Integrasi keluar memakai allowlist dan TLS.

## 5. Kontrol identitas dan akses

### 5.1 Password

- Argon2id, parameter dituning agar minimal 64 MB memori, 3 iterasi, parallelism sesuai kapasitas.
- Password minimal 12 karakter atau frasa sandi; tolak password umum.
- Tidak ada password default.
- Password tidak pernah dikembalikan API, dicatat, atau dikirim ke frontend.
- Reset password (jika diaktifkan) memakai token sekali pakai berumur pendek.

### 5.2 JWT dan sesi

- EdDSA/Ed25519, `kid` untuk rotasi.
- Access token 10–15 menit; refresh 8–12 jam.
- Refresh token opaque, disimpan sebagai hash, dirotasi, reuse detection.
- Sesi dapat dicabut; perubahan role/status mencabut sesi.
- JWT tidak memuat izin lengkap; izin dibaca server dengan cache pendek.
- `iss`, `aud`, `exp`, `nbf`, `iat` divalidasi.
- Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, CSRF token untuk POST.
- Jangan menyimpan token di localStorage.

### 5.3 MFA

- Wajib untuk Platform Owner, Company Admin, approver, dan akses bastion.
- Dukung TOTP dan WebAuthn/passkey.
- MFA ulang untuk aksi sangat sensitif (firewall, restore, impersonasi).
- Kode OTP tidak boleh dicatat.

### 5.4 Otorisasi

- Deny by default.
- Izin `read`/`post` per modul dan submenu sensitif.
- Scope perusahaan dari membership; scope area divalidasi ke subtree.
- Jangan mempercayai `company_id`, role, atau scope dari body/header tanpa validasi.
- Data di luar scope diperlakukan sebagai tidak ditemukan.
- RLS sebagai lapisan kedua.
- Aksi sensitif memerlukan approval dan alasan.
- Uji IDOR setiap rilis.
- Matriks izin lengkap per submodul dan peran ada di [matriks-izin.md](matriks-izin.md).

### 5.5 Multi-tenant

- Tabel tenant memiliki `company_id`; tabel turunan tanpa kolom itu (`membership_roles`, `role_permissions`, `hris_login_rules`, `hris_login_logs`) memakai kebijakan yang mengikuti parent-nya.
- Foreign key komposit mencegah relasi lintas perusahaan, termasuk item access review, webhook delivery, dan integration link.
- RLS `FORCE` untuk user aplikasi, termasuk setiap partisi `core.login_attempts`. Partisi baru wajib menerima kebijakan yang sama.
- Platform admin tidak otomatis melihat data bisnis; impersonasi harus eksplisit dan diaudit.
- Uji dengan minimal dua perusahaan dan dua area.

### 5.6 Pengecualian dan keputusan terbuka WP-02

- `core.user_identities` tanpa RLS karena lookup lintas tenant. Akses hanya lewat jalur auth; kebijakan teknis di ADR-016.
- `core.users`, `core.sessions`, dan `core.refresh_tokens` belum memiliki RLS. `core.users` menyimpan `password_hash` dan `mfa_secret_ref` serta masih dapat diakses `osc_rest_app` melalui grant tabel. Kebijakan auth terpadu masih menunggu perluasan ADR-016; jangan menambah endpoint auth sebelum keputusan itu.
- Baris `core.login_attempts` dengan `company_id NULL` (pra-autentikasi) tidak terlihat oleh policy tenant. Jalur pencatatan pra-login memerlukan peran atau kebijakan terpisah; bagian dari keputusan auth.
- `audit.audit_events` masih memiliki grant `INSERT` langsung dan `append_event` bergantung pada owner migrasi dengan `BYPASSRLS`. Hash chain belum menjadi satu-satunya jalur tulis; keputusan di ADR-015.
- `platform.settings` menyimpan baris global `company_id` NULL yang tidak terlihat oleh policy tenant saat ini, dan definisi peran platform masih berupa salinan sementara. Keputusan di ADR-017. Hal yang sama berlaku untuk endpoint integrasi global: trigger `platform.enforce_integration_link_tenant()` adalah `SECURITY DEFINER` dan bergantung pada owner migrasi dengan `BYPASSRLS` untuk membacanya.

## 6. Kontrol input dan output

| Risiko | Kontrol |
|---|---|
| SQL injection | SQLx bind parameter, allowlist sort/filter |
| Command injection | Tanpa shell, argumen array, allowlist aksi, timeout |
| SSRF | Allowlist host, tolak IP internal/metadata, validasi redirect |
| XSS | Sanitasi markdown, CSP, escape template, tanpa HTML mentah |
| CSRF | SameSite + token + origin check |
| Open redirect | Hanya path internal allowlist |
| Path traversal | Nama file acak, validasi path, storage di luar webroot |
| File upload | Batas ukuran, deteksi MIME, pemindaian, non-executable |
| Deserialization | Tidak menerima objek arbitrer; schema ketat |
| Mass assignment | DTO eksplisit; tidak menerima field sensitif |
| Log injection | Escape newline pada field log |

Aturan tambahan:

- Validasi dilakukan di server, bukan hanya klien.
- Batas panjang string, ukuran JSON, jumlah item batch, dan kedalaman JSON.
- Tolak properti tak dikenal pada DTO sensitif.
- Semua error validasi memakai kode `AA00-00-0001` tanpa detail internal.

### 6.1 Lokalisasi

- `Accept-Language`, cookie locale, dan field `locale` divalidasi terhadap allowlist `en`, `id`; nilai asing jatuh ke `en`.
- Bahasa tidak memengaruhi otorisasi, scope, atau audit; izin tetap dari sesi dan membership.
- Pesan keamanan (login gagal, akses ditolak, MFA) tetap generik di kedua bahasa dan tidak membocorkan keberadaan akun atau data.
- Katalog terjemahan diperlakukan sebagai aset tepercaya: dirender sebagai teks, tanpa eksekusi HTML, dan tidak memakai input pengguna sebagai kunci dinamis.
- Kunci terjemahan yang hilang jatuh ke `en`; jangan menampilkan pesan kosong atau error yang mengungkap detail internal.
- Log mencatat `locale` untuk analisis, tetapi tidak mencatat nilai terjemahan mentah yang mungkin memuat data sensitif.
- Perubahan bahasa dicatat di audit.
- Halaman terautentikasi dengan locale berbasis cookie memakai `Cache-Control: private, no-store`; jangan di-cache bersama di CDN.

## 7. Kebijakan tanpa 403 dan 5xx

### Tujuan

- Menghindari 403 yang salah dianggap serangan oleh perangkat keamanan.
- Menghindari 5xx yang dianggap "bridge rusak".
- Menjaga envelope konsisten.

### Kontrol pengganti

- Penolakan akses tetap **HTTP 200** dengan kode `AA00-00-0003`.
- Penolakan dicatat di audit dan metrik `authorization_denials_total`.
- WAF dan rate limit tetap aktif.
- Error internal dipetakan ke `AA00-00-0100`; detail hanya di log.
- Health check internal memakai status HTTP nyata dan tidak diekspos.
- Alarm dibuat dari log/metrik, bukan dari status HTTP klien.
- Jangan memakai 200 untuk menyembunyikan kegagalan dari monitoring internal.

### Peringatan

Kebijakan ini bukan kontrol keamanan. Keamanan tetap berasal dari autentikasi, otorisasi, validasi, dan pemantauan. Jika ada insiden, tim harus bisa melihat kode bisnis dan log asli.

## 8. Keamanan per modul

### AA Dashboard

- Semua kartu dan grafik difilter dengan scope pengguna; dashboard tidak menambah akses.
- Endpoint agregat tidak boleh membocorkan data lintas perusahaan atau area.
- Cache dipisahkan per pengguna/perusahaan, tidak boleh dipakai lintas tenant.
- Tugas saya hanya menampilkan tiket, approval, dan review milik pengguna.

### AB Identitas

- Login generic message; rate limit per IP/identifier/tenant.
- Lockout eksponensial.
- HRIS: SSRF protection, TLS, no password logging, fail-closed default, role mapping tidak ke platform owner.
- Undangan memakai token sekali pakai.
- Perubahan role diaudit.

### AC Aset

- Scope lokasi/area divalidasi.
- QR token acak dan dapat dicabut.
- Riwayat append-only.
- Data pribadi penanggung jawab minimal.
- Export memerlukan izin.

### AD Jaringan/MikroTik

- API perangkat tidak diekspos publik.
- Akun read-only untuk baca; write hanya saat approval.
- Perubahan firewall: rencana, snapshot, approval, rollback otomatis.
- Larang perintah bebas.
- Kredensial vault; rotasi.
- Uji lockout di lab sebelum produksi.

### AE Monitoring

- Agent mTLS dan signature.
- Batas laju ingest.
- Label metrik tanpa PII.
- Wazuh active response hanya dengan approval.
- Alert tidak memuat data sensitif.

### AF Container

- Socket proxy, bukan socket mentah.
- Endpoint allowlist; `exec/build/secrets/configs/system` dimatikan.
- Tanpa privileged/host network kecuali kebijakan khusus.
- Image dipin digest dan dipindai.
- Deploy produksi approval + rollback.
- Resource limit.

### AG Edge

- Template config, `nginx -t`, reload atomik, rollback.
- Upstream allowlist (SSRF).
- Private key di vault.
- Auto-renew dan alert expiry.
- Tanpa editor config bebas.

### AH Backup

- Snapshot terenkripsi dan checksum.
- Restore approval + pre-restore snapshot.
- Akses baca terbatas.
- Uji restore berkala.
- Jangan menyimpan kredensial perangkat di snapshot.

### AI Bastion

- MFA, approval, durasi.
- Rekaman terenkripsi.
- Sesi dapat dicabut.
- Akses menonton rekaman diaudit.
- Integrasi JumpServer, bukan membangun bastion sendiri di tahap awal.

### AJ Layanan

- Tiket internal/public dipisahkan.
- Lampiran dipindai.
- SLA dihitung server.
- Jangan menaruh data sensitif di judul/notifikasi.

### AK Konten

- Sanitasi markdown/HTML.
- Template notifikasi di-escape per kanal.
- Webhook HMAC.
- Konten publik melalui server, bukan API terbuka tanpa kontrol.

### AL Audit

- Append-only, hash chain.
- Akses read-only untuk auditor.
- Ekspor approval.
- Redaksi field sensitif.
- Verifikasi chain berkala.
- Retensi terkontrol.
- Satu jalur tulis `audit.append_event` dan pencabutan `INSERT` langsung masih menunggu keputusan ADR-015.

### AM Platform

- Kredensial write-only dan vault.
- API key hash + scope + expiry.
- Webhook allowlist + HMAC.
- Feature flag diaudit.
- Impersonasi berbatas waktu.

## 9. Keamanan agent

- Enrollment token sekali pakai.
- mTLS + signature + replay protection.
- Outbound-only.
- Non-root, cap drop, read-only, no-new-privileges.
- Tanpa shell bebas.
- Tugas allowlist + expiry + timeout.
- Buffer lokal terenkripsi.
- Update bertanda tangan.
- Pencabutan agent.
- Log tanpa rahasia.
- Docker socket hanya via proxy.

## 10. Keamanan database

- TLS, enkripsi disk, backup terenkripsi.
- User DB least privilege; `osc_rest_app` bukan owner.
- RLS + FK komposit.
- Audit append-only.
- Tidak ada superuser aplikasi.
- Migrasi hanya oleh user migrasi.
- Query tanpa filter tenant dilarang.
- Uji restore dan verifikasi backup.
- Batas koneksi dan timeout.

## 11. Keamanan infrastruktur

- Edge: TLS 1.2+ (utamakan 1.3), HSTS, WAF, rate limit, body limit.
- Segmentasi jaringan; default deny.
- Tidak ada database/Docker/RouterOS/metrics publik.
- Bastion/VPN untuk admin.
- Host hardening: update, SSH key, firewall, auditd, AppArmor, fail2ban, NTP.
- Container: non-root, read-only, cap drop, seccomp, resource limit.
- Secret manager.
- Log terpusat, waktu tersinkron.
- Backup 3-2-1, restore diuji.

## 12. Supply chain

- Lockfile untuk Rust, npm, Go.
- `cargo audit`, `cargo deny`, `npm audit`, `govulncheck`.
- Image dipindai (Trivy/Grype).
- SBOM (Syft) dan tanda tangan (Cosign).
- Pin image digest.
- Review dependensi baru.
- Jangan menyalin kode dari aplikasi referensi tanpa cek lisensi.
- CI memblokir temuan kritis.

## 13. Secure SDLC

1. Threat model per fitur baru.
2. Review desain untuk perubahan auth, data, dan integrasi.
3. Code review wajib.
4. SAST (Semgrep/CodeQL).
5. Dependency scan.
6. Secret scan (gitleaks).
7. DAST pada staging.
8. Uji IDOR dua tenant.
9. Pentest sebelum produksi dan berkala.
10. Perbaikan temuan sebelum rilis.

## 14. Vulnerability management

| Severity | Target perbaikan |
|---|---|
| Kritis | 24–72 jam atau mitigasi segera |
| Tinggi | 7 hari |
| Sedang | 30 hari |
| Rendah | 90 hari |

- Temuan kritis memblokir rilis.
- Jika belum bisa diperbaiki, dokumentasikan mitigasi dan risiko.
- Pantau CVE dependensi dan image.

## 15. Deteksi dan respons

Sinyal yang dipantau:

- Lonjakan login gagal.
- Lonjakan kode `AA00-00-0003` per pengguna/IP.
- Login dari lokasi/perangkat tidak biasa.
- Perubahan role/admin.
- Perubahan firewall/restore/deploy.
- Impersonasi.
- Agent offline atau sertifikat hampir kedaluwarsa.
- Error internal dan upstream.
- Akses ke rekaman/file sensitif.

Alur insiden:

1. Deteksi dan klasifikasi.
2. Isolasi (cabut sesi/token/agent, blokir IP, nonaktifkan integrasi).
3. Investigasi dengan audit + log + trace.
4. Pemulihan dari backup bersih.
5. Perbaikan akar masalah.
6. Postmortem tanpa menyalahkan individu.
7. Perbarui kontrol dan dokumentasi.

## 16. Privasi dan kepatuhan

- Minimalkan data pribadi.
- Klasifikasikan data: publik, internal, rahasia, sangat rahasia.
- Retensi jelas; hapus/arsip terjadwal.
- Akses berdasarkan kebutuhan.
- Jejak audit untuk akses data sensitif.
- Referensi UU PDP Indonesia sebagai acuan, bukan nasihat hukum.
- Perjanjian pengolahan data dengan klien jika diperlukan.
- Jangan meminta data pribadi di dokumentasi atau contoh.

## 17. Checklist pentest

- [ ] IDOR lintas perusahaan/area.
- [ ] Eskalasi role lewat body/header.
- [ ] Bypass MFA.
- [ ] Reuse refresh token.
- [ ] Fixation/logout tidak mencabut sesi.
- [ ] Login enumeration.
- [ ] Rate limit login/ingest.
- [ ] SSRF HRIS/webhook/upstream.
- [ ] XSS markdown/ticket/nama aset.
- [ ] CSRF pada POST cookie.
- [ ] SQL injection filter/sort.
- [ ] Command injection agent/task.
- [ ] Upload file berbahaya.
- [ ] Path traversal download.
- [ ] Docker socket escape.
- [ ] Agent palsu/replay.
- [ ] Firewall lockout/rollback.
- [ ] Audit dapat dimanipulasi.
- [ ] Backup tidak dapat direstore.
- [ ] Error membocorkan stack/SQL.
- [ ] Health endpoint terbuka publik.
- [ ] Webhook signature.
- [ ] Impersonasi tanpa audit.
- [ ] Bypass otorisasi lewat parameter bahasa/locale.
- [ ] Pesan keamanan tetap generik di `en` dan `id`.
- [ ] Injeksi lewat nilai terjemahan atau kunci dinamis.

## 18. Checklist rilis keamanan

- [ ] Threat model diperbarui.
- [ ] Semua endpoint punya izin.
- [ ] Uji dua tenant lulus.
- [ ] Tidak ada 403/5xx aplikasi.
- [ ] Penolakan tercatat.
- [ ] Secret tidak ada di repo/log.
- [ ] Dependency scan bersih dari kritis.
- [ ] Image dipin dan ditandatangani.
- [ ] Backup + restore diuji.
- [ ] Rate limit dan body limit aktif.
- [ ] Header keamanan aktif.
- [ ] Audit dan redaksi diuji.
- [ ] Katalog `en`/`id` paritas dan fallback `en` diuji.
- [ ] Runbook insiden tersedia.
- [ ] Pentest/temuan ditutup.
- [ ] Matriks izin dan skenario UAT diperbarui saat menambah submodul atau aksi.
