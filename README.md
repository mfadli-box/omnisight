# OmniSight (OSC) — DevSecOps & SRE Management Platform

**OmniSight** adalah platform DevSecOps & Site Reliability Engineering (SRE) terpadu yang dirancang untuk membantu SRE dan tim DevOps dalam memantau, mengelola, serta merekayasa ulang ekosistem aplikasi multi-company dan multi-area secara efisien, terpusat, dan aman dari potensi serangan cyber.

---

## 🛠️ Tech Stack & Modul Utama

OmniSight dibangun menggunakan arsitektur modular yang tangguh, aman, dan berkinerja tinggi:

| Layer / Komponen | Teknologi Utama | Deskripsi & Peran | Folder |
| :--- | :--- | :--- | :--- |
| **Database & Cache** | PostgreSQL, Valkey, MongoDB | Master data (`dat_*`), transaksi (`trx_*`), telemetri/audit log (`log_*`), serta temporary caching. | `osc_base` |
| **Backend & Storage** | Rust, RustFS | REST API berkinerja tinggi, asynchronous engine, anti-XXE/SSRF security, dan blob storage. | `osc_rest` |
| **Frontend UI/UX** | Next.js, shadcn/ui, Tailwind CSS | Dashboard administratif modular, BFF Proxy, dan komponen antarmuka ramah pengguna. | `osc_site` |
| **Agent / Scheduler** | Golang | Agen telemetri & eksekutor tugas terjadwal lintas platform (**Windows & Linux**). | `osc_auto` |
| **Testing Suite** | Python 3 | Pengujian fungsionalitas otomatis (`test_flows`) dan audit keamanan (`test_guard`). | `osc_docs` |
| **Orkestrasi AI** | AI Agent & Codex CLI | Catatan pengerjaan harian dan log sinkronisasi dari `ai-main`. | `osc_note` |
| **Dokumentasi & QA** | Markdown & Python | Topologi sistem, planning request, re-engineering specs, dan skrip pengujian. | `osc_docs` |

---

## 📂 Susunan Direktori Project

```text
omnisight/
├── osc_base/                 # Database schema, initial, RLS, & seed data
│   ├── init/                 # File initial SQL (PostgreSQL, Valkey, MongoDB)
│   └── notes/                # Catatan kerja tim database (ai-base)
├── osc_rest/                 # Service backend Rust & RustFS storage engine
│   ├── src/                  # Clean Architecture: domain, usecase, & controller
│   └── notes/                # Catatan kerja tim backend (ai-rest)
├── osc_site/                 # Frontend Web Next.js (Dashboard Admin & BFF)
│   ├── src/                  # Components (shadcn/ui), pages, & API routes
│   └── notes/                # Catatan kerja tim frontend (ai-site)
├── osc_auto/                 # Agent SRE & Scheduler Golang (Windows & Linux)
│   ├── cmd/                  # Main entrypoint agent & service runner
│   └── notes/                # Catatan kerja tim agent (ai-auto)
├── osc_docs/                 # Dokumentasi re-engineering, topologi, & pengujian
│   ├── report/               # Laporan pengerjaan harian & log orkestrasi ai-main
│   ├── planning/             # Request, spesifikasi modul (CM, CT, MN, SE, NP, AM, SD, AG), & MP
│   ├── test_flows/           # Skrip testing fungsional berbasis Python
│   ├── test_guard/           # Skrip security guard & penetration test OWASP (Python)
│   └── notes/                # Catatan kerja tim QA & dokumentasi (ai-docs)
├── AGENTS.md                 # Master guardrails & panduan agen AI
├── README.md                 # Dokumentasi utama project OmniSight
└── omnisight.sh              # CLI Script inisialisasi sesi Codex per modul
```

---

## 🔑 Fitur Utama & Aturan Bisnis

### 1. Multi-Company & Multi-Area Access Control
* **Home Assignment**: Data penempatan resmi pegawai tercatat spesifik pada 1 company dan 1 area di tabel `dat_employee`.
* **Operational Access**: Hak akses pengguna diperluas lintas company & area melalui tabel relasi `trx_user_company` dan `trx_user_area`.
* **Granular Role & Menu**: Hak akses granular per menu (`dat_permission`) mendukung kontrol aksi `CREATE`, `READ`, `UPDATE`, `DELETE`, dan `EXECUTE` untuk semua company yang diizinkan.

### 2. Autentikasi HRIS & Fallback Recovery Mechanism
* **Konektivitas Dynamic HRIS**: Setiap company dapat dikonfigurasi memiliki link auth HRIS tersendiri (format XML soap/web API).
* **Skema XML Auth**:
  * Respon Berhasil: `<string xmlns="App.Login">1|---|token</string>` — Password HRIS terbaru otomatis di-hash dan disimpan ke database sebagai `hris_backup_password`.
  * Respon Gagal: `<string xmlns="App.Login">0|---|NONE</string>` — Akses ditolak (*Access Denied*).
* **Fallback Recovery**: Apabila service HRIS eksternal mengalami timeout/error, sistem beralih otomatis ke *Recovery Mode* menguji kredensial terhadap database lokal. User tetap dapat masuk dengan notifikasi warning UI (*Alert HRIS Bermasalah*).
* **Multi-Factor Authentication (MFA)**: Mendukung TOTP/MFA tambahan setelah lolos autentikasi tingkat pertama.

### 3. Konvensi Database & Pengelolaan Log
* **Prefix Tabel**:
  * `dat_*` : Master data dan referensi (contoh: `dat_company`, `dat_user`, `dat_role`).
  * `trx_*` : Data transaksi operasional & log sistem (contoh: `trx_user_company`, `trx_audit_trail`).
  * `log_*` : Telemetri raw & audit trail keamanan (contoh: `log_agent_telemetry`, `log_security_guard`).
* **Summary & Log Rotation**:
  * Agregasi harian (`trx_summary_daily`) dan bulanan (`trx_summary_monthly`) untuk reporting & SLA.
  * *Range Partitioning* PostgreSQL pada tabel log serta rotasi log terkompresi otomatis (`logrotate`) di OS Ubuntu.

---

## 🚀 Panduan Inisialisasi & Jalankan Sistem

### Prasyarat System
* **Sistem Operasi**: Ubuntu 22.04 LTS / 24.04 LTS
* **Dependencies**: Docker Engine `v24+`, Docker Compose `v2.20+`, Rust `1.80+`, Go `1.22+`, Node.js `v20+`, Python `3.12+`.

### Quick Start Deployment

1. **Setup Stack Container (Docker Compose)**:
   ```bash
   docker compose up -d --build
   ```

2. **Verifikasi Status Service**:
   ```bash
   docker compose ps
   ```

3. **Inisialisasi Database & Seed Master Data**:
   ```bash
   docker exec -it osc_base psql -U omnisight_user -d omnisight_db -f osc_base/init/01_dat.sql
   docker exec -it osc_base psql -U omnisight_user -d omnisight_db -f osc_base/init/02_tsx.sql
   docker exec -it osc_base psql -U omnisight_user -d omnisight_db -f osc_base/init/03_log.sql
   docker exec -it osc_base psql -U omnisight_user -d omnisight_db -f osc_base/init/04_seed.sql
   ```

4. **Pengujian Flow & Keamanan**:
   ```bash
   # Pengujian Fungsional
   python3 osc_docs/test_flows/CM01.py
   python3 osc_docs/test_flows/CM02.py
   python3 osc_docs/test_flows/CT02.py
   python3 osc_docs/test_flows/MN02.py
   python3 osc_docs/test_flows/MN03.py
   python3 osc_docs/test_flows/MN04.py
   python3 osc_docs/test_flows/NP01.py
   python3 osc_docs/test_flows/NP02.py
   python3 osc_docs/test_flows/AM01.py
   python3 osc_docs/test_flows/AM02.py
   python3 osc_docs/test_flows/AM03.py
   python3 osc_docs/test_flows/SD01.py
   python3 osc_docs/test_flows/SD02.py

   # Pengujian Keamanan & Guard
   python3 osc_docs/test_guard/CT01.py
   python3 osc_docs/test_guard/MN01.py
   python3 osc_docs/test_guard/SE01.py
   python3 osc_docs/test_guard/SE02.py
   python3 osc_docs/test_guard/AG01.py
   ```

---

## 🤖 AI Agent & Codex CLI Workflow

Proyek OmniSight dikembangkan dengan kolaborasi agen AI yang disiplin sesuai pedoman `AGENTS.md`.

Gunakan script `omnisight.sh` untuk memulai sesi pengkodean AI sesuai modul target:

```bash
# Sesi Backend Rust
./omnisight.sh rest

# Sesi Frontend Next.js
./omnisight.sh site

# Sesi Agent Golang
./omnisight.sh auto

# Sesi QA & Testing
./omnisight.sh docs
```

---

## 📋 Standard Format Specification (`osc_docs/planning/MP-ZZXX-AI.md`)

Setiap pembuatan micro-prompt baru **wajib** menggunakan struktur header dan bagian berikut:

```markdown
---
code: MP-ZZXX-AI
module: [Kode Sub-Modul, e.g., CM01]
owner: [Role Agent AI, e.g., ai-rest, ai-site, ai-auto]
target_model: [gpt-6.2-sol | gpt-6.2-astra | gpt-6.1-terra | gpt-6-astra | gpt-6-sol | gpt-5.6-terra]
reasoning_effort: [high | medium]
---
# Task: [Judul Tugas Singkat & Jelas]

## Input Context
- Specs/Docs: [Lokasi file referensi di osc_docs/ atau AGENTS.md]
- Target Folder: [osc_base | osc_rest | osc_site | osc_auto | osc_docs]

## Objective & Scope
1. ...
2. ...

## Acceptance Criteria
- [ ] Criteria 1 (Fungsional)
- [ ] Criteria 2 (Keamanan/Validation)
- [ ] Criteria 3 (Unit Test / Test Pass)

## Command Execution
./omnisight.sh [rest|site|auto|base|docs|main]

## Output Deliverables
- File target di folder terkait
- Catatan pengerjaan di `osc_<subfolder>/notes/YYYYMMDD-XXX.md`
```

---

## 🛡️ Keamanan & Lisensi

Sistem ini menerapkan standar keamanan ketat:
* Sanitasi input & proteksi dari SQL Injection, Cross-Site Scripting (XSS), dan Cross-Site Request Forgery (CSRF).
* Proteksi XML Parser dari serangan **XML External Entity (XXE)** pada modul login HRIS.
* Audit trail menyeluruh untuk setiap aksi mutasi data pengguna.

© 2026 OmniSight SRE Team. Distributed under Internal Enterprise License.
