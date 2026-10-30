# Keputusan Arsitektur (ADR)

Format ringkas: konteks, keputusan, konsekuensi, alternatif. Seluruh keputusan berstatus **Disetujui** bersama dokumentasi 0.6 pada 2026-10-30 (G0).

---

## ADR-001: PostgreSQL satu cluster, banyak schema, RLS

**Status:** Disetujui

**Konteks:** OmniSight multi-perusahaan dan memiliki banyak domain. Data harus terisolasi, tetapi query lintas domain tetap dibutuhkan.

**Keputusan:**

- Satu database `omnisight`.
- Schema per domain: `core`, `asset`, `network`, `monitor`, `ops`, `service`, `content`, `audit`, `platform`.
- Setiap tabel tenant memiliki `company_id` dan RLS `FORCE`.
- Foreign key komposit mencegah relasi lintas perusahaan.
- Satu primary, read replica untuk laporan.

**Konsekuensi:**

- Positif: isolasi berlapis, query lintas domain mudah, operasi lebih sederhana daripada banyak database.
- Negatif: satu cluster adalah blast radius; butuh backup/failover disiplin.
- RLS menambah kompleksitas query dan testing.

**Alternatif:** database per tenant (mahal untuk banyak tenant kecil), schema per tenant (migrasi rumit).

---

## ADR-002: Prisma hanya skema dan migrasi, SQLx untuk runtime

**Status:** Disetujui

**Konteks:** Tim memilih Prisma untuk skema/migrasi, tetapi backend Rust membutuhkan kontrol SQL, performa, RLS, partisi, dan audit hash chain.

**Keputusan:**

- Prisma menjadi sumber skema dan riwayat migrasi.
- SQL manual ditambahkan ke migrasi untuk RLS, grant, trigger, partisi, function.
- Prisma Client tidak dipakai.
- Rust memakai SQLx dengan query terverifikasi.

**Konsekuensi:**

- Positif: satu riwayat migrasi, kontrol penuh di Rust, tidak ada dua ORM.
- Negatif: setiap perubahan schema harus sinkron dengan model Rust; butuh review migrasi.
- Tim harus memahami SQL, bukan hanya Prisma.

**Alternatif:** Prisma Client (tidak cocok dengan Rust), SQL murni tanpa Prisma (kehilangan alat migrasi).

---

## ADR-003: Satu pintu tulis domain di osc_rest

**Status:** Disetujui

**Konteks:** Banyak komponen (frontend, agent, worker) perlu membaca/menulis data.

**Keputusan:**

- Hanya `osc_rest` yang menulis database domain.
- `osc_auto` memakai API internal `osc_rest`.
- Agent hanya mengirim data ke collector; tidak mengakses database.
- Frontend hanya memanggil API.

**Konsekuensi:**

- Positif: otorisasi, audit, validasi, dan konsistensi terpusat.
- Negatif: `osc_rest` menjadi jalur kritis; butuh skalabilitas dan timeout.
- API internal harus aman (mTLS, token, network policy).

**Alternatif:** Setiap service menulis DB sendiri (sulit diaudit, rawan isolasi bocor).

---

## ADR-004: Respons bisnis HTTP 200 dengan envelope, tanpa 403/5xx

**Status:** Disetujui

**Konteks:** Pengguna tidak ingin 403 dianggap serangan dan 5xx dianggap bridge rusak. Frontend membutuhkan kontrak konsisten.

**Keputusan:**

- Semua hasil bisnis memakai HTTP 200 + `ok/code/message/data/meta/errors`.
- Tidak memakai 403.
- Error aplikasi dipetakan ke `AA00-00-0100`/`AA00-00-0900`.
- Health check internal memakai status HTTP nyata dan hanya di jaringan internal.
- Penolakan dan error tetap dicatat di audit/metrik.

**Konsekuensi:**

- Positif: kontrak seragam, menghindari false positive perangkat keamanan, mengurangi enumerasi.
- Negatif: monitoring tidak boleh bergantung pada status HTTP klien; klien wajib memeriksa `code`.
- Risiko 200 menyembunyikan kegagalan jika logging tidak disiplin.

**Alternatif:** status HTTP konvensional (403/4xx/5xx) dengan envelope.

---

## ADR-005: Multi-tenant membership, scope area, izin read/post

**Status:** Disetujui

**Konteks:** Satu pengguna bisa di beberapa perusahaan; akses harus dibatasi area; pengguna meminta model READ/POST.

**Keputusan:**

- `users` global, `company_memberships` per perusahaan.
- Role dan izin per membership; scope `company` atau `area`.
- Aksi hanya `read` dan `post`.
- Aksi berisiko bertanda sensitif dan memerlukan approval.
- Data di luar scope dianggap tidak ditemukan.

**Konsekuensi:**

- Positif: model sederhana dan mudah dipahami; scope jelas.
- Negatif: kebutuhan aksi granular harus dipetakan ke `post` + approval.
- Role per area menambah kompleksitas evaluasi.

**Alternatif:** izin CRUD penuh per resource (lebih granular tetapi lebih rumit).

---

## ADR-006: Argon2id + JWT EdDSA + refresh rotation + aturan HRIS dinamis

**Status:** Disetujui

**Konteks:** Pengguna lokal dan HRIS; perlu sesi aman dan aturan login yang berbeda per perusahaan.

**Keputusan:**

- Password lokal Argon2id.
- Access JWT EdDSA umur pendek; refresh opaque dirotasi.
- Sesi dapat dicabut; reuse detection.
- HRIS mendukung POST/GET, mapping field/role, pesan gagal dinamis, fail-closed default.
- Password HRIS tidak disimpan/dicatat.

**Konsekuensi:**

- Positif: aman, fleksibel, tidak terikat satu vendor HRIS.
- Negatif: aturan HRIS berupa konfigurasi kompleks; perlu editor tervalidasi dan uji.
- Rotasi kunci JWT butuh proses.

**Alternatif:** session server-side murni (lebih sederhana, tetapi butuh store); password grant OAuth (kurang fleksibel untuk HRIS legacy).

---

## ADR-007: Agent outbound-only dengan mTLS dan compose satuan

**Status:** Disetujui

**Konteks:** Agent berada di jaringan klien, sering di belakang NAT/firewall, dan menangani operasi sensitif.

**Keputusan:**

- Agent hanya membuka koneksi keluar.
- Enrollment token sekali pakai + CSR + mTLS.
- Payload bertanda tangan, replay protection.
- Satu compose per agent; host/edge disarankan native.
- Tugas allowlist, timeout, approval.

**Konsekuensi:**

- Positif: tidak perlu membuka port masuk; identitas agent kuat; isolasi lebih baik.
- Negatif: butuh PKI/rotasi sertifikat; troubleshooting lebih sulit.
- Compose satuan menambah jumlah deployment yang dikelola.

**Alternatif:** agent push tanpa mTLS (tidak aman), agent inbound (sulit di jaringan klien).

---

## ADR-008: Bangun inti native, integrasikan alat matang

**Status:** Disetujui

**Konteks:** Banyak alat referensi sudah matang, tetapi data dan akses harus terpadu.

**Keputusan:**

- Native: identitas, aset, jaringan/IPAM, monitoring ringan, container ops, edge, backup, audit.
- Integrasi: JumpServer untuk bastion, Wazuh untuk SIEM, GLPI untuk ITSM penuh, NetBox/Snipe-IT untuk klien yang sudah memakainya, Directus untuk CMS lanjutan.
- Referensi bukan salinan kode; lisensi diperiksa.

**Konsekuensi:**

- Positif: fokus pada nilai integrasi; tidak membangun ulang alat kompleks.
- Negatif: banyak adapter dan pemetaan data; perlu aturan sumber kebenaran.
- Ketergantungan pada API pihak ketiga.

**Alternatif:** membangun semua sendiri (mahal, berisiko), hanya integrasi semua (tidak ada pengalaman satu pintu).

---

## ADR-009: Audit append-only dengan hash chain

**Status:** Disetujui

**Konteks:** Audit harus dapat dipercaya dan tidak bisa dihapus diam-diam.

**Keputusan:**

- `audit.audit_events` append-only.
- Hash chain per `chain_key` (perusahaan/platform).
- Aplikasi hanya INSERT/SELECT.
- Verifikasi chain berkala.
- Redaksi data sensitif.

**Konsekuensi:**

- Positif: manipulasi terdeteksi; bukti kuat.
- Negatif: penulisan audit menambah latensi; butuh transaksi dan `FOR UPDATE` pada chain head.
- Volume besar butuh arsip/partisi.

**Alternatif:** audit biasa tanpa hash (lebih murah, lebih mudah dimanipulasi).

---

## ADR-010: Frontend same-origin, cookie HttpOnly, tanpa token di storage

**Status:** Disetujui

**Konteks:** Frontend Next.js dan backend Rust terpisah, tetapi harus aman dari XSS/CSRF.

**Keputusan:**

- Edge menyatukan origin `/` dan `/api/v1`.
- Sesi di cookie `HttpOnly`, `Secure`, `SameSite`.
- CSRF token untuk POST.
- Jangan menyimpan token di localStorage.
- Server Component mengambil data awal.

**Konsekuensi:**

- Positif: token tidak terbaca JavaScript; CORS lebih sederhana.
- Negatif: butuh CSRF dan same-origin routing; SSR harus meneruskan cookie.
- Debugging lintas layanan sedikit lebih rumit.

**Alternatif:** SPA dengan token di memory + refresh cookie (lebih rumit), BFF dengan session store (menambah state).

---

## ADR-011: Docker/Podman via socket proxy, bukan socket mentah

**Status:** Disetujui

**Konteks:** Operasi container membutuhkan API engine, tetapi socket mentah setara root.

**Keputusan:**

- Gunakan socket proxy dengan endpoint allowlist.
- `EXEC`, `BUILD`, `SECRETS`, `CONFIGS`, `SWARM`, `SYSTEM` dimatikan.
- Deploy/rollback memerlukan approval.
- Image dipin digest.
- Tanpa privileged/host network default.

**Konsekuensi:**

- Positif: mengurangi dampak kompromi; audit aksi.
- Negatif: beberapa operasi lanjutan tidak tersedia; proxy tetap powerful.
- Butuh host khusus/rootless untuk risiko tinggi.

**Alternatif:** socket mentah (sangat berisiko), API engine langsung (sama-sama berisiko).

---

## ADR-012: Partisi dan retensi data operasional

**Status:** Disetujui

**Konteks:** Metrik, login attempt, dan job run tumbuh cepat.

**Keputusan:**

- `metric_samples`, `login_attempts`, `job_runs` dipartisi bulanan.
- Rollup metrik per jam.
- Retensi default: metrik raw 30 hari, rollup 1 tahun, login 180 hari, job 90 hari.
- Audit minimal 2 tahun, diarsipkan dengan bukti.

**Konsekuensi:**

- Positif: query dan pembersihan lebih terkendali; biaya storage terkendali.
- Negatif: butuh job maintenance partisi dan hak DDL terpisah.
- Query lintas partisi perlu perencanaan.

**Alternatif:** satu tabel besar (sulit dibersihkan), TimescaleDB (menambah dependensi).

---

## ADR-013: Dual bahasa dengan locale per pengguna

**Status:** Disetujui

**Konteks:** Pengguna berasal dari tim internal dan klien yang berbeda bahasa. Label dan pesan harus dapat dipahami tanpa menggandakan endpoint atau mengubah kode error.

**Keputusan:**

- Bahasa yang didukung: `en` (default) dan `id`.
- Locale disimpan per pengguna di `core.users.locale`; locale perusahaan menjadi fallback.
- Frontend mengirim `Accept-Language`; backend membalas `Content-Language`.
- Urutan locale: `Accept-Language` yang didukung > locale pengguna > locale perusahaan > `en`.
- Katalog backend di `osc_rest/locales/`, katalog frontend di `messages/`.
- Kode error dan kode modul tidak diterjemahkan; hanya `message`/`reason` dan label.
- Kunci terjemahan stabil, paritas `en`/`id` diperiksa CI, dan fallback ke `en`.

**Konsekuensi:**

- Positif: satu endpoint melayani dua bahasa; kode error tetap stabil untuk otomasi dan audit.
- Negatif: setiap string baru menambah dua kunci; butuh disiplin review terjemahan.
- Cache halaman terautentikasi harus privat karena bahasa berasal dari cookie.

**Alternatif:** bahasa per perusahaan saja (tidak fleksibel untuk pengguna campuran), endpoint terpisah per bahasa (duplikasi kontrak), terjemahan di klien saja (pesan backend tetap satu bahasa).
