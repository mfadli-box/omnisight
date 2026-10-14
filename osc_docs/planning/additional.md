# Additional — Data Aset Lokasi (Store) yang Harus Diinput

> Data tambahan yang perlu dimasukkan ke platform, dipetakan ke aplikasi
> `AMM` (Asset Management). Lihat [roadmap Fase 2](roadmap.md#fase-2--manajemen-aset--inventaris-rencana).

## 1. Ringkasan

Satu **lokasi aset (store)** dengan kode `BAT0141`. Data terbagi menjadi lima
kelompok:

| Kelompok | Sumber kolom | Usulan model |
|---|---|---|
| Identitas lokasi | `code`, `company_area`, `name`, `ip`, `notes`, `status`, `phone_*`, `status_sewa` | `amm_asset` |
| Perangkat POS | `ss_*`, `c1_*`, `c2_*` | `amm_asset_device` (per `role`) |
| Digital Signage | `ds_*` | `amm_digital_signage` |
| Akun toko | `list_store_account` | `amm_store_account` |
| Mesin EDC | `list_store_edc` | `amm_store_edc` |

Keterangan prefix: `ss` = Store Server, `c1` = Cashier 1, `c2` = Cashier 2,
`ds` = Digital Signage.

> **Keamanan:** kolom `password` pada `list_store_account` adalah kredensial
> dan **disamarkan** (tidak ditulis apa adanya). Nilai asli disimpan di sumber
> aman / diisi lewat mekanisme terenkripsi saat input, bukan di dalam repo.

## 2. Pemetaan Field → Kolom Model (usulan)

### 2.1 `amm_asset` — Identitas Lokasi

| Field sumber | Kolom usulan | Tipe | Catatan |
|---|---|---|---|
| `code` | `code` | string | unik, mis. `BAT0141` |
| `company_area` | `company_id` + `area_id` | relasi | `CKU-BAT` → company `CKU`, area `BAT` |
| `name` | `name` | string | `CK TANJUNG PANTUN 2` |
| `ip` | `ip_address` | string? | `172.18.22.33` |
| `notes` | `notes` | string? | `-` → null |
| `status` | `is_active` | bool | `1` → aktif |
| `status_sewa` | `rent_status` | int/bool | `1` → sewa aktif |
| `phone_type` | `phone_type` | string? | |
| `phone_number` | `phone_number` | string? | |
| `phone_imei` | `phone_imei` | string? | |

### 2.2 `amm_asset_device` — Perangkat POS

| Field sumber | Kolom usulan | Tipe | Catatan |
|---|---|---|---|
| prefix (`ss`/`c1`/`c2`) | `role` | enum | `SERVER` / `CASHIER1` / `CASHIER2` |
| `*_pos` | `pos_model` | string | |
| `*_ram` | `ram` | string | |
| `*_printer` | `printer_model` | string | |
| `*_year` | `year` | int | |
| `*_detail` | `detail` | string | OS/CPU/HDD/SN |

### 2.3 `amm_digital_signage`

| Field sumber | Kolom usulan | Tipe |
|---|---|---|
| `ds_pc` | `pc_brand` | string |
| `ds_pc_sn` | `pc_serial` | string |
| `ds_tv1..3` | `tv_brand` (baris per TV) | string |
| `ds_tv1..3_sn` | `tv_serial` | string |
| `ds_detail` | `detail` | string? |

### 2.4 `amm_store_account` — Akun Toko

| Kolom sumber | Kolom usulan | Tipe | Catatan |
|---|---|---|---|
| `id` | `external_id` | string | UUID sumber |
| `store` | `asset_code` | string | relasi ke `amm_asset.code` |
| `type` | `account_type` | string | GRAB MERCHANT / GMAIL / SHOPEE FOOD / GOBIZ |
| `username` | `username` | string? | |
| `password` | `password_enc` | string? | **terenkripsi**, bukan plaintext |
| `hp` | `phone` | string? | |
| `sid` | `sid` | string? | |
| `mid` | `mid` | string? | |
| `uuid` | `external_uuid` | string? | |

### 2.5 `amm_store_edc` — Mesin EDC

| Kolom sumber | Kolom usulan | Tipe |
|---|---|---|
| `store` | `asset_code` | string |
| `bank` | `bank` | string |
| `type` | `edc_type` | string |
| `connect_with` | `connect_with` | string? |
| `connect_to` | `connect_to` | string? |
| `mid` | `mid` | string |
| `tid` | `tid` | string |

## 3. Data Mentah

### 3.1 Identitas Lokasi

| Field | Nilai |
|---|---|
| code | `XXX0000` |
| company_area | `COM-XXX` |
| name | `STORE` |
| ip | `000.000.000.000` |
| notes | `-` |
| status | `1` |
| status_sewa | `1` |
| phone_type | `Samsung` |
| phone_number | `000 0000 0000` |
| phone_imei | `0000 0000 0000 000` |

### 3.2 Perangkat POS

| role | pos | ram | printer | year | detail |
|---|---|---|---|---|---|
| SERVER (`ss`) | Lenovo | 8 GB | HP | 2026 | WINDOWS |
| CASHIER1 (`c1`) | Lenovo | 8 GB | Citizen | 2025 | WINDOWS |
| CASHIER2 (`c2`) | HP | 8 GB | Citizen | 2013 | WINDOWS |

### 3.3 Digital Signage

| item | brand | serial |
|---|---|---|
| PC | BMax | `0000X000000000` |
| TV1 | Aqua | `XX0XX0X00000XX00X0000` |
| TV2 | Aqua | `XX0XX0X00000XX0X0000` |
| TV3 | Aqua | `XX0XX0X00000XX0X0` |

`ds_detail`: `-`

### 3.4 Akun Toko (`list_store_account`)

| id | store | type | username | password | hp | sid | mid | uuid |
|---|---|---|---|---|---|---|---|---|
| `F920B3E5-EADF-4D41-A10B-02233898E310` | XXX0000 | GRAB | test@comp.com | «sensitif: 4 varian» | NULL | NULL | NULL | NULL |
| `BE2D91DF-9921-4E8B-94C7-09FAF01DF5D7` | XXX0000 | GMAIL | test@comp.com | «sensitif» | NULL | NULL | NULL | NULL |
| `9644EB1F-9B73-404B-9ABE-1ADC7CF62A2B` | XXX0000 | SHOPEE | `test1:a00a0a` | «sensitif» | NULL | NULL | NULL | NULL |
| `42D4D2E3-1080-4D79-995A-B6DB0D6FD397` | XXX0000 | GOBIZ | NULL | NULL | 00 000 0000 00 | `A000000000` | `000000000` | `51826db4-e69a-401c-a4d0-90ed908e9b47` |

### 3.5 Mesin EDC (`list_store_edc`)

| store | bank | type | connect_with | connect_to | mid | tid |
|---|---|---|---|---|---|---|
| XXX0000 | MDR | Move/2500 | H2H | NULL | `00000000000` | `00000000` |
| XXX0000 | BCA | Move/2500 | LAN | CASHIER 1 | `000000` | `XX000000` |

## 4. Catatan Normalisasi

- `status = 1` → `is_active = true`; `status_sewa = 1` → sewa aktif.
- `NULL` / `-` → `null` (bukan string kosong).
- `company_area = COM-XXX` perlu dipecah ke company & area; pastikan company
  `COM` dan area `XXX` sudah ada di `app_company` / `app_company_area`.
- `ss_detail` memuat SN perangkat (`SN = GM100218`) → pertimbangkan kolom
  `serial` terpisah saat parsing.
- Nomor telepon/IMEI berisi spasi → simpan ternormalisasi (tanpa spasi) bila
  perlu, tampilkan sesuai format asli.

## 5. Checklist Input

- [ ] Konfirmasi model final (`amm_*`) & migrasi Prisma.
- [ ] Company `COM` + area `XXX` tersedia (atau buat lebih dulu via `APP02`).
- [ ] Import identitas lokasi (`amm_asset`) — 1 baris.
- [ ] Import perangkat POS (`amm_asset_device`) — 3 baris (SERVER + 2 kasir).
- [ ] Import digital signage (`amm_digital_signage`) — 1 baris (4 perangkat).
- [ ] Import akun toko (`amm_store_account`) — 4 baris, password diisi aman.
- [ ] Import EDC (`amm_store_edc`) — 2 baris.
- [ ] Verifikasi hasil import + dokumen `cluster_amm.md`.

## 6. Rancangan Frontend (Satu Halaman) & Export Excel

### 6.1 Satu halaman, banyak tabel — BISA

Lima tabel database dapat disajikan sebagai **satu halaman AMM** (pola yang
sama dipakai `APP02` company → modules/areas dan `APP04` signature →
steps/signers/forms/flags). Halaman `AMM01` (Store Asset) dengan tab:

| Tab | Tabel | Komponen usulan |
|---|---|---|
| Lokasi | `amm_asset` | `asset-form` (single record / selector) |
| Perangkat | `amm_asset_device` | `devices-tab` |
| Signage | `amm_digital_signage` | `signage-tab` |
| Akun | `amm_store_account` | `accounts-tab` |
| EDC | `amm_store_edc` | `edc-tab` |

Pola frontend: `page.tsx` menyimpan `selectedAsset`, header menampilkan lokasi
terpilih (mirip APP04), lalu tiap tab adalah `DataTable` ber-filter
`asset_id`. Backend memakai **nested resource**:

```
GET/POST        /rest/pages/AMM/assets
GET/PUT/DELETE  /rest/pages/AMM/assets/:id
...             /rest/pages/AMM/assets/:id/devices
...             /rest/pages/AMM/assets/:id/signage
...             /rest/pages/AMM/assets/:id/accounts
...             /rest/pages/AMM/assets/:id/edc
```

### 6.2 Export Excel 3 sheet — BISA (keputusan: **backend Excelize**)

Keputusan yang sudah ditetapkan:

| Aspek | Keputusan |
|---|---|
| Library | **Backend `github.com/xuri/excelize/v2`** |
| Berkas | **Satu berkas** `amm_assets.xlsx` yang **updateable** (di-*open* ulang lalu diperbarui, bukan menumpuk berkas baru) |
| Cakupan | **Massal** — semua **store aktif** (`amm_asset.is_active = true`, dari `status = 1`) |
| Kolom `password` | **Ikut diekspor** (sesuai keputusan); akses endpoint wajib admin |

Struktur 3 sheet (satu baris per store/akun/EDC):

| Sheet | Baris | Kolom | Sumber |
|---|---|---|---|
| `Aset` | per store aktif | `code, company_area, name, ip, notes, status, status_sewa, phone_type, phone_number, phone_imei, ss_*, c1_*, c2_*, ds_*` | `amm_asset` + `amm_asset_device` + `amm_digital_signage` |
| `Akun Toko` | per akun | `store, type, username, password, hp, sid, mid, uuid` | `amm_store_account` |
| `EDC` | per EDC | `store, bank, type, connect_with, connect_to, mid, tid` | `amm_store_edc` |

Rancangan teknis:

- **Otorisasi (keputusan):** endpoint **dan** pembukaan berkas hanya boleh bila
  privilege modul berlevel **POST**. Gunakan middleware `USLoad()` +
  `USRole("AMM", "POST")` (level `POST` = tertinggi; admin *bypass*).
  Endpoint **tidak** memakai `USLock()` agar user non-admin ber-privilege
  `POST` tetap boleh mengakses.
- **Lokasi berkas:** disimpan di area **backend-only** (bukan di bawah
  `UploadBase`/`/root/files` yang disajikan publik oleh route
  `src/app/files/[...path]/route.ts`), mis. `/root/exports/amm_assets.xlsx`.
  Dengan begitu berkas **tidak** dapat diunduh langsung tanpa melewati
  pemeriksaan privilege.
- Endpoint: `GET /rest/pages/AMM/assets/export`
  (`USLoad(), USRole("AMM", "POST")`).
  1. Bila berkas ada → `excelize.OpenFile`; bila belum → `excelize.NewFile`.
  2. Pastikan 3 sheet (`Aset`, `Akun Toko`, `EDC`) + baris header.
  3. Bersihkan baris data (pertahankan header) lalu tulis ulang data **store
     aktif** — inilah sifat **updateable**: berkas & format manual tetap,
     datanya di-refresh.
  4. Simpan ke `/root/exports/amm_assets.xlsx`, lalu kirim ke klien
     (`c.FileAttachment`) sebagai unduhan.
- Karena berkas dikirim lewat endpoint, **membuka berkas = mengakses endpoint**;
  keduanya tunduk pada pemeriksaan privilege `POST` yang sama. Tidak ada URL
  publik terpisah untuk berkas.
- Tombol **“Export Excel”** diletakkan di header halaman AMM (massal, bukan per
  lokasi).

### 6.3 Keputusan

- [x] Export: **backend `excelize`**.
- [x] Berkas: **satu berkas `amm_assets.xlsx` (updateable)**.
- [x] `password` akun: **ikut diekspor**.
- [x] Cakupan: **massal, store aktif saja**.
- [x] Otorisasi: endpoint & pembukaan berkas **hanya bila privilege modul
      berlevel POST** (`USRole("AMM","POST")`, admin bypass).

> Catatan keamanan: karena `password` ikut diekspor dan akses dibatasi level
> `POST`, berkas disimpan di area backend-only dan hanya dikirim melalui
> endpoint ber-privilege — tidak ada URL publik terpisah.
