# OmniSight (OSC) — Automated Checklist Update Skill & Protocol

Dokumen ini berisi spesifikasi **Skill Update & Protokol Otomatisasi Checklist** untuk memandu AI Agent (`ai-main`, `ai-base`, `ai-rest`, `ai-site`, `ai-auto`, `ai-docs`) dalam mengelola status pengerjaan fitur pada `CHECKLIST.md` dan mencatat riwayat pekerjaan.

---

## 🎯 Tujuan & Aturan Utama

1. **Self-Tracking**: AI Agent wajib memperbarui status checklist di `CHECKLIST.md` setiap kali memulai atau menyelesaikan sebuah micro-task.
2. **Kebenaran Status (Zero False Positives)**:
   * Item bertanda `[ ]` (Pending): Belum dikerjakan.
   * Item bertanda `[/]` (In Progress): Sedang dikerjakan pada sesi aktif.
   * Item bertanda `[x]` (Completed): **HANYA** boleh diisi jika kode telah dibuat DAN pengujian (`test_flows` / `test_guard`) dinyatakan **PASS 100%**.
3. **Persistensi Audit Log**: Setiap perubahan status checklist harus disertai penulisan file catatan kerja di `osc_<folder>/notes/YYYYMMDD-XXX.md`.
4. **Integrasi Data Aset CMDB Toko**:
   * Setiap modul inventaris aset (AM01/AM03) wajib mendukung pemetaan data teknis toko: IP jaringan, Telephony, POS PC, Printer, EDC Terminal, Akun Merchant, serta DigiSign.

---

## 🔄 Alur Kerja Siklus Eksekusi Task & Checklist Update

```
           [ 1. Terima Micro Prompt (MP-ZZXX-AA) ]
                                 |
           [ 2. Buka & BACA CHECKLIST.md ]
                                 |
         [ 3. Ubah Status Target Item: [ ] -> [/] ]
                                 |
             [ 4. Implementasi Kode pada Stack ]
                                 |
           [ 5. Jalankan Automated Test Flow/Guard ]
                                 / \
                        (Pass)  /   \ (Fail)
                               /     \
    [ 6a. Ubah Status Checklist ]   [ 6b. Perbaiki Kode & Retry ]
          [ [/] -> [x] ]
                                 |
      [ 7. Catat Audit Log di osc_<folder>/notes/YYYYMMDD-XXX.md ]
```

---

## 📋 Instruksi Skill per Peran Agent AI

### 1. `ai-main` (Orchestrator & Project Manager)
* **Tugas**: Menjaga integritas `CHECKLIST.md` global.
* **Protokol**:
  * Sebelum membagikan task ke agent sub-sistem, periksa progress ringkasan (`Completed`, `In Progress`, `Pending`).
  * Hitung persentase ketercapaian milestone.

### 2. `ai-base` (Database & Schema Engineer)
* **Tugas**: Menangani Phase 1 (Database) untuk setiap Sub-Modul.
* **Protokol Update Checklist**:
  * Setelah membuat file DDL SQL di `osc_base/init/` dan memverifikasi ekstensi PostgreSQL/partisi, ubah `[ ]` menjadi `[x]` pada **Phase 1 (DB)** sub-modul yang bersangkutan.

### 3. `ai-rest` (Backend Rust & Security Developer)
* **Tugas**: Menangani Phase 2 (Backend Rust) untuk setiap Sub-Modul.
* **Protokol Update Checklist**:
  * Setelah mengimplementasikan endpoint API, parser, atau middleware Rust di `osc_rest`, pastikan `cargo check` atau skrip test Python mengonfirmasi respon valid.
  * Ubah `[ ]` / `[/]` menjadi `[x]` pada **Phase 2 (Rust)**.

### 4. `ai-site` (Frontend Next.js Developer)
* **Tugas**: Menangani Phase 3 (Frontend Next.js) untuk setiap Sub-Modul.
* **Protokol Update Checklist**:
  * Setelah membuat UI component di `osc_site` (menggunakan shadcn/ui dan `SearchableCombobox` tanpa UUID mentah), ubah `[ ]` / `[/]` menjadi `[x]` pada **Phase 3 (Next.js)**.

### 5. `ai-auto` (Golang Agent Developer)
* **Tugas**: Menangani agen SRE Golang di `osc_auto`.
* **Protokol Update Checklist**:
  * Setelah biner agen Golang siap dan mampu mengirim telemetri ber-HMAC ke backend, ubah `[ ]` menjadi `[x]` pada modul agen terkait (`MN01`, `CT02`).

### 6. `ai-docs` (QA & Security Tester)
* **Tugas**: Menangani Phase 4 (QA & Security) untuk pengujian `test_flows` dan `test_guard`.
* **Protokol Update Checklist**:
  * Eksekusi skrip pengujian di `osc_docs/`. Jika output menunjukkan `OK` / `PASS 100%`, ubah `[ ]` / `[/]` menjadi `[x]` pada **Phase 4 (QA/Sec)**.

---

## 📄 Format Template Audit Log (`osc_<folder>/notes/YYYYMMDD-XXX.md`)

Setiap kali agent mengubah status checklist dari `[/]` ke `[x]`, agent **wajib** membuat catatan log dengan format berikut:

```markdown
# Execution Log: MP-CM01-BE

- **Modul**: CM01 (Identity & HRIS Auth Sync)
- **Agent**: ai-rest (Rust Backend Engineer)
- **Model**: gpt-6.2-astra
- **Tanggal**: 2026-11-24

## Work Done
1. Mengimplementasikan `hris_client.rs` dengan parser XML anti-XXE (`quick-xml`).
2. Menambahkan logika Fallback Recovery saat request ke HRIS timeout.
3. Mengonfigurasi update hash `hris_backup_password` ke `dat_user`.

## Verification & Test Results
- Skrip pengujian: `python3 osc_docs/test_flows/CM01.py`
- Result: **7/7 Tests Passed (OK)**

## Checklist Status Update
- Sub-Modul CM01 - Phase 1 (DB): `[x]` Completed
- Sub-Modul CM01 - Phase 2 (Rust): `[x]` Completed
- Sub-Modul CM01 - Phase 4 (QA/Sec): `[x]` Completed
```
