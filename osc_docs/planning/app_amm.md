# Planning `AMM` — Asset Management & CMDB (ala GLPI / Snipe-IT / NetBox)

> Rencana modul **`AMM`**: dari **daftar aset/lokasi (store)** menjadi
> **manajemen aset penuh + CMDB ringan** — siklus hidup, penugasan/mutasi,
> **relasi antar-aset**, **lisensi & software**, **garansi/maintenance**,
> **label QR/barcode**, dan **export Excel**. Penyejajar **GLPI**, **Snipe-IT**,
> dan **NetBox** (untuk sisi CMDB/IPAM ringan). Bagian dari
> [Planning](README.md) · Lihat juga [blueprint](blueprint.md),
> [roadmap](roadmap.md), [checklist](checklist.md), data contoh
> [additional.md](additional.md), serta modul terkait [VMS](app_vms.md),
> [NET](app_net.md), [POD](app_pod.md), [PAM](app_pam.md), [SEC](app_sec.md).

## 1. Tujuan & Lingkup

Menjadikan `AMM` sebagai **sumber kebenaran aset** dan penghubung antar-modul:

- **Aset & lokasi** — identitas aset/lokasi (store) + perangkat POS, digital
  signage, akun toko, EDC (`amm_asset` + tabel anak; lihat
  [additional.md](additional.md)).
- **Model aset (Asset Model)** — pengelompokan aset berdasarkan `manufacturer` +
  `model`, membawa `category`, `fieldset`, dan `depreciation` (
  **`amm_asset_model`**).
- **Manufacturers** — entitas produsen terpusat untuk menstandarkan vendor (
  **`amm_manufacturer`**).
- **Fieldsets** — grup reusable kolom kustom terikat ke model (bukan hanya
  `target`), dengan `amm_fieldset`, `amm_fieldset_field`,
  `amm_fieldset_binding`/`amm_custom_value` terikat fieldset.
- **Jenis & tag** — kategori aset (`amm_asset_type`) + label/tag (`amm_asset_tag`).
- **Departments** — unit organisasi terpusat (**`amm_department`**) sebagai
  alternatif/proxy `area_id`.
- **Siklus hidup** — status (AKTIF/NONAKTIF/DISPOSAL/MAINTENANCE/RUSAK),
  tanggal perolehan, masa pakai, audit & depresiasi.
- **Asset audit / annual inventory** — audit berkala, tanggal audit, interval,
  overdue alerts + laporan (**`amm_asset_audit`**, **`amm_audit_item`**).
- **Depreciation & EOL** — atribut depresiasi (metode, nilai perolehan,
  penyusutan, nilai buku, umur manfaat, tanggal EOL), serta alert EOL
  (**`amm_depreciation`**).
- **Penugasan/mutasi** — siapa/lokasi mana memegang aset, riwayat perpindahan
  (`amm_asset_assignment`).
- **Relasi (CMDB)** — dependensi aset↔aset (host↔VM↔container↔service)
  (`amm_asset_relation`) → grafik keterkaitan.
- **Lisensi & software** — daftar lisensi (seat, expiry) dan software terpasang
  (`amm_license`, `amm_license_seat`, `amm_software`).
- **Garansi & maintenance** — jadwal servis/kalibrasi/garansi + riwayat
  (`amm_maintenance`).
- **Custom fields** — kolom tambahan per jenis/fieldset (`amm_custom_field` +
  `amm_custom_value`).
- **Supplier & kontrak** — pemasok + kontrak terkait aset (`amm_supplier`,
  `amm_contract`).
- **Accessories vs consumables** — pemisahan aksesori (dapat dipinjamkan/ditugaskan
  kembali) vs consumables (habis pakai); dukungan `accessory_flag`, `is_accessory`,
  **`amm_accessory`**, **`amm_accessory_assignment`**, **`amm_accessory_txn`**.
- **Components** — suku cadang terpasang pada aset (`amm_component`,
  `amm_component_assignment`).
- **Kits** — bundel predefinisi untuk checkout cepat (**`amm_kit`**,
  **`amm_kit_item`**, **`amm_kit_checkout`**).
- **Reservations/bookings** — reservasi aset di masa depan (**`amm_reservation`**).
- **Bulk edit** — edit massal di grid aset.
- **Low-stock alerts** — pemantauan `min_quantity` untuk consumables/accessories
  terhubung ke `OBS`/`APP06`.
- **Requestable flag + user-facing request queue** — `is_requestable`,
  alur permintaan end-user + audit trail (`amm_asset_request` diperluas).
- **User acceptance / EULA** on checkout — persyaratan persetujuan saat
  checkout/assignment (`amm_eula`, `amm_eula_acceptance`).
- **Checkout/checkin email alerts** — notifikasi per-transaksi via `APP06`.
- **Configurable status labels** — status aset/lifecycle dapat dikonfigurasi
  (bukan fixed enum) (`amm_status_label`, `amm_status_type`).
- **Public REST API** — API publik/terbatas dengan scoped API tokens
  (**`amm_api_token`**, **`amm_api_log`**).
- **Permintaan aset** — pengajuan/mutasi aset via approval
  (`amm_asset_request`, `APP04`).
- **Laporan aset** — ringkasan/inventori (PDF/Excel) terjadwal via `JMS`.
- **Label QR/barcode** — cetak label aset (QR/barcode berisi token/URL) untuk pemindaian.
- **Import/Export** — Excel 3 sheet (`excelize`, satu berkas updateable) sudah
  diputuskan di [additional.md §6](additional.md#62-export-excel-3-sheet--bisa-keputusan-backend-excelize).
- **Multi-tenant** — per `company_id`, RBAC OmniSight.

> **Fokus awal = aset lokasi/store** (data nyata di `additional.md`). Fitur
> lanjutan (lisensi/software/maintenance/QR/CMDB, model aset, fieldsets,
> audit/inventory, depresiasi, aksesori/komponen/kits, reservasi, bulk edit,
> requestable, EULA, API publik) ditambahkan bertahap tanpa mengubah model inti.

## 2. Paritas Fitur (GLPI · Snipe-IT · NetBox) — Lengkapi Kekurangan

| Area | Referensi | Target `AMM` | Status |
|---|---|---|---|
| Inventaris aset & lokasi | GLPI, Snipe-IT | ✅ (sudah ada) | Ada |
| **Asset Models (Manufacturer+Model)** | Snipe-IT, GLPI | **✅ `amm_asset_model`** | **MAJOR** |
| **Manufacturers** | Snipe-IT, GLPI | **✅ `amm_manufacturer`** | Minor |
| **Fieldsets (Custom field groups)** | GLPI | **✅ `amm_fieldset`/`amm_fieldset_field`/`amm_fieldset_binding`** | **MAJOR** |
| Jenis/kategori & tag | semua | ✅ | Ada |
| Departments | GLPI, Snipe-IT | **✅ `amm_department`** | Minor |
| Siklus hidup & status | Snipe-IT | ✅ (diperluas dengan configurable status) | Ada |
| **Configurable status labels** | Snipe-IT | **✅ `amm_status_label`/`amm_status_type`** | Minor |
| **Asset audit / Annual inventory** | GLPI | **✅ `amm_asset_audit`/`amm_audit_item`** | **MAJOR** |
| **Depreciation & EOL** | GLPI | **✅ `amm_depreciation`** | **MAJOR** |
| Penugasan/mutasi (checkout) | Snipe-IT | ✅ `amm_asset_assignment` | Ada |
| Relasi/dependensi (CMDB) | NetBox, GLPI | ✅ `amm_asset_relation` | Ada |
| Lisensi & seat | GLPI, Snipe-IT | ✅ | Ada |
| Software terpasang | GLPI | ✅ (manual/import; agent menyusul) | Ada |
| Garansi & maintenance | GLPI, Snipe-IT | ✅ `amm_maintenance` | Ada |
| Custom fields | GLPI, Snipe-IT | ✅ `amm_custom_field`/`amm_custom_value` | Ada |
| Supplier & kontrak | GLPI | ✅ `amm_supplier`/`amm_contract` | Ada |
| Consumables | GLPI, Snipe-IT | ✅ `amm_consumable`/`amm_consumable_txn` | Ada |
| **Accessories vs Consumables** | GLPI, Snipe-IT | **✅ `amm_accessory`/`amm_accessory_assignment`/`amm_accessory_txn`** | Minor |
| **Components** | GLPI | **✅ `amm_component`/`amm_component_assignment`** | Minor |
| **Kits (Predefined bundles)** | Snipe-IT | **✅ `amm_kit`/`amm_kit_item`/`amm_kit_checkout`** | Minor |
| **Reservations/Bookings** | GLPI | **✅ `amm_reservation`** | Minor |
| **Bulk edit (grid)** | Snipe-IT, GLPI | **✅ Frontend+API (bulk)** | Minor |
| **Low-stock alerts** | Snipe-IT | **✅ `min_quantity` + `OBS`/`APP06`** | Minor |
| **Requestable flag + request queue** | Snipe-IT, GLPI | **✅ `is_requestable` + `amm_asset_request` (user-facing + audit)** | Minor |
| **User acceptance/EULA on checkout** | GLPI | **✅ `amm_eula`/`amm_eula_acceptance`** | Minor |
| **Checkout/checkin email alerts** | Snipe-IT | **✅ `APP06` per-transaction** | Minor |
| Permintaan/persetujuan aset | GLPI | ✅ `amm_asset_request` (+ `APP04`) | Ada |
| Laporan aset | Snipe-IT, GLPI | ✅ PDF/Excel via `JMS` | Ada |
| Label QR/barcode | Snipe-IT | ✅ (QR/barcode) | Ada |
| Export Excel | Snipe-IT | ✅ (`excelize`) | Ada |
| **Public REST API / Scoped API tokens** | Snipe-IT, GLPI | **✅ `amm_api_token`/`amm_api_log`** | Minor |
| IPAM penuh (subnet/IPAM) | NetBox | ⏸️ sebagian (via `NET`) | Tetap di NET |
| Auto-discovery aset | NetBox, GLPI | ❌ non-goal (manual/import) | Non-goal |
| Helpdesk/ticketing + ITSM (problem/change) | GLPI | ❌ non-goal (fokus aset/CMDB) | Non-goal |
| DCIM penuh (rack/cable/power/PDU) | NetBox | ❌ non-goal | Non-goal |
| Depresiasi & keuangan | GLPI | **✅ (diperkuat via `amm_depreciation`)** | **MAJOR** |

**Referensi alat**: GLPI, Snipe-IT, NetBox.

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §14)

1. **Kode modul:** `AMM` (diperluas) — halaman `AMM01`.. .
2. **Cluster DB:** `amm_*` (lanjutan `cluster_amm.prisma`).
3. **Halaman lokasi-aset terpadu:** satu halaman `AMM` dengan tab (Lokasi/
   Perangkat/Signage/Akun/EDC) seperti [additional.md §6](additional.md#61-satu-halaman-banyak-tabel--bisa).
4. **Export Excel:** backend **`excelize`**, satu berkas **updateable**
   (`/root/exports/amm_assets.xlsx`), massal (store aktif), endpoint
   `USLoad(), USRole("AMM","POST")` (keputusan di `additional.md`).
5. **Relasi (CMDB):** `amm_asset_relation` menyimpan edge (source→target + tipe);
   tautan lintas-modul (VMS/NET/POD/PAM) memakai kolom referensi opsional.
6. **QR/barcode:** QR/barcode berisi **token aset** (bukan data sensitif) menuju halaman
   aset; cetak batch (PDF/PNG) di backend.
7. **Lisensi/software/maintenance:** model baru; import CSV/Excel; integrasi
   agen (inventaris software) menyusul.
8. **IPAM ringan:** pemetaan IP aset disimpan di `amm_asset.ip_address`; IPAM
   penuh tetap ranah `NET` (bukan non-goal IPAM penuh di AMM).
9. **Keamanan data:** kredensial (mis. `amm_store_account.password_enc`)
   terenkripsi; export berisi password dibatasi level `POST`.
10. **Asset Models & Manufacturers:** `amm_asset_model` mengikat `manufacturer_id` +
   `asset_type_id` + fieldset + depresiasi; `vendor` free-text dinormalisasi
   menjadi `amm_manufacturer` (pertahankan kompatibilitas jika dibutuhkan).
11. **Fieldsets:** `amm_fieldset` → `amm_fieldset_field` (definisi), terikat ke
   model via `amm_fieldset_binding`; nilai tersimpan di `amm_custom_value` dengan
   referensi fieldset/field.
12. **Departments:** `amm_department` sebagai entitas terpusat (menggantikan/
   melengkapi proxy `area_id`).
13. **Audit & Depresiasi:** `amm_asset_audit`/`amm_audit_item` untuk inventaris
   tahunan & periodik; `amm_depreciation` untuk metode, nilai buku, EOL & alerts.
14. **Accessories/Components/Kits/Reservations:** split aksesori terpisah dari
   consumables; komponen terpasang per aset; kits untuk checkout cepat;
   reservasi masa depan.
15. **Bulk edit:** tersedia di grid `AMM02` (API bulk).
16. **Low-stock alerts:** `min_quantity` terhubung `OBS`/`APP06`.
17. **Requestable + User-facing queue:** `is_requestable` + perluasan
   `amm_asset_request` + audit trail; approval tetap via `APP04`.
18. **EULA on checkout:** `amm_eula` + `amm_eula_acceptance` wajib saat assignment/
   checkout sesuai konfigurasi.
19. **Checkout/checkin email alerts:** per-transaksi via `APP06`.
20. **Configurable status labels:** `amm_status_label`/`amm_status_type` (bukan
   enum statis).
21. **Public REST API + scoped tokens:** `amm_api_token` (scoped, rate-limitable)
   + `amm_api_log`; akses dibatasi per scope & tenant.

## 4. Arsitektur & Topologi

```
Browser ──► osc_site (:37773) ──/proxy/pages/AMM/*──► osc_rest (:37772) ──pgx──► PostgreSQL (amm_*)
                                     │  CRUD aset + tabel anak + relasi + export excelize
                                     └── (opsional) /rest/agent ──► inventaris software (menyusul)
osc_rest ──► berkas export backend-only (/root/exports/amm_assets.xlsx)
AMM ◄──tautan── VMS · NET · POD · PAM · SEC (aset = simpul bersama)
```

- **Backend = penghubung tunggal DB**; export tidak lewat area publik.
- **AMM = simpul** yang ditaut modul lain (VM/perangkat/container/sesi).

## 5. Model Database — cluster `amm_*`

### 5.1 Sudah ada

| Model | Isi |
|---|---|
| `amm_asset_type` | Jenis aset (kategori). |
| `amm_asset` | Aset/lokasi (store): `code`, `name`, `ip_address`, `company_id`/`area_id`, `rent_status`. |
| `amm_asset_tag` | Label/tag aset. |
| `amm_asset_device` | Perangkat POS (`role` SERVER/CASHIER1/…), `serial`, `detail`. |
| `amm_digital_signage` | PC/TV signage (`brand`, `serial`). |
| `amm_store_account` | Akun toko (`password_enc`). |
| `amm_store_edc` | Mesin EDC. |

### 5.2 Baru

| Model | Isi pokok | Kunci |
|---|---|---|
| `amm_manufacturer` | Produsen terpusat: `code`, `name`, `url`?, `support_url`?, `is_active` (Bool) | `@@unique([company_id, code])` |
| `amm_asset_model` | **MAJOR — Asset Model** (grouping): `manufacturer_id`, `code`, `name`, `asset_type_id`?, `category`?, `fieldset_id`?, `depreciation_id`?, `model_number`?, `notes`?, `is_active` (Bool) | `@@unique([company_id, code])`, indeks `[manufacturer_id]`, `[asset_type_id]` |
| `amm_department` | Departemen/unit: `code`, `name`, `parent_id`?, `manager_id`?, `is_active` (Bool) | `@@unique([company_id, code])` |
| `amm_status_type` | Tipe status lifecycle: `code`, `name`, `is_system` (Bool), `is_active` (Bool) | `@@unique([company_id, code])` |
| `amm_status_label` | **Configurable status labels**: `code`, `name`, `status_type_id`, `color`?, `deployable` (Bool), `pending` (Bool), `archived` (Bool), `is_active` (Bool), `order` (Int) | `@@unique([company_id, status_type_id, code])` |
| `amm_fieldset` | **MAJOR — Fieldset grouping**: `code`, `name`, `target` (ASSET/ASSET_MODEL/…), `description`?, `is_active` (Bool) | `@@unique([company_id, target, code])` |
| `amm_fieldset_field` | Field dalam fieldset: `fieldset_id`, `custom_field_id`, `order` (Int), `required` (Bool), `default_value`? | indeks `[fieldset_id, order]` |
| `amm_fieldset_binding` | Binding fieldset ke entitas: `fieldset_id`, `entity` (ASSET_MODEL/ASSET_TYPE/ASSET), `entity_id` | indeks `[fieldset_id, entity_id]` |
| `amm_asset_audit` | **MAJOR — Asset audit/inventory**: `code`, `name`, `department_id`?, `area_id`?, `auditor_id`?, `scheduled_at`?, `started_at`?, `completed_at`?, `due_at`?, `interval_days` (Int)?, `status` (PLANNED/IN_PROGRESS/COMPLETED/OVERDUE/CANCELLED), `notes`? | `@@unique([company_id, code])` |
| `amm_audit_item` | Item audit per aset: `audit_id`, `asset_id`, `location_id`?, `scanned_at`?, `audited_at`?, `audited_by`?, `status` (FOUND/MISSING/MOVED/DAMAGED/EXTRA/OK), `condition`?, `notes`? | indeks `[audit_id, asset_id]`, `[asset_id]` |
| `amm_depreciation` | **MAJOR — Depreciation & EOL**: `code`, `name`, `method` (STRAIGHT_LINE/DECLINING_BALANCE/UNITS_OF_PRODUCTION/NONE), `useful_life_years` (Int)?, `salvage_value` (Decimal)?, `depreciation_rate` (Decimal)?, `start_date`?, `end_date`?, `is_active` (Bool) | `@@unique([company_id, code])` |
| `amm_asset_assignment` | Penugasan/mutasi: `asset_id`, `user_id`?, `area_id`?, `department_id`?, `assigned_at`, `returned_at`?, `note`?, `checkout_reason`?, `checkin_reason`?, `email_notified` (Bool) | indeks `[asset_id, assigned_at]`, `[user_id]` |
| `amm_asset_relation` | Relasi CMDB: `source_id`, `target_id`, `relation` (HOSTS/RUNS_ON/DEPENDS_ON/CONNECTS_TO/MEMBER_OF/PART_OF/ATTACHED_TO), `note`? | indeks `[source_id]`, `[target_id]` |
| `amm_license` | Lisensi: `code`, `name`, `vendor`?, `manufacturer_id`?, `type` (PERPETUAL/SUBSCRIPTION), `seats`, `used_seats`, `expiry_date`?, `cost`?, `is_active` (Bool) | `@@unique([company_id, code])` |
| `amm_license_seat` | Seat lisensi: `license_id`, `asset_id`?, `user_id`?, `assigned_at`, `released_at`? | indeks `[license_id]` |
| `amm_software` | Software terpasang: `asset_id`, `name`, `version`, `vendor`?, `manufacturer_id`?, `install_date`?, `license_id`?, `notes`? | indeks `[asset_id, name]` |
| `amm_maintenance` | Servis/garansi: `asset_id`, `type` (WARRANTY/PREVENTIVE/CORRECTIVE/CALIBRATION/UPGRADE), `title`, `scheduled_at`?, `performed_at`?, `vendor`?, `supplier_id`?, `cost`?, `status` (PLANNED/SCHEDULED/IN_PROGRESS/DONE/OVERDUE/CANCELLED), `note`? | indeks `[asset_id, scheduled_at]` |
| `amm_custom_field` | Definisi custom field: `code`, `name`, `target` (ASSET/LICENSE/SOFTWARE/CONTRACT/USER/…), `type` (TEXT/NUMBER/DATE/SELECT/BOOL/URL/TEXTAREA/FILE), `options` (Json), `required` (Bool), `order` (Int), `is_active` (Bool), `default_value`? | `@@unique([company_id, target, code])` |
| `amm_custom_value` | Nilai custom field: `field_id`, `entity` (ASSET/ASSET_MODEL/LICENSE/SOFTWARE/…), `entity_id` (Int/uuid), `value` (TEXT), `fieldset_id`? | indeks `[field_id, entity_id]`, `[entity, entity_id]` |
| `amm_supplier` | Pemasok: `code`, `name`, `contact`?, `phone`?, `email`?, `address`?, `url`?, `notes`?, `is_active` (Bool) | `@@unique([company_id, code])` |
| `amm_contract` | Kontrak: `code`, `name`, `supplier_id`?, `type` (PURCHASE/WARRANTY/MAINTENANCE/SUPPORT/LEASE/SERVICE), `start_at`, `end_at`, `cost`?, `document_path`?, `status` (ACTIVE/EXPIRED/TERMINATED/PENDING), `notes`? | `@@unique([company_id, code])` |
| `amm_contract_asset` | Tautan kontrak↔aset: `contract_id`, `asset_id` | indeks `[contract_id]`, `[asset_id]` |
| `amm_consumable` | Consumable: `code`, `name`, `category`?, `quantity` (Int/Decimal), `min_quantity` (Int/Decimal)?, `unit`?, `location`?, `supplier_id`?, `purchase_cost`?, `is_active` (Bool), `notes`? | `@@unique([company_id, code])` |
| `amm_accessory` | **Accessories (separate)**: `code`, `name`, `category`?, `quantity` (Int/Decimal), `min_quantity` (Int/Decimal)?, `unit`?, `location`?, `supplier_id`?, `purchase_cost`?, `is_accessory` (Bool), `is_requestable` (Bool), `is_active` (Bool), `notes`? | `@@unique([company_id, code])` |
| `amm_accessory_assignment` | Penugasan aksesori ke asset/user: `accessory_id`, `asset_id`?, `user_id`?, `assigned_at`, `returned_at`?, `quantity` (Int)?, `note`? | indeks `[accessory_id]`, `[asset_id]` |
| `amm_accessory_txn` | Mutasi stok aksesori: `accessory_id`, `kind` (IN/OUT/RETURN/ADJUST), `quantity`, `asset_id`?, `user_id`?, `note`?, `occurred_at` | indeks `[accessory_id, occurred_at]` |
| `amm_consumable_txn` | Mutasi stok consumable: `consumable_id`, `kind` (IN/OUT/ADJUST), `quantity`, `asset_id`?, `user_id`?, `note`?, `occurred_at`, `checkout_id`? | indeks `[consumable_id, occurred_at]` |
| `amm_component` | **Components (parts on asset)**: `asset_id`, `name`, `serial`?, `model`?, `manufacturer_id`?, `quantity` (Int)?, `installed_at`?, `warranty_until`?, `notes`? | indeks `[asset_id]` |
| `amm_component_assignment` | Riwayat pemasangan komponen: `component_id`, `asset_id`, `assigned_at`, `removed_at`?, `note`? | indeks `[component_id]`, `[asset_id]` |
| `amm_kit` | **Kits (bundles)**: `code`, `name`, `description`?, `is_active` (Bool), `is_requestable` (Bool) | `@@unique([company_id, code])` |
| `amm_kit_item` | Item dalam kit: `kit_id`, `item_type` (ASSET/ACCESSORY/CONSUMABLE/COMPONENT), `item_id` (Int), `quantity` (Int) | indeks `[kit_id]` |
| `amm_kit_checkout` | Checkout kit: `kit_id`, `asset_id`?, `user_id`?, `checked_out_at`, `checked_in_at`?, `checked_out_by`, `notes`? | indeks `[kit_id, checked_out_at]` |
| `amm_reservation` | **Reservations/bookings**: `asset_id`, `reserved_by` (user_id), `start_at`, `end_at`, `purpose`?, `status` (PENDING/APPROVED/REJECTED/CANCELLED/COMPLETED/EXPIRED), `approver_id`?, `approved_at`?, `cancelled_at`?, `notes`? | indeks `[asset_id, start_at, end_at]`, `[reserved_by]` |
| `amm_eula` | **EULA**: `code`, `name`, `content` (TEXT/Markdown), `version` (Int), `is_active` (Bool), `requires_acceptance` (Bool), `apply_to` (CHECKOUT/ALL) | `@@unique([company_id, code, version])` |
| `amm_eula_acceptance` | Penerimaan EULA: `eula_id`, `user_id`, `asset_id`?, `assignment_id`?, `accepted_at`, `ip_address`?, `user_agent`?, `signature`? | indeks `[eula_id, user_id]` |
| `amm_asset_request` | Permintaan/mutasi aset (diperluas): `code`, `type` (ASSIGN/TRANSFER/REPAIR/DISPOSAL/NEW/RESERVE/RETURN/ACCESSORY_REQUEST), `asset_id`?, `accessory_id`?, `kit_id`?, `requested_by`, `target_user_id`?, `target_area_id`?, `target_department_id`?, `reason`?, `status` (PENDING/APPROVED/REJECTED/CANCELLED), `approver_id`?, `decided_at`?, `request_date`?, `expected_date`?, `fulfilled_at`?, `notes`?, `is_user_facing` (Bool), `audit_trail` (Json)? | `@@unique([company_id, code])`, indeks `[requested_by, status]` |
| `amm_api_token` | **Public/scoped API tokens**: `token_hash`, `name`, `scopes` (Json/CSV), `expires_at`?, `last_used_at`?, `revoked_at`?, `created_by`, `is_active` (Bool) | `@@unique([company_id, token_hash])` |
| `amm_api_log` | Audit API calls: `token_id`?, `method`, `path`, `status_code` (Int), `ip_address`?, `user_agent`?, `duration_ms` (Int)?, `request_body_hash`?, `response_size` (Int)?, `timestamp` | indeks `[token_id, timestamp]`, `[timestamp]` |

Relasi inti:

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
amm_asset (1) ──► (N) amm_custom_value
amm_asset (1) ──► (N) amm_asset_device · amm_digital_signage · amm_store_account · amm_store_edc
               ├──► (N) amm_asset_tag · amm_asset_assignment · amm_maintenance · amm_software
               ├──► (N) amm_asset_relation [source]  ◄── (N) [target]  (CMDB)
               ├──► (N) amm_license_seat ──► amm_license
               ├──► (N) amm_component · amm_component_assignment
               ├──► (N) amm_accessory_assignment · amm_audit_item
amm_asset (1) ──► (N) amm_custom_value ──► amm_custom_field
amm_supplier (1) ──► (N) amm_contract ──► (N) amm_contract_asset ──► amm_asset
amm_supplier (1) ──► (N) amm_consumable · amm_accessory
amm_consumable (1) ──► (N) amm_consumable_txn
amm_accessory (1) ──► (N) amm_accessory_assignment · amm_accessory_txn
amm_component (1) ──► (N) amm_component_assignment
amm_kit (1) ──► (N) amm_kit_item · amm_kit_checkout
amm_asset (1) ──► (N) amm_reservation
amm_asset_audit (1) ──► (N) amm_audit_item
amm_depreciation (1) ──► (N) amm_asset_model · amm_asset (opsional)
amm_eula (1) ──► (N) amm_eula_acceptance
amm_asset_request ──► amm_asset · amm_accessory · amm_kit (opsional)
amm_api_token (1) ──► (N) amm_api_log
amm_asset ──(tautan opsional)── vms_host/vms_guest · net_device · pod_engine/container · pam_asset
```

> `amm_asset` & tabel anak = persisten. `amm_asset_assignment`/`amm_maintenance`/
> `amm_software`/`amm_audit_item`/`amm_component`/`amm_component_assignment`/
> `amm_accessory_assignment` = data referensi (persisten). Relasi CMDB &
> fieldset bindings dinormalisasi; **Cascade** dari `amm_asset` kecuali relasi
> CMDB (dibersihkan eksplisit). `amm_reservation`/`amm_eula_acceptance` ikut
> aturan audit (jangan hard-delete).

## 6. Backend (osc_rest)

Struktur: `osc_rest/skeleton/amm/` (`amm_handler.go`, `amm_usecase.go`,
`amm_repository.go`, `amm_template.go`, `amm_export.go`).

### 6.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("AMM", level)`)

| Area | Endpoint |
|---|---|
| Dashboard | `GET /rest/pages/AMM/overview` (jumlah aset, status, warranty/maintenance jatuh tempo) |
| Assets | `GET/POST /AMM/assets`, `GET/PUT/DELETE /AMM/assets/:id` |
| Nested (lokasi) | `.../assets/:id/{devices,signage,accounts,edc}` |
| Types | `GET/POST /AMM/types`, `PUT/DELETE /AMM/types/:id` |
| Tags | `GET/POST /AMM/assets/:id/tags`, `DELETE /AMM/tags/:id` |
| Assignment | `GET/POST /AMM/assets/:id/assignments`, `POST /AMM/assignments/:id/return` |
| Relations | `GET/POST /AMM/assets/:id/relations`, `DELETE /AMM/relations/:id` |
| Asset Models | `GET/POST /AMM/asset-models`, `PUT/DELETE /AMM/asset-models/:id` |
| Manufacturers | `GET/POST /AMM/manufacturers`, `PUT/DELETE /AMM/manufacturers/:id` |
| Departments | `GET/POST /AMM/departments`, `PUT/DELETE /AMM/departments/:id` |
| Fieldsets | `GET/POST /AMM/fieldsets`, `PUT/DELETE /AMM/fieldsets/:id`, `POST/PUT /AMM/fieldsets/:id/fields`, `POST /AMM/fieldsets/:id/bind` |
| Status Labels | `GET/POST /AMM/status-labels`, `PUT/DELETE /AMM/status-labels/:id` |
| Audits | `GET/POST /AMM/audits`, `PUT/DELETE /AMM/audits/:id`, `POST /AMM/audits/:id/start\|complete\|scan`, `GET/POST /AMM/audits/:id/items` |
| Depreciation | `GET/POST /AMM/depreciations`, `PUT/DELETE /AMM/depreciations/:id`, `POST /AMM/assets/:id/depreciation/calc` |
| Licenses | `GET/POST /AMM/licenses`, `PUT/DELETE /AMM/licenses/:id`, `POST /AMM/licenses/:id/seats` |
| Software | `GET/POST /AMM/assets/:id/software`, `DELETE /AMM/software/:id` |
| Maintenance | `GET/POST /AMM/maintenance`, `PUT/DELETE /AMM/maintenance/:id` |
| Custom fields | `GET/POST /AMM/custom-fields`, `PUT/DELETE /AMM/custom-fields/:id` |
| Suppliers | `GET/POST /AMM/suppliers`, `PUT/DELETE /AMM/suppliers/:id` |
| Contracts | `GET/POST /AMM/contracts`, `PUT/DELETE /AMM/contracts/:id`, `.../contracts/:id/assets` |
| Consumables | `GET/POST /AMM/consumables`, `PUT/DELETE /AMM/consumables/:id`, `POST /AMM/consumables/:id/txn` |
| Accessories | `GET/POST /AMM/accessories`, `PUT/DELETE /AMM/accessories/:id`, `POST /AMM/accessories/:id/assign\|return\|txn` |
| Components | `GET/POST /AMM/assets/:id/components`, `PUT/DELETE /AMM/components/:id`, `POST /AMM/components/:id/assign\|remove` |
| Kits | `GET/POST /AMM/kits`, `PUT/DELETE /AMM/kits/:id`, `POST /AMM/kits/:id/checkout\|checkin` |
| Reservations | `GET/POST /AMM/reservations`, `PUT/DELETE /AMM/reservations/:id`, `POST /AMM/reservations/:id/approve\|reject\|cancel` |
| Requests | `GET/POST /AMM/requests`, `POST /AMM/requests/:id/approve\|reject\|cancel` |
| EULA | `GET/POST /AMM/eulas`, `PUT/DELETE /AMM/eulas/:id`, `POST /AMM/eulas/:id/accept` |
| Bulk Edit | `POST /AMM/assets/bulk` |
| Reports | `GET/POST /AMM/reports`, `POST /AMM/reports/:id/run`, `GET /AMM/reports/:id/download` |
| QR/Label | `GET /AMM/assets/:id/qr`, `POST /AMM/assets/labels` (batch PDF/PNG) |
| Export | `GET /AMM/assets/export` (`USRole("AMM","POST")`, admin bypass) |
| Import | `POST /AMM/assets/import` (Excel/CSV) |
| API Tokens | `GET/POST /AMM/api-tokens`, `DELETE /AMM/api-tokens/:id`, `POST /AMM/api-tokens/:id/revoke` |
| API Logs | `GET /AMM/api-logs` |
| Low-stock Alerts | `GET /AMM/alerts/low-stock`, `POST /AMM/alerts/low-stock/test` |
| Settings | `GET/PUT /AMM/settings` |

### 6.2 Export Excel (keputusan tetap)
- Satu berkas **updateable** `/root/exports/amm_assets.xlsx` (3 sheet: Aset/
  Akun Toko/EDC), massal store aktif, via `excelize` — rinci di
  [additional.md §6.2](additional.md#62-export-excel-3-sheet--bisa-keputusan-backend-excelize).

## 7. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `AMM01` | **Dashboard** — ringkasan aset/status, warranty & maintenance jatuh tempo, lisensi hampir habis, **audit overdue**, **depreciation/EOL alerts**, **low-stock alerts** |
| `AMM02` | **Assets** — daftar aset (filter company/area/department/type/model/status) + aksi cepat + **bulk edit** |
| `AMM03` | **Asset detail** — tab: Detail, **Perangkat**, **Signage**, **Akun**, **EDC**, **Software**, **Maintenance**, **Relasi**, **Components**, **Accessories**, **History/Mutasi**, **Depreciation**, **Audits**, **EULA** |
| `AMM04` | **Types & Tags** + **Manufacturers**, **Asset Models**, **Departments**, **Status Labels** |
| `AMM05` | **Licenses** — lisensi + seat + expiry |
| `AMM06` | **Maintenance** — jadwal & riwayat servis/garansi |
| `AMM07` | **CMDB / Relations** — grafik keterkaitan aset |
| `AMM08` | **Labels** — cetak QR/barcode (batch) |
| `AMM09` | **Export/Import** — Excel (massal) + template import |
| `AMM10` | **Custom fields & Fieldsets** — definisi kolom tambahan + grup fieldset terikat model/aset |
| `AMM11` | **Suppliers & Contracts** — pemasok, kontrak + aset terkait |
| `AMM12` | **Consumables & Accessories** — stok (split) + mutasi + low-stock |
| `AMM13` | **Requests** — pengajuan/mutasi aset + approval (**user-facing queue**, `is_requestable`) |
| `AMM14` | **Reports** — laporan inventori (PDF/Excel) terjadwal + **Asset Audit Report**, **Depreciation/EOL Report** |
| `AMM15` | **Kits, Components & Reservations** — kits, komponen per aset, reservasi/bookings |
| `AMM16` | **Audits (Annual Inventory)** — daftar audit, item, scan, status **FOUND/MISSING/MOVED/DAMAGED** |
| `AMM17` | **API Tokens & Logs** — scoped tokens + audit API (public/scoped API) |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`, pola tab
(`APP02`/`APP04`), `recharts` (grafik), **qr** generator (aset baru) + laporan
`jspdf`.

## 8. Keamanan & RBAC

- **Kredensial akun toko** (`password_enc`) & kredensial lain terenkripsi.
- **Export password** dibatasi level `POST` (admin bypass); berkas backend-only,
  tidak ada URL publik.
- **QR token** = acak (bukan ID/kredensial), dapat dicabut/regenerate.
- **Isolasi tenant:** semua query difilter `company_id`.
- **Audit:** semua mutasi UI → `USLogs` (`app_user_action`); import/export
  dicatat.

### 8.1 Otorisasi
- Baca: `VIEW`; ubah aset/lisensi/maintenance: `POST`; export & hapus: `POST`.

## 9. Retensi & Audit

- Data aset/lisensi/software/maintenance → **persisten** (referensi).
- Riwayat mutasi (`amm_asset_assignment`) → persisten (audit).
- Export berkas di `/root/exports` → di-*refresh* tiap ekspor (tidak menumpuk).
- Semua mutasi UI → `USLogs` (`app_user_action`).

## 10. Integrasi Lintas-Modul

- **VMS** ([app_vms.md](app_vms.md)) — `amm_asset` ↔ `vms_host`/`vms_guest`
  (relasi `HOSTS`/`RUNS_ON`).
- **NET** ([app_net.md](app_net.md)) — aset ↔ `net_device` (`CONNECTS_TO`),
  pemetaan IP (IPAM penuh tetap di NET).
- **POD** ([app_pod.md](app_pod.md)) — aset ↔ `pod_engine`/container.
- **PAM** ([app_pam.md](app_pam.md)) — target akses = `amm_asset`.
- **SEC** ([app_sec.md](app_sec.md)) — temuan/krentanan menempel ke aset.
- **APP04** ([app_sys.md](app_sys.md)) — **approval permintaan aset**
  (`amm_asset_request`).
- **APP06** ([app_sys.md](app_sys.md)) — notifikasi (checkout/checkin email alerts,
  low-stock alerts, requestable notifications).
- **OBS** — alerting (low-stock, audit overdue, depreciation/EOL).
- **JMS** — pengingat maintenance/warranty, expiry lisensi, **asset audit due**,
  **depreciation/EOL** berkala.

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Aset & lokasi** | Skeleton `amm/`; halaman `AMM01`–`AMM03` (tabs lokasi); nested resource; export/import Excel. |
| **B. Jenis, tag, status** | `amm_asset_type`/`amm_asset_tag` + status lifecycle; halaman `AMM04`. |
| **C. Penugasan/CMDB** | `amm_asset_assignment`/`amm_asset_relation`; halaman `AMM07`. |
| **D. Lisensi & software** | `amm_license`/`amm_license_seat`/`amm_software`; halaman `AMM05`. |
| **E. Maintenance & QR** | `amm_maintenance` + label QR/barcode; halaman `AMM06`, `AMM08`. |
| **F. Integrasi & polish** | Tautan lintas-modul (VMS/NET/POD/PAM/SEC), pengingat `JMS`/`OBS`, test & dokumentasi. |
| **G. Custom fields, kontrak & stok** | `amm_custom_field`/`amm_custom_value`, `amm_supplier`/`amm_contract`, `amm_consumable`/`amm_consumable_txn`; halaman `AMM10`–`AMM12`. |
| **H. Permintaan & laporan** | `amm_asset_request` (approval `APP04`, user-facing queue), laporan aset (PDF/Excel via `JMS`); halaman `AMM13`–`AMM14`. |
| **I. MAJOR — Models, Fieldsets, Audit, Depresiasi** | **`amm_asset_model`**, **`amm_manufacturer`**, **fieldsets**, **`amm_asset_audit`/`amm_audit_item`**, **`amm_depreciation`**, **departments/status labels**; bulk edit, QR/barcode diperkuat; halaman `AMM04`, `AMM10`, `AMM16`. |
| **J. Minor — Accessories/Components/Kits/Reservations/EULA/API** | **`amm_accessory*`**, **`amm_component*`**, **`amm_kit*`**, **`amm_reservation`**, **`amm_eula*`**, **`amm_api_token*`**, low-stock alerts (`OBS`/`APP06`), checkout/checkin email alerts (`APP06`); halaman `AMM12`, `AMM15`, `AMM17`. |

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Data aset tidak akurat/basi | Import Excel, pengingat review, audit mutasi. |
| Kebocoran kredensial (akun/EDC) | Enkripsi, export hanya `POST`, backend-only. |
| QR disalahgunakan | Token acak + regenerate + akses `VIEW`. |
| Relasi CMDB kacau | Validasi anti-siklus + tipe relasi tetap. |
| Duplikasi aset | `@@unique` code/serial + deteksi duplikat saat import. |

## 13. Non-Goals

- **Auto-discovery** aset (network scan) — non-goal (manual/import dulu).
- **Depresiasi & akuntansi** penuh — sebagian dicakup via `amm_depreciation` (EOL/valuasi dasar); akuntansi penuh — menyusul.
- **IPAM penuh** (subnet/prefix) — ranah `NET`.
- Menggantikan penuh GLPI (helpdesk/ticketing) — `AMM` fokus aset/CMDB.
- **ITSM penuh** (ITIL): problem management, change management, dan
  ticketing/helpdesk (recurrent ticket, SLA, knowledge base) — **non-goal**;
  `AMM` hanya menyimpan **permintaan aset** (`amm_asset_request`) + approval.
- **DCIM penuh** (NetBox-style): rack/cabinet, patch panel, kabel (cable/circuit),
  power/PDU, dan ruang/lokasi fisik — **non-goal**; `AMM` hanya mencatat
  `amm_asset.location`/relasi CMDB, tanpa pemodelan fisik DCIM.

## 14. Keputusan

### 14.1 Terkonfirmasi
- [x] Modul **`AMM`** diperluas: aset lokasi + **CMDB/lisensi/maintenance/QR**.
- [x] Export Excel **`excelize`** (satu berkas updateable, massal store aktif).
- [x] **Custom fields** (`amm_custom_field`/`amm_custom_value`) per jenis aset.
- [x] **Supplier & kontrak** (`amm_supplier`/`amm_contract`).
- [x] **Consumables/accessories** (`amm_consumable`/`amm_consumable_txn`) — dipisah jadi **consumables vs accessories**.
- [x] **Permintaan aset + approval** (`amm_asset_request`, `APP04`).
- [x] **Laporan aset** PDF/Excel terjadwal via `JMS`.
- [x] **Asset Models (Manufacturer+Model)** — **MAJOR** (`amm_asset_model`, `amm_manufacturer`).
- [x] **Fieldsets** — **MAJOR** (`amm_fieldset`/`amm_fieldset_field`/`amm_fieldset_binding`).
- [x] **Asset audit / annual inventory** — **MAJOR** (`amm_asset_audit`/`amm_audit_item`).
- [x] **Depreciation & EOL** — **MAJOR** (`amm_depreciation`).
- [x] **Departments** (`amm_department`) & **configurable status labels** (`amm_status_label`/`amm_status_type`).
- [x] **Components, Kits, Reservations/bookings, EULA on checkout, requestable flag + user-facing queue**.
- [x] **Bulk edit**, **low-stock alerts** (`OBS`/`APP06`), **checkout/checkin email alerts** (`APP06`).
- [x] **Public REST API + scoped tokens** (`amm_api_token`/`amm_api_log`).

### 14.2 Perlu konfirmasi
- [ ] Termasuk **lisensi & software** di fase awal atau bertahap?
- [ ] **QR/barcode** untuk label aset — setuju (sudah diputuskan QR; barcode tetap didukung)?
- [ ] Relasi CMDB **lintas-aset** saja, atau sekaligus tautan ke VMS/NET/POD?
- [ ] Maintenance/warranty reminder via **`JMS`** + notifikasi `OBS`/`APP06` (termasuk audit overdue & EOL)?
- [ ] Normalisasi `vendor` → `amm_manufacturer`: **retain free-text `vendor`** atau **force mapping** saat migrasi?

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- Data contoh & pemetaan field: [additional.md](additional.md).
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Grid & pagination: `mechanic.GridParams`, `src/lib/grid.ts`.
- Export: `github.com/xuri/excelize/v2` (backend).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_amm.prisma`,
  [database/cluster_amm.md](../database/cluster_amm.md).
- Referensi eksternal: GLPI, Snipe-IT, NetBox.
