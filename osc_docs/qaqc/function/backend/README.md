# Fungsi Backend

Status: Disetujui (0.6)

Backend Rust `osc_rest` adalah satu-satunya pintu tulis database domain dan pintu utama frontend, agent, serta `osc_auto`. Backend menegakkan autentikasi, otorisasi, audit, dan kontrak API.

## 1. Katalog fungsi

| Kode | Fungsi | Penjelasan |
|---|---|---|
| BE-F-01 | Login lokal | Argon2id, rate limit, lockout, pesan generik |
| BE-F-02 | Login HRIS | POST/GET, mapping sukses/gagal, timeout, fallback kebijakan |
| BE-F-03 | MFA dan sesi | Enroll, verify, refresh rotation, cabut sesi |
| BE-F-04 | Ganti konteks | Validasi membership dan area, perbarui izin/scope |
| BE-F-05 | Otorisasi | `read`/`post`, izin submenu sensitif, scope perusahaan/area |
| BE-F-06 | Use case domain | CRUD dan aksi sesuai modul |
| BE-F-07 | Approval | Rencana, diff, risiko, setujui/tolak, rollback |
| BE-F-08 | Idempotency | Cegah eksekusi ganda aksi eksternal |
| BE-F-09 | Audit | Aktor, waktu, before/after, request id, redaksi |
| BE-F-10 | Adapter integrasi | HRIS, RouterOS, Docker/Podman, Wazuh, NetBox, GLPI, dll. |
| BE-F-11 | API internal | Untuk `osc_auto` dan agent; mTLS dan scope terbatas |
| BE-F-12 | Lokalisasi | `Accept-Language`, katalog `en`/`id`, fallback `en` |
| BE-F-13 | OpenAPI | Kontrak sumber untuk klien TypeScript |
| BE-F-14 | Health dan observability | Log, metrik, trace, request id |

## 2. Tanggung jawab lapisan

| Lapisan | Tanggung jawab |
|---|---|
| `osc_api` | Handler, DTO, middleware, OpenAPI, composition root |
| `osc_application` | Use case, command/query, port, policy |
| `osc_domain` | Entity, value object, aturan bisnis, error domain |
| `osc_adapters` | PostgreSQL, HRIS, RouterOS, container, storage, vault, mail |

## 3. Aturan

- Tidak ada akses database langsung dari handler.
- Domain tidak bergantung pada Axum, SQLx, atau HTTP.
- Semua hasil bisnis memakai envelope HTTP 200; tidak ada 403/5xx aplikasi.
- Penolakan akses memakai `AA00-00-0003` dan dicatat.
- Aksi sensitif memerlukan approval dan idempotency.
- Pesan error tidak membocorkan detail internal.
- Setiap perubahan data tenant menetapkan konteks perusahaan/area.

## 4. Pemetaan modul

| Modul | Fungsi backend utama |
|---|---|
| AA Dashboard | Agregasi sesuai scope, tugas saya |
| AB Identitas | Login, pengguna, role, HRIS, sesi |
| AC Aset | Aset, penempatan, check-out/in, laporan |
| AD Jaringan | IPAM, perangkat, firewall, RouterOS |
| AE Monitoring | Host, metrik, alert, insiden, integrasi |
| AF Container | Stack, deploy, rollback, maintenance |
| AG Edge | Domain, sertifikat, proxy, edge node |
| AH Backup | Sumber, jadwal, snapshot, restore, verifikasi |
| AI Akses Aman | Target, permintaan, sesi, kebijakan |
| AJ Layanan | Tiket, SLA, kontrak, knowledge base |
| AK Konten | Artikel, template, notifikasi, preferensi |
| AL Audit | Audit trail, login, keamanan, retensi |
| AM Platform | Integrasi, kredensial, webhook, feature flag |

## 5. Checklist

- [ ] Setiap endpoint memiliki izin.
- [ ] Tenant dan area divalidasi server.
- [ ] Aksi sensitif memiliki approval dan audit.
- [ ] Error memakai kode stabil dan pesan terlokalisasi.
- [ ] Adapter memiliki timeout, retry, dan circuit breaker.
- [ ] OpenAPI diperbarui.
- [ ] Health internal tidak diekspos publik.
