# Fungsi Database

Status: Disetujui (0.6)

Database PostgreSQL adalah sumber kebenaran untuk identitas, akses, inventaris, status operasional, dan audit. Database tidak memanggil layanan eksternal dan tidak menerima koneksi dari agent atau `osc_auto`.

## 1. Katalog fungsi

| Kode | Fungsi | Penjelasan |
|---|---|---|
| DB-F-01 | Skema dan migrasi | Prisma menjadi sumber skema; SQL manual untuk RLS, trigger, partisi, grant |
| DB-F-02 | Isolasi tenant | `company_id` wajib dan RLS `FORCE` |
| DB-F-03 | Integritas data | Foreign key komposit, unique parsial, check constraint |
| DB-F-04 | Transaksi | Unit of work per use case; `SET LOCAL app.company_id` |
| DB-F-05 | Audit trail | Append-only, hash chain, payload kanonik |
| DB-F-06 | Outbox | Event untuk notifikasi dan integrasi asinkron |
| DB-F-07 | Partisi dan retensi | Metrik, login attempt, job run; rollup dan arsip |
| DB-F-08 | View laporan | Read-only untuk role `osc_report` di replica |
| DB-F-09 | Seed | Permission, role sistem, metrik, template, locale `en` |
| DB-F-10 | Backup dan restore | Dukungan pgBackRest, WAL, uji restore |

## 2. Hak akses database

| User | Hak |
|---|---|
| `osc_migrate` | DDL saat deploy |
| `osc_rest_app` | DML schema domain, tunduk RLS |
| `osc_report` | SELECT view laporan, read-only |
| `osc_backup` | Backup/replikasi, tanpa akses aplikasi |
| `osc_auto` | Tidak punya akses database |
| Agent | Tidak punya akses database |

## 3. Aturan fungsi

- Hanya `osc_rest` yang menulis data domain.
- Setiap transaksi tenant menetapkan `app.company_id` secara lokal.
- Query lintas tenant dilarang, kecuali fungsi platform dengan audit khusus.
- Audit tidak dapat diubah atau dihapus pengguna.
- Rahasia disimpan sebagai referensi vault, bukan nilai mentah.
- Seed harus idempotent dan tidak memuat rahasia.
- Migrasi bersifat forward-only dengan pola expand-contract.

## 4. Pemetaan schema ke modul

| Schema | Modul |
|---|---|
| `core` | AB Identitas |
| `asset` | AC Aset |
| `network` | AD Jaringan |
| `monitor` | AE Monitoring |
| `ops` | AF Container, AH Backup, AI Akses Aman |
| `service` | AJ Layanan |
| `content` | AK Konten |
| `audit` | AL Audit |
| `platform` | AM Platform |

## 5. Checklist

- [ ] Semua tabel tenant memiliki `company_id`.
- [ ] RLS aktif dan `FORCE`.
- [ ] Foreign key komposit mencegah relasi lintas tenant.
- [ ] Audit append-only dan hash chain.
- [ ] Outbox tersedia untuk event asinkron.
- [ ] Partisi dan retensi memiliki job maintenance.
- [ ] Seed idempotent.
- [ ] Backup dan restore diuji.
