# AGENTS.md — OmniSight DevSecOps Framework & AI Agent Execution Guardrails

File ini memuat aturan baku, arsitektur sistem, batasan folder, dan pedoman eksekusi untuk seluruh AI Agent (Codex CLI, Claude Code, Cursor, Copilot, dsb.) yang bekerja pada proyek **OmniSight**.

---

## 1. Core Architecture & Technology Stack

OmniSight adalah **DevSecOps Tool untuk SRE** yang berjalan di **OS Ubuntu berbasis Docker Containers**. Seluruh agent AI **WAJIB** mematuhi stack teknologi berikut tanpa mengganti dependensi utama:

| Komponen | Stack Teknologi | Lokasi Folder | Standard/Catatan |
| :--- | :--- | :--- | :--- |
| **Database** | PostgreSQL, Valkey, MongoDB | `osc_base/` | Naming convention prefix (`dat_*`, `trx_*`, `log_*`) |
| **Backend Engine** | Rust & RustFS Storage | `osc_rest/` | Clean Architecture (Domain, Application, Infra, Presentation) |
| **Frontend UI** | Next.js (TypeScript) | `osc_site/` | `arhamkhnz/next-shadcn-admin-dashboard-baseui`, Zod, TanStack Table |
| **Agent / Scheduler** | Golang (Go) | `osc_auto/` | Wajib berjalan di **Windows & Linux** (Cross-Platform) |
| **Testing Suite** | Python (pytest, requests) | `osc_docs/` | `test_flows` (Fungsional) & `test_guard` (Keamanan) |
| **Docs & Notes** | Markdown | `osc_docs/` | Bahasa Indonesia untuk narasi, Bahasa Inggris untuk kode/API |

---

## 2. Batasan Structure Directory (Folder Layout)

Setiap AI Agent hanya diperbolehkan bekerja pada folder yang sesuai dengan modul/perannya. Jangan membuat folder root baru di luar struktur baku berikut:

```text
omnisight/
├── osc_base/             # Database Schemas, SQL Migrations, RLS Policies, Data Scripts
│   └── notes/            # Catatan kerja ai-base (YYYYMMDD-XXX.md)
├── osc_rest/             # Rust Backend & Storage REST API
│   └── notes/            # Catatan kerja ai-rest (YYYYMMDD-XXX.md)
├── osc_site/             # Next.js Frontend Dashboard & BFF API Proxy
│   └── notes/            # Catatan kerja ai-site (YYYYMMDD-XXX.md)
├── osc_auto/             # Golang SRE Agent & Telemetry Scheduler
│   └── notes/            # Catatan kerja ai-auto (YYYYMMDD-XXX.md)
└── osc_docs/             # Dokumentasi Teknis, Re-engineering, & QA
    ├── report/           # Laporan orchestrator & project management (ai-main)
    ├── planning/         # Request, Micro-prompts, Specs & AI Skill Instructions
    ├── test_flows/       # Python Functional Test Suite
    ├── test_guard/       # Python Security & OWASP Penetration Test Suite
    └── notes/            # Catatan kerja ai-docs (YYYYMMDD-XXX.md)
```

---

## 3. Otorisasi Multi-Company & Aturan Autentikasi HRIS

Setiap perubahan kode pada modul autentikasi dan penempatan user **WAJIB** mengikuti aturan logika bisnis berikut:

### A. Penempatan vs Akses Otorisasi
1. **Penempatan Resmi (Home Assignment)**: 
   * Setiap pegawai terikat pada 1 `company_id` & `area_id` utama di tabel kepegawaian `dat_employee`.
2. **Akses Multi-Company & Multi-Area**:
   * Hak akses operasional user lintas company diatur secara terpisah pada tabel `trx_user_company` dan `trx_user_area`.
3. **Role & Permintaan Menu**:
   * Role (`dat_role`) berlaku lintas company. Otorisasi granular menggunakan `dat_permission` pada sub-modul menu (`dat_menu`) dengan aksi: `CREATE`, `READ`, `UPDATE`, `DELETE`, `EXECUTE`.

### B. Flow Autentikasi HRIS Web Service & Fallback Recovery
```text
[Input Credentials] -> Cek dat_company.has_hris_link
  ├── HAS_HRIS_LINK = FALSE:
  │    └── Verifikasi Hash Password Lokal (`dat_user`) -> Verification MFA -> Issue Token.
  └── HAS_HRIS_LINK = TRUE:
       └── HTTP Request ke: {hris_login_url}?uLogin={U}&uPaswd={P}
            ├── HTTP 200 & Response: `<string xmlns="App.Login">1|---|token</string>`
            │    ├── Sync/Update Hash `hris_backup_password` ke DB.
            │    └── Verifikasi MFA (jika aktif) -> Issue Token.
            ├── HTTP 200 & Response: `<string xmlns="App.Login">0|---|NONE</string>`
            │    └── DENY ACCESS (Credentials Invalid).
            └── HTTP Timeout / Server Error 500 / XML Invalid:
                 ├── Beralih ke FALLBACK RECOVERY MODE.
                 ├── Verifikasi Password terhadap Hash `hris_backup_password` di DB.
                 ├── Jika Valid & MFA Lolos -> Diizinkan Masuk.
                 └── UI Toast Alert: "HRIS bermasalah. Anda masuk via Mode Pemulihan."
```

---

## 4. Konvensi Database & Telemetri Log

1. **Prefix Naming Database (`osc_base`)**:
   * `dat_*`: Tabel Master Data & Referensi (misal: `dat_company`, `dat_user`, `dat_role`).
   * `trx_*`: Tabel Transaksi & Operational Logs (misal: `trx_user_company`, `trx_audit_trail`, `trx_summary_daily`, `trx_summary_monthly`).
   * `log_*`: Tabel Audit Trail, Telemetri, & Security Logs (misal: `log_agent_telemetry`, `log_security_guard`).
2. **Summary Data**:
   * Wajib menyediakan agregasi data harian (`trx_summary_daily`) dan bulanan (`trx_summary_monthly`).
3. **Log Rotation**:
   * Tabel `log_*` pada PostgreSQL menggunakan *monthly range partitioning*.
   * Redis/Valkey cache wajib menggunakan TTL otomatis.
   * File log pada OS Ubuntu dikelola oleh service `logrotate` dengan kompresi `.gz` (retensi 14 hari).

---

## 5. Pemetaan Peran AI Agent (Sub-Skill Routing)

Saat mengeksekusi perintah CLI atau agent AI, aktifkan konteks skill yang sesuai dari `osc_docs/planning/`:

| Agent / Skill | Target Scope | Tugas Utama & Core Rules |
| :--- | :--- | :--- |
| **`ai-main`** | Orchestration & Project Mgmt | Menyusun micro-prompt, mengawasi roadmap global, mencatat log di `osc_docs/report/`. |
| **`ai-base`** | `osc_base/` | Mengelola skema PostgreSQL/Valkey/MongoDB, RLS, query parameterization. |
| **`ai-rest`** | `osc_rest/` | Membangun API Rust, Clean Architecture, anti-XXE parser, SSRF protection. |
| **`ai-site`** | `osc_site/` | Frontend Next.js, shadcn/ui, Zod schema validation, BFF API proxy, **DILARANG menampilkan String UUID mentah ke user** (Gunakan `SearchableCombobox`). |
| **`ai-auto`** | `osc_auto/` | Agent SRE Golang, HMAC signature check, command allowlisting (Win/Linux). |
| **`ai-docs`** | `osc_docs/` | Pengujian Python (`test_flows`, `test_guard`), dokumentasi arsitektur, threat modeling OWASP. |

---

## 6. Strict Protocol for AI Work Execution

Seluruh AI Agent **HARUS** mengikuti aturan kerja berikut:

1. **Aturan Bahasa (Docs & Notes)**:
   * Seluruh dokumentasi teknis, file panduan, dan catatan pengerjaan (`notes/`) **WAJIB ditulis dalam Bahasa Indonesia**.
   * Nama variabel, identifier kode, API endpoint, JSON keys, dan SQL queries **TETAP dalam Bahasa Inggris**.
2. **Logging Catatan Kerja (Wajib)**:
   * Setiap sesi pengerjaan AI wajib mencatat/memperbarui file markdown dengan penamaan `YYYYMMDD-XXX.md` pada folder `notes/` masing-masing sub-modul (contoh: `osc_rest/notes/20261124-001.md`).
   * Format catatan memuat: **Objektif**, **Scope/Keputusan**, **Hasil Eksekusi**, dan **Status Verifikasi** (`passed` atau `not run`).
3. **Prinsip Kejujuran Verifikasi**:
   * Jangan pernah mengklaim pengujian/security check telah sukses tanpa bukti eksekusi nyata. Jika tes belum dijalankan, tuliskan statusnya sebagai `not run`.
4. **Keamanan & Rahasia Data**:
   * Dilarang keras menaruh password, secret key, atau API token dalam bentuk plaintext pada repositori kode, skrip testing, maupun file log.

---

### Lampiran: Perintah Cepat Jalankan AI Session via Codex CLI

```bash
# Jalankan AI Agent sesuai domain tugas
./omnisight.sh main   # Untuk Orchestration & Management
./omnisight.sh rest   # Untuk Backend Rust
./omnisight.sh site   # Untuk Frontend Next.js
./omnisight.sh auto   # Untuk Golang Agent
./omnisight.sh base   # Untuk Database Engine
./omnisight.sh docs   # Untuk Documentation & QA Testing
```
