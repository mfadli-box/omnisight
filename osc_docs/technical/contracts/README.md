# Kontrak Mesin-Terbaca

Folder ini berisi kontrak yang dapat dibaca mesin, diturunkan dari dokumen 0.6. Tujuannya mencegah implementasi (manusia atau agen AI) menafsirkan izin, error, rute, dan skema secara berbeda dari dokumen.

**Status: disetujui 0.6 (G0, 2026-10-30).** Artefak di sini menjadi acuan implementasi bersama dokumen manusia. Perubahan setelah persetujuan wajib mengikuti [rencana implementasi](../../governance/rencana-implementasi.md) dan memperbarui dokumen sumber, generator, serta UAT terkait pada perubahan yang sama.

## 1. Artefak

| Berkas | Turunan dari | Isi |
|---|---|---|
| [permissions.json](permissions.json) | [matriks izin](../../security/matriks-izin.md), [peta modul](../../product/peta-modul.md) | 13 modul, 76 submodul, 64 kode izin, 7 role sistem, 3 role platform, daftar 20 submodul sensitif, dan self-service |
| [kode-error.json](kode-error.json) | [registry error](../../technical/backend/kode-error.md) | 13 kode global, 14 kode modul, 10 kode field; semua hasil bisnis HTTP 200 |
| [openapi.json](openapi.json) | [kontrak API](../backend/kontrak-api.md), [peta menu](../frontend/peta-menu.md) | OpenAPI 3.1: 144 path, 201 operasi, metadata izin/scope/approval/audit |
| [schema.prisma](schema.prisma) | [skema inti](../database/skema-inti.md), [skema layanan/konten/audit](../database/skema-layanan-konten-audit.md) | Fondasi 34 model untuk schema `core`, `audit`, `platform` |
| [locales/backend](locales/backend/) | [kode error](../../technical/backend/kode-error.md), ADR-013 | Katalog pesan backend `en`/`id` (37 kunci) |
| [locales/frontend](locales/frontend/) | [spesifikasi UI](../frontend/spesifikasi-ui.md), ADR-013 | Katalog label frontend `en`/`id` (105 kunci) |
| [validate_contracts.py](validate_contracts.py) | — | Pemeriksa konsistensi seluruh artefak |

Validator dokumen manusia berada di [../../tools/validate_docs.py](../../tools/validate_docs.py).

## 2. Urutan sumber kebenaran

1. Dokumen 0.6 yang disetujui.
2. Kontrak mesin-terbaca di folder ini.
3. Kode implementasi.

Jika dokumen berubah, kontrak wajib diperbarui pada perubahan yang sama. Jika kontrak dan dokumen berbeda, anggap itu bug, bukan pilihan implementasi.

## 3. Cara membuat ulang

Generator ada di `osc_docs/tools/` dan memakai path relatif terhadap repositori:

```bash
python3 osc_docs/tools/build_permissions.py
python3 osc_docs/tools/build_errors.py
python3 osc_docs/tools/build_locales.py
python3 osc_docs/tools/build_openapi.py
python3 osc_docs/technical/contracts/validate_contracts.py
python3 osc_docs/tools/validate_docs.py
```

Generator menolak data yang tidak lengkap (misalnya jumlah submodul bukan 76 atau paritas locale gagal). Jangan mengedit JSON secara manual tanpa memperbarui generator; hasil berikutnya akan menimpa perubahan itu.

## 4. Aturan izin

- Format izin: `<module>:read|post` atau `<submodule>:read|post`.
- `post` mencakup `read`.
- Hanya 20 submodul yang memakai izin submodul; daftarnya ada di `sensitive_submodules`. Untuk submodul lain, izin modul berlaku.
- Submodul sensitif tetap dapat memakai izin modul bila tidak terdaftar, tetapi approval dan audit mengikuti [`permissions.json`](permissions.json).
- Scope: `global`, `company`, `area`, `self`, `public`, `user`, `internal`. Area mencakup turunan; data di luar scope dijawab sebagai tidak ditemukan.
- Approval tidak boleh self-approval. Level: `none`, `policy`, `required`, `dual_control`.

## 5. Aturan kode error

- Hasil bisnis selalu HTTP 200 dengan envelope `ok/code/message/data/meta/errors`.
- Tidak ada 403. Tidak ada 5xx aplikasi.
- Format global: `AA00-00-xxxx`. Format modul: `<modul>-<submenu>-<nomor>`, misalnya `AC-04-2001`.
- Kode tidak diterjemahkan; hanya pesan yang mengikuti locale.
- Setiap kode baru wajib masuk `kode-error.json`, katalog backend `en`/`id`, dan registry dokumen.
- Satu-satunya pengecualian status HTTP nyata adalah `/internal/healthz` dan `/internal/metrics` di jaringan internal.

## 6. Batas artefak ini

- `openapi.json` adalah kontrak tingkat rute. Banyak body/response masih memakai `GenericObject`; detail field menyusul saat WP terkait.
- `schema.prisma` hanya memuat `core`, `audit`, dan `platform`. Schema domain lain ditambahkan pada WP-02 dan seterusnya.
- RLS, grant, foreign key komposit, unique parsial, partisi `login_attempts`, CHECK, trigger, dan fungsi hash chain **tidak** dimodelkan di Prisma; semuanya wajib ada di migrasi SQL.
- Prisma Client tidak dipakai runtime. `osc_rest` memakai SQLx.
- Contoh di dokumen dan kontrak memakai placeholder; tidak boleh memuat data pribadi, kata sandi, token, atau kredensial nyata.

## 7. Checklist perubahan kontrak

- [ ] Dokumen sumber diperbarui lebih dahulu.
- [ ] Generator diperbarui, bukan JSON hasilnya secara langsung.
- [ ] `permissions.json` dan `openapi.json` sepakat soal izin, scope, dan approval.
- [ ] Setiap kode error baru punya pesan `en` dan `id`.
- [ ] `validate_contracts.py` dan `validate_docs.py` lulus.
- [ ] UAT terkait diperbarui bila perilaku berubah.
