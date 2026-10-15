# Osc_base — `prisma/schema/cluster_amm.prisma`

> Dokumen detail cluster **AMM** — Asset Management (`amm_*`).
> 🔗 Kembali ke [database/README.md](README.md) ·
>
> ✅ **Status: sudah dibangun.** Seluruh 45 model cluster `amm_*` telah terpasang di `prisma/schema/cluster_amm.prisma` beserta migrasinya. Catatan "rencana/belum dibangun" di bawah bersifat historis.
> Data contoh & pemetaan field: [planning/additional.md](../planning/additional.md).

## 1. Ringkasan

Cluster AMM menyimpan **aset/lokasi (store)** beserta perangkat yang menempel
padanya: perangkat POS, digital signage, akun toko, dan mesin EDC. Satu baris
`amm_asset` = satu lokasi; tabel anak berelasi ke aset dengan
`onDelete: Cascade`.

## 2. Model

### 2.1 `amm_asset_type` — Jenis Aset
- `@@unique([company_id, code])`; `category` opsional; `is_active` soft state.
- Induk opsional bagi `amm_asset.type_id`.

### 2.2 `amm_asset` — Aset/Lokasi (Store)
- `@@unique([company_id, code])` (mis. `BAT0141`); indeks `company_id`,
  `area_id`, `type_id`.
- Identitas: `name`, `ip_address`, `notes`, `phone_type`, `phone_number`,
  `phone_imei`.
- Status: `is_active` (`status=1`) dan `rent_status` (`status_sewa=1`).
- Terhubung ke company/area via string `company_id`/`area_id` (pola `app_user`).

### 2.3 `amm_asset_tag` — Label Aset
- `@@unique([asset_id, tag])`; `onDelete: Cascade` dari `amm_asset`.

### 2.4 `amm_asset_device` — Perangkat POS
- `role` ∈ `SERVER | CASHIER1 | CASHIER2 | ...`; `@@unique([asset_id, role])`.
- Kolom: `pos_model`, `ram`, `printer_model`, `year`, `serial`, `detail`.

### 2.5 `amm_digital_signage` — Perangkat Signage
- `device_type` ∈ `PC | TV`; `position` untuk TV.
- `@@unique([asset_id, device_type, position])`; kolom `brand`, `serial`, `detail`.

### 2.6 `amm_store_account` — Akun Toko
- `account_type` (GRAB/GMAIL/SHOPEE/GOBIZ/…), `username`, `phone`, `sid`, `mid`.
- `password_enc` menyimpan **kredensial terenkripsi** (bukan plaintext).
- `external_id`/`external_uuid` memetakan identitas dari sumber.

### 2.7 `amm_store_edc` — Mesin EDC
- `bank`, `edc_type`, `connect_with`, `connect_to`, `mid`, `tid`.

### 2.8 Rencana — CMDB & Aset Lanjutan

Modul `AMM` diproyeksikan menjadi **manajemen aset penuh + CMDB ringan** (lihat
[../planning/app_amm.md](../planning/app_amm.md)). Model tambahan (**sudah dibangun**):

| Model | Isi pokok |
|---|---|
| `amm_manufacturer` | Produsen terpusat (normalisasi `vendor`). |
| `amm_asset_model` | **MAJOR** — Pengelompokan manufacturer+model; membawa category/fieldset/depreciation. |
| `amm_department` | Departemen/unit organisasi. |
| `amm_status_type` / `amm_status_label` | Status lifecycle configurable (bukan fixed enum). |
| `amm_fieldset` / `amm_fieldset_field` / `amm_fieldset_binding` | **MAJOR** — Grup custom fields reusable terikat ke model/aset. |
| `amm_asset_audit` / `amm_audit_item` | **MAJOR** — Asset audit/annual inventory + item scan. |
| `amm_depreciation` | **MAJOR** — Depresiasi & EOL (metode, nilai buku, umur manfaat). |
| `amm_asset` (perluas) | `status_label_id`, `asset_model_id`, `department_id`, `manufacturer_id`, `acquired_at`, `warranty_until`, `vendor`, `serial`, `qr_token` (unik), `latitude`/`longitude`, `is_requestable`, `purchase_date`, `purchase_cost`, `order_number`. |
| `amm_asset_assignment` | Penugasan/mutasi aset (diperluas dengan department, email_notified, alasan). |
| `amm_asset_relation` | Relasi CMDB (HOSTS/RUNS_ON/DEPENDS_ON/CONNECTS_TO/MEMBER_OF/PART_OF/ATTACHED_TO). |
| `amm_license` / `amm_license_seat` | Lisensi (seat, expiry) + penugasan seat. |
| `amm_software` | Software terpasang per aset. |
| `amm_maintenance` | Garansi/servis/kalibrasi (jadwal + riwayat), supplier_id. |
| `amm_custom_field` / `amm_custom_value` | Definisi custom field per target + nilai (termasuk `fieldset_id`). |
| `amm_supplier` / `amm_contract` / `amm_contract_asset` | Pemasok, kontrak (purchase/warranty/support/lease/service) + tautan ke aset. |
| `amm_consumable` / `amm_consumable_txn` | Stok barang habis pakai + mutasi (IN/OUT/ADJUST). |
| `amm_accessory` / `amm_accessory_assignment` / `amm_accessory_txn` | Accessories terpisah vs consumables + penugasan/mutasi. |
| `amm_component` / `amm_component_assignment` | Komponen/parts terpasang pada aset + riwayat. |
| `amm_kit` / `amm_kit_item` / `amm_kit_checkout` | Predefined bundles + checkout/checkin kit. |
| `amm_reservation` | Reservations/bookings aset masa depan. |
| `amm_eula` / `amm_eula_acceptance` | EULA on checkout + penerimaan (audit). |
| `amm_asset_request` | Permintaan/mutasi aset + approval (`APP04`), diperluas (user-facing, audit trail). |
| `amm_api_token` / `amm_api_log` | Scoped API tokens + audit calls. |

## 3. Relasi Inti

```text
amm_manufacturer (1) ──► (N) amm_asset_model
amm_asset_type (1) ──► (N) amm_asset
amm_asset_type (1) ──► (N) amm_asset_model
amm_asset_model (1) ──► (N) amm_asset
amm_asset_model (1) ──► (N) amm_fieldset_binding
amm_department (1) ──► (N) amm_asset
amm_status_type (1) ──► (N) amm_status_label
amm_status_label (1) ──► (N) amm_asset
amm_fieldset (1) ──► (N) amm_fieldset_field
amm_fieldset (1) ──► (N) amm_fieldset_binding
amm_custom_field (1) ──► (N) amm_fieldset_field
amm_custom_field (1) ──► (N) amm_custom_value
amm_asset (1) ──► (N) amm_asset_device
               ├──► (N) amm_digital_signage
               ├──► (N) amm_store_account
               ├──► (N) amm_store_edc
               ├──► (N) amm_asset_tag
               ├──► (N) amm_asset_assignment · amm_maintenance · amm_software
               ├──► (N) amm_asset_relation [source] ◄── (N) [target]
               ├──► (N) amm_custom_value ──► amm_custom_field
               ├──► (N) amm_contract_asset ──► amm_contract ──► amm_supplier
               ├──► (N) amm_consumable_txn ──► amm_consumable
               ├──► (N) amm_accessory_assignment · amm_accessory_txn
               ├──► (N) amm_component · amm_component_assignment
               ├──► (N) amm_audit_item
               ├──► (N) amm_reservation
               ├──► (N) amm_license_seat ──► amm_license
amm_supplier (1) ──► (N) amm_consumable · amm_accessory
amm_consumable (1) ──► (N) amm_consumable_txn
amm_accessory (1) ──► (N) amm_accessory_assignment · amm_accessory_txn
amm_component (1) ──► (N) amm_component_assignment
amm_kit (1) ──► (N) amm_kit_item · amm_kit_checkout
amm_asset_audit (1) ──► (N) amm_audit_item
amm_depreciation (1) ──► (N) amm_asset_model · amm_asset (opsional)
amm_eula (1) ──► (N) amm_eula_acceptance
amm_asset_request ──► amm_asset · amm_accessory · amm_kit (opsional)
amm_api_token (1) ──► (N) amm_api_log
```

## 4. Catatan

- Semua tabel anak `onDelete: Cascade` dari `amm_asset` (relasi CMDB, fieldset
  bindings dinormalisasi; dibersihkan eksplisit sesuai kebutuhan). `amm_reservation`/
  `amm_eula_acceptance`/`amm_audit_item` dapat mempertahankan audit trail.
- Kolom kredensial **wajib** dienkripsi sebelum disimpan (`password_enc`).
- Export Excel massal (store aktif, 3 sheet) direncanakan di
  [planning/additional.md §6](../planning/additional.md#62-export-excel-3-sheet--bisa-keputusan-backend-excelize).
- Model berikut **sudah dibangun** (lengkap sesuai audit Snipe-IT/GLPI): 
  `amm_manufacturer`, `amm_asset_model`, `amm_department`, `amm_status_type`, 
  `amm_status_label`, `amm_fieldset`, `amm_fieldset_field`, `amm_fieldset_binding`, 
  `amm_asset_audit`, `amm_audit_item`, `amm_depreciation`, `amm_asset_assignment` 
  (diperluas), `amm_asset_relation`, `amm_license*`, `amm_software`, `amm_maintenance`, 
  `amm_custom_field*`, `amm_supplier`, `amm_contract*`, `amm_consumable*`, 
  `amm_accessory*`, `amm_component*`, `amm_kit*`, `amm_reservation`, `amm_eula*`, 
  `amm_asset_request` (diperluas), `amm_api_token*` — rincian 
  [../planning/app_amm.md](../planning/app_amm.md).
- Konvensi umum model: lihat [README.md](README.md#4-konvensi-model).
