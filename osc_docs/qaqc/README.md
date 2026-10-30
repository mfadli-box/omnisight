# QA/QC OmniSight

Status: Disetujui (0.6)

Folder ini menjadi rumah untuk dokumentasi Quality Assurance dan Quality Control, termasuk dokumen fungsi, alur data, dan UAT yang menjadi dasar penyusunan test case.

## 1. Struktur

| Kelompok | Dokumen | Isi |
|---|---|---|
| Unit test | [unit-test/README.md](unit-test/README.md) | Strategi unit test per peran |
| Fungsi | [function/README.md](function/README.md) | Katalog fungsi per peran |
| Alur data | [data-flow/README.md](data-flow/README.md) | Alur dan batas data per peran |
| Penerimaan | [acceptance/README.md](acceptance/README.md) | UAT, kriteria lulus, dan bukti per modul |

### Unit test

| Peran | Dokumen |
|---|---|
| Agent | [unit-test/agent/README.md](unit-test/agent/README.md) |
| Database | [unit-test/database/README.md](unit-test/database/README.md) |
| Backend | [unit-test/backend/README.md](unit-test/backend/README.md) |
| Frontend | [unit-test/frontend/README.md](unit-test/frontend/README.md) |

### Fungsi

| Peran | Dokumen |
|---|---|
| Agent | [function/agent/README.md](function/agent/README.md) |
| Database | [function/database/README.md](function/database/README.md) |
| Backend | [function/backend/README.md](function/backend/README.md) |
| Frontend | [function/frontend/README.md](function/frontend/README.md) |

### Penerimaan (UAT)

| Modul | Dokumen |
|---|---|
| Indeks dan skenario global | [acceptance/README.md](acceptance/README.md) |
| AA Dashboard | [acceptance/aa-dashboard.md](acceptance/aa-dashboard.md) |
| AB Identitas | [acceptance/ab-identity.md](acceptance/ab-identity.md) |
| AC Aset | [acceptance/ac-assets.md](acceptance/ac-assets.md) |
| AD Jaringan | [acceptance/ad-network.md](acceptance/ad-network.md) |
| AE Monitoring | [acceptance/ae-monitoring.md](acceptance/ae-monitoring.md) |
| AF Container | [acceptance/af-containers.md](acceptance/af-containers.md) |
| AG Edge | [acceptance/ag-edge.md](acceptance/ag-edge.md) |
| AH Backup | [acceptance/ah-backup.md](acceptance/ah-backup.md) |
| AI Akses Aman | [acceptance/ai-access.md](acceptance/ai-access.md) |
| AJ Layanan | [acceptance/aj-service-desk.md](acceptance/aj-service-desk.md) |
| AK Konten | [acceptance/ak-content.md](acceptance/ak-content.md) |
| AL Audit | [acceptance/al-audit.md](acceptance/al-audit.md) |
| AM Platform | [acceptance/am-platform.md](acceptance/am-platform.md) |

### Alur data

| Peran | Dokumen |
|---|---|
| Agent | [data-flow/agent/README.md](data-flow/agent/README.md) |
| Database | [data-flow/database/README.md](data-flow/database/README.md) |
| Backend | [data-flow/backend/README.md](data-flow/backend/README.md) |
| Frontend | [data-flow/frontend/README.md](data-flow/frontend/README.md) |

## 2. Ruang lingkup QA/QC

- Unit test untuk logika murni dan kontrak internal.
- Integration test untuk database, HTTP eksternal, dan filesystem.
- E2E untuk alur kritis: login, ganti perusahaan, aset, deploy, approval, audit.
- Accessibility, security, performance, dan regression test.
- Bukti rilis: hasil tes, cakupan, dan temuan yang ditutup.
- UAT per modul: alur pengguna, izin, scope, approval, dan bukti audit.

Dokumen fungsi dan alur data dipakai untuk menurunkan kasus uji, batas data, dan skenario kegagalan. Dokumen UAT dipakai untuk membuktikan alur pengguna dan kriteria rilis per modul.

## 3. Aturan

- Unit test tidak memakai layanan nyata, data produksi, atau rahasia.
- Data uji sintetis dan mencakup minimal dua perusahaan/area.
- Setiap bug produksi mendapat tes regresi.
- Tes flaky diperbaiki, bukan diabaikan.
- Hasil tes disimpan sebagai artefak CI.
- Cakupan bukan tujuan akhir; jalur kritis dan kasus negatif diutamakan.

## 4. Dokumen terkait

- [Matriks izin](../security/matriks-izin.md)
- [Keamanan](../security/README.md)
- [Operasi](../operations/README.md)
- [Alert dan eskalasi](../operations/alert-dan-eskalasi.md)
- [CI/CD dan gerbang rilis](../operations/ci-cd.md)
- [Spesifikasi UI](../technical/frontend/spesifikasi-ui.md)
- [Panduan pengguna](../product/panduan-pengguna.md)
- [Registry kode error](../technical/backend/kode-error.md)
- [Glosarium](../product/glosarium.md)
- [Tata kelola](../governance/README.md)
- [Kontrak API](../technical/backend/kontrak-api.md)
