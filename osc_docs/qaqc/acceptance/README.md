# UAT dan Kriteria Penerimaan

Status: Disetujui (0.6)

Dokumen ini menetapkan cara menyatakan sebuah modul lulus sebelum rilis. Unit test dan integration test membuktikan kode; UAT membuktikan alur pengguna, izin, scope, dan bukti audit di lingkungan staging.

## 1. Hubungan dengan dokumen lain

| Dokumen | Peran |
|---|---|
| [Fungsi per peran](../function/README.md) | Dasar skenario dan kode fungsi |
| [Alur data per peran](../data-flow/README.md) | Batas data, kegagalan, dan pemulihan |
| [Matriks izin](../../security/matriks-izin.md) | Kode izin, scope, approval, dan self-service |
| [Peta modul](../../product/peta-modul.md) | Menu, submodul, dan rute |
| [Kontrak API](../../technical/backend/kontrak-api.md) | Envelope dan kode error yang diharapkan |
| [Operasi](../../operations/README.md) | Lingkungan staging dan data tersamarkan |

## 2. Lingkungan dan data uji

- Lingkungan staging dengan konfigurasi menyerupai produksi.
- Data sintetis minimal dua perusahaan, dua area per perusahaan, dan satu area anak.
- Akun uji untuk setiap peran: `platform_owner`, `platform_support`, `platform_security`, `company_admin`, `area_manager`, `noc_operator`, `field_technician`, `viewer`, `auditor`, dan `requester`.
- MFA aktif untuk seluruh akun admin dan platform.
- Integrasi eksternal memakai stub atau wiremock, kecuali skenario integrasi nyata yang disetujui.
- Tidak memakai data pribadi, password, token, atau rahasia produksi.

## 3. Konvensi

| Butir | Aturan |
|---|---|
| ID global | `UAT-G-nn` |
| ID modul | `UAT-<modul>-nn`, misalnya `UAT-AC-04` |
| Status | `Belum`, `Lulus`, `Gagal`, `Diblokir`, `Tidak berlaku` |
| Severity | S1 data bocor atau hilang, S2 kontrol keamanan gagal, S3 fungsi utama gagal, S4 kosmetik |
| Bukti | Screenshot, `request_id`, ID audit, log, hasil ekspor, rekaman sesi |
| Aturan | Satu skenario menghasilkan satu status; jangan menggabungkan beberapa hasil |

## 4. Skenario global

Skenario berikut wajib dijalankan pada setiap modul, kecuali dinyatakan tidak berlaku.

| ID | Skenario | Langkah ringkas | Hasil yang diharapkan |
|---|---|---|---|
| UAT-G-01 | Menu dan API mengikuti izin | Login tanpa izin modul; buka menu; panggil endpoint langsung | Menu tidak terlihat; endpoint membalas HTTP 200 `AA00-00-0003`; penolakan tercatat di audit |
| UAT-G-02 | Isolasi lintas perusahaan | Ganti ID resource ke resource perusahaan lain | HTTP 200 `AA00-00-0004`; tidak ada data, jumlah, atau nama yang bocor |
| UAT-G-03 | Scope area | Akses area sendiri, area anak, dan area saudara | Area sendiri dan anak berhasil; area saudara `AA00-00-0004` |
| UAT-G-04 | Aksi sensitif dan approval | Jalankan aksi sensitif tanpa approval; coba self-approval; ulangi dengan approver lain dan MFA | Tanpa approval ditolak; self-approval ditolak; setelah approval dan MFA berhasil; audit memuat before/after |
| UAT-G-05 | Audit lengkap | Lakukan create, update, dan delete | Setiap perubahan memiliki aktor, tenant, area, `request_id`, before/after, dan hasil |
| UAT-G-06 | Tanpa 403 dan 5xx | Jalankan skenario negatif, validasi gagal, dan integrasi mati | Semua respons bisnis HTTP 200 dengan envelope; tidak ada 403 atau 5xx; health internal dikecualikan |
| UAT-G-07 | Dual bahasa | Ganti bahasa `en` dan `id` pada halaman dan respons error | Label dan pesan berubah; kode error dan kode modul tetap; kunci hilang jatuh ke `en` |
| UAT-G-08 | Rahasia dan data pribadi | Periksa UI, log, audit, ekspor, dan pesan error | Tidak ada password, token, kunci, private key, environment, atau data pribadi |
| UAT-G-09 | Idempotency | Kirim aksi eksternal dua kali dengan key sama; ubah payload dengan key sama | Eksekusi hanya sekali; key bentrok membalas `AA00-00-0007` |
| UAT-G-10 | CSRF dan rate limit | POST tanpa CSRF; kirim burst request | Tanpa CSRF `AA00-00-0010`; burst `AA00-00-0006`; tidak ada 5xx |
| UAT-G-11 | Perubahan izin dan sesi | Ubah role; nonaktifkan pengguna; lanjutkan request | Perubahan berlaku pada request berikutnya; sesi pengguna nonaktif dicabut |

## 5. Kriteria masuk

- Build staging berasal dari commit yang diuji dan migrasi berhasil.
- Seed sintetis dan akun semua peran tersedia.
- OpenAPI dan katalog `en`/`id` sesuai build.
- Tidak ada bug S1 atau S2 terbuka.

## 6. Kriteria keluar

- Seluruh `UAT-G` dan seluruh skenario modul berstatus `Lulus`.
- Tidak ada S1 atau S2 terbuka; S3 ditutup atau risiko disetujui pemilik produk dan keamanan.
- Bukti tersimpan dan dapat ditelusuri ke `request_id` serta audit event.
- Aksesibilitas dasar lulus dan paritas kunci `en`/`id` terpenuhi.
- Ditandatangani QA, pemilik modul, dan pemilik keamanan.

## 7. Severity dan no-go

| Severity | Contoh | Keputusan rilis |
|---|---|---|
| S1 | Data lintas tenant bocor, rahasia terekspos, audit hilang | No-go |
| S2 | Approval bisa dilewati, self-approval berhasil, 403/5xx muncul | No-go |
| S3 | Fungsi utama modul gagal tanpa workaround | No-go sampai diperbaiki |
| S4 | Teks, tata letak, atau kasus tepi kecil | Boleh rilis dengan catatan |

## 8. Daftar modul

| Modul | Dokumen |
|---|---|
| AA Dashboard | [aa-dashboard.md](aa-dashboard.md) |
| AB Identitas | [ab-identity.md](ab-identity.md) |
| AC Aset | [ac-assets.md](ac-assets.md) |
| AD Jaringan | [ad-network.md](ad-network.md) |
| AE Monitoring | [ae-monitoring.md](ae-monitoring.md) |
| AF Container | [af-containers.md](af-containers.md) |
| AG Edge | [ag-edge.md](ag-edge.md) |
| AH Backup | [ah-backup.md](ah-backup.md) |
| AI Akses Aman | [ai-access.md](ai-access.md) |
| AJ Layanan | [aj-service-desk.md](aj-service-desk.md) |
| AK Konten | [ak-content.md](ak-content.md) |
| AL Audit | [al-audit.md](al-audit.md) |
| AM Platform | [am-platform.md](am-platform.md) |

## 9. Checklist

- [ ] Semua peran memiliki akun uji dan MFA.
- [ ] Data uji mencakup dua perusahaan, area anak, dan area saudara.
- [ ] Skenario global dijalankan pada setiap modul.
- [ ] Setiap skenario memiliki bukti dan status.
- [ ] Tidak ada temuan S1 atau S2.
- [ ] Audit event ditemukan untuk setiap perubahan.
- [ ] Paritas kunci `en`/`id` lulus.
