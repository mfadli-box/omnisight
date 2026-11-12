# Audit Statis Grup A: `directus`, `snipe-it`, `glpi`

- **Date**: 2026-11-12
- **Author**: ai-main (PM, System Analyst & Docker DevOps Architect) — dengan delegasi audit statis 3 subagen paralel
- **Source Target**:
  - `directus` — https://github.com/directus/directus @ `490cee0` (2026-11-11)
  - `snipe-it` — https://github.com/grokability/snipe-it @ `947ac80` (2026-11-09)
  - `glpi` — https://github.com/glpi-project/glpi @ `96a67c7` (2026-11-10)
- **Scope**: Re-engineering audit — audit statis metadata koleksi dinamis, filter AST, policy RBAC (Directus), siklus aset/lisensi (Snipe-IT), inventory & tiket ITIL (GLPI)
- **Aturan**: `git clone --depth 1` ke `.rea_docs/` (gitignored) — **inspeksi statis murni**, tidak ada `npm/composer install`, build, atau eksekusi script apa pun (anti supply-chain)
- **Delegasi**: analisis mendalam via 3 subagen `explore` paralel (1 repo / subagen)
- **Checklist Ref**: `osc_docs/checklist.md` — Hari 1 (`SESI 0.1`)

---

## 1. Executive Summary

| Repo | Stack | Lapisan yang diaudit | Pola inti yang harus dipindahkan |
| :--- | :--- | :--- | :--- |
| `directus` | Node 26 / TypeScript ESM, Knex 3 (multi-dialek), seeds YAML | Koleksi dinamis, filter AST, RBAC policy | Metadata 3 tabel + DDL runtime + snapshot/diff; filter JSON → SQL parameterized; policy-based RBAC dengan union `_or` + field-level CASE WHEN |
| `snipe-it` | PHP ≥ 8.2 / Laravel 12, MySQL default | Siklus aset & lisensi | State machine aset via status labels; transaksi + `lockForUpdate` untuk claim seat/aset; audit log polymorphic (`action_logs`); FMCS company scoping |
| `glpi` | PHP ≥ 8.3, MySQL (schema `install/mysql/glpi-empty.sql`), GLPI 12.0.2-dev | Inventory agent & tiket ITIL | Rules engine berantai (`ranking`) untuk dedup import; timeline ITIL (followup/task/solution/validation); state tiket int constants; multi-entity rekursif |

Ketiga sistem adalah referensi utama untuk modul **ITAM/DCIM + Studio koleksi dinamis** pada target omnisight (Hari 6–8: skema Prisma P1–P3; Wave 1: Rust API). Detail temuan per repo:

---

## 2. Directus — Koleksi Dinamis, Filter AST, RBAC Policy

### 2.1 Koleksi dinamis (metadata + DDL runtime)

**Model metadata — 3 tabel** (`api/src/database/seeds/*.yaml`, dikonsumsi `packages/system-data/src/fields/*.yaml`):

| Tabel | Kunci | Kolom penting |
| :--- | :--- | :--- |
| `directus_collections` | PK `collection` (string) | `icon, note, hidden, singleton, sort_field, archive_field/value, accountability, versioning, group, meta` |
| `directus_fields` | PK `id` auto-inc, FK `collection` | `field, special (cast-json/cast-csv), interface, options(json), display, validation(json), searchable, readonly, hidden, group` |
| `directus_relations` | `id` | sisi many: `many_collection/field/primary`; sisi one: `one_collection/field/primary`; A2O: `one_collection_field, one_allowed_collections`; junction: `junction_field, sort_field` |

**Pembuatan koleksi runtime** (`api/src/services/collections.ts::createOne`):
- Validasi nama: tanpa prefix `directus_`, tanpa `/`/whitespace; duplikat dicek vs metadata **dan** schema inspector.
- Dalam **satu transaksi**: jika `payload.schema` ada → `trx.schema.createTable()` (DDL nyata), lalu insert metadata ke `directus_fields` + `directus_collections`. PK default `id integer auto-increment` diinjeksi bila tidak disediakan.
- Kolom runtime dibuat `FieldsService.addColumnToTable` (`api/src/services/fields.ts`): mapping tipe → Knex builder (`increments, string(n), text, float, decimal(p,s), dateTime, geometry`); tipe `alias/unknown/csv/hash` di-skip/di-cast text; PG `CREATE INDEX CONCURRENTLY` dijalankan di luar transaksi.
- **Snapshot/diff**: `api/src/utils/schema/get-snapshot.ts` (introspeksi via `@directus/schema` + metadata) → `get-snapshot-diff.ts` (paket `deep-diff`, mode `merge` tanpa delete vs `mirror`) → `apply-diff.ts` (transaksi, re-use jalur DDL di atas).

> **Implikasi re-engineering**: metadata bisa jadi tabel Prisma biasa, tetapi **DDL runtime tidak cocok lewat Prisma** — harus jadi dynamic SQL (raw/migrasi runtime) di `osc_rest` dengan whitelist tipe + transaksi.

### 2.2 Filter AST

- Tipe (`packages/types/src/filter.ts`): `Filter = Logical (_and/_or rekursif) | FieldFilter`; ~35 operator (`_eq, _neq, _lt/_gt/_in/_nin, _null/_nnull, _contains/_icontains, _between, _regex, _json, _intersects…`); relasi via path bertitik, A2M scope `field:collection`, quantifier `_some/_none` (o2m top-level).
- Eksekusi (`api/src/database/run-ast/` → `lib/apply-query/filter/`): dua fase — `addJoins` (path relasi >1 level) lalu `addWhereClauses` rekursif; `_some/_none` → subquery `whereIn/whereNotIn(pk, subquery)` yang memakai permission cases sub-koleksi.
- **Mitigasi injection**: identifier/field selalu lewat `getColumn` yang memvalidasi keberadaan di schema (bukan input mentah); nilai selalu binding parameterized; operator divalidasi terhadap tipe field (`validate-operator.ts`) — operator non-equality ditolak untuk field `conceal` (hash).
- Case-insensitive: `whereRaw('LOWER(??) LIKE ?', [raw, param])` — identifier di-escape, nilai dibind.

> **Implikasi re-engineering**: filter AST bisa diporting 1:1 ke Rust (parser JSON → SQL builder parameterized); kunci keamanan = **validasi identifier terhadap schema** + binding untuk semua nilai — selaras standar ai-rest (sqlx `push_bind`, dilarang format string SQL dari input).

### 2.3 RBAC Policy

- Model (migration `20240806A-permissions-policies.ts`): `directus_policies` (`admin_access, app_access, ip_access, enforce_tfa`) → `directus_access` (join user/role → policy, policy bisa menempel ke user **atau** role **atau** public) → `directus_permissions` (`policy, collection, action: create/read/update/delete/share, permissions: json item-rule, validation: json payload-rule, presets: json, fields: csv, limit`).
- Evaluasi (`api/src/permissions/`): kumpul policy dari user-direct + role-tree (`fetch-roles-tree.ts`) + public; filter IP; merge banyak policy — **`fields` di-union, item-rule digabung via `_or` (union access)**; admin bypass penuh.
- Injection ke query: `process-ast/inject-cases.ts` menanamkan item-rule sebagai **CASE WHEN per field** (`apply-case-when.ts`) — field hanya terisi bila item lolos rule; payload mutasi dievaluasi `process-payload` (enforce fields/validation/presets). Cache per-request (`with-cache`).

---

## 3. Snipe-IT — Siklus Aset & Lisensi

### 3.1 Siklus aset

- Kolom audit `assets`: `asset_tag, model_id, serial, status_id, assigned_to + assigned_type (polymorphic User|Asset|Location), location_id, rtd_location_id, last_checkout, last_checkin, expected_checkin, checkin_counter/checkout_counter/requests_counter, requestable, company_id, next_audit_date/last_audit_date, softDeletes`.
- **State machine** (via `status_labels` + 3 flag, bukan enum DB): `deployable / pending / archived` (+ undeployable implisit). Ketersediaan checkout = `!assigned_to && !deleted_at && status.deployable && !status.archived` (`Asset::availableForCheckout()`).
- **Concurrency guard** (`AssetCheckoutController::store`): validasi `canCheckoutTo` (FMCS) → `DB::transaction` + **`lockForUpdate()` + re-check `availableForCheckout()`** — pola claim atomik yang wajib dipertahankan (di PostgreSQL: `SELECT … FOR UPDATE` atau `UPDATE … WHERE assigned_to IS NULL RETURNING`).
- Checkin web (`AssetCheckinController`) **belum transaksional** (save + update child + event terpisah) — temuan teknis yang diperbaiki di re-engineering.
- Audit log: `Actionlog` (tabel `action_logs`) polymorphic `item_type/item_id` + `target_type/target_id`, enum `ActionType` (`checkout, checkin from, audit, accepted, declined, add seats, …`), event listener `CheckoutableListener`.

### 3.2 Siklus lisensi

- `licenses`: `seats, serial (product key), expiration_date, termination_date, maintained, reassignable, min_amt, category_id, company_id, softDeletes`; `license_seats`: `license_id, assigned_to (user) | asset_id, notes, unreassignable_seat, softDeletes`.
- Claim seat: `License::freeSeat(lock)` → seat `assigned_to IS NULL AND asset_id IS NULL AND unreassignable_seat = false` dengan `lockForUpdate` **dalam transaksi**; validasi duplikat user, error `not_enough_seats`.
- Serial lisensi disembunyikan dari search untuk user tanpa `viewKeys` (`License::scopeTextSearchWithoutSerial`) — anti existence-oracle.

### 3.3 Struktur & keamanan inti

| Tabel | Catatan |
| :--- | :--- |
| `assets`, `licenses`, `license_seats`, `status_labels`, `action_logs`, `users`, `asset_models`, `categories`, `companies`, `depreciations`, `checkout_acceptances`, `checkout_requests` | Semua utama soft-delete; `company_id` di aset/lisensi/log |
| FMCS (multi-company) | Global scope Eloquent (`CompanyableScope`) + `Company::scopeCompanyables()` + gate `Company::isCurrentUserHasAccess()`; `users` multi-company via pivot `company_user` |
| Policies | `app/Policies/CheckoutablePermissionsPolicy` (`<entity>.checkout/.checkin`) base untuk Asset/License/Accessory/Consumable |
| Upload | Rule kustom `AllowedUploadExtension` (bukan `mimes:` content-sniffing — anti bypass); file di private storage |

---

## 4. GLPI — Inventory & Tiket ITIL

### 4.1 Inventory (agent-based)

- Endpoint `src/Glpi/Controller/InventoryController.php` (`/Inventory`) + legacy `/front/inventory.php`; gate `enabled_inventory`; header `GLPI-Agent-ID` → `deviceid`; protokol query: `prolog, inventory, snmp, contact, netdiscovery, netinventory`; format **XML (Fusion legacy) & JSON** (schema resmi `inventory_format`).
- Alur: `Inventory/Request.php` → `Inventory.php` (`extractMetadata, handleItem`) → converter `MainAsset/` (Computer, Phone, Printer, NetworkEquipment) + sub-asset `Inventory/Asset/` (~35 kelas: Processor, Memory, HardDrive, Software, NetworkPort, VirtualMachine…).
- Penyimpanan: `glpi_agents` (`deviceid` UNIQUE, `last_contact`, link `itemtype+items_id` ke aset) + `glpi_computers` (`serial, uuid, last_inventory_update, is_dynamic, is_deleted`) + komponen generik `glpi_items_device*` (GLPI 11+ menggeneralkan tabel, bukan lagi `glpi_computer*`).
- Update incremental: `last_inventory_update`, partial mode (`setPartial()`), **field-locking** (`glpi_lockedfields` — agent tidak menimpa field yang dikunci user).
- Import ditolak rule → `glpi_refusedequipments`.

### 4.2 Rules engine (dedup & assignment)

- Inti: `src/Rule.php` (`checkCriterias/executeActions`), `RuleCollection::processAllRules()` — **urutan by `ranking`**, `glpi_rules` (`sub_type, ranking, match AND/OR, is_active`) / `glpi_rulecriterias` (`criteria, condition, pattern`) / `glpi_ruleactions` (`action_type, field, value`).
- Operator kriteria: `IS, IS_NOT, CONTAIN, BEGIN, END, REGEX_MATCH, EXISTS, UNDER, CIDR, DATE_IS_BEFORE/AFTER…` — berantai, berurutan.
- Alur dedup import (`RuleImportAsset`): blacklist → `RuleImportEntity` (assign entity / refuse) → `RuleLocation` → `RuleImportAsset` (cari existing via serial/uuid/mac) → hasil `LINK_RESULT_DENIED / CREATE / LINK` → update-or-create aset; log match di `glpi_rulematchedlogs`.

### 4.3 Tiket ITIL

- **State machine status** (`src/CommonITILObject.php`): `INCOMING=1 → ASSIGNED=2 → PLANNED=3 → WAITING=4 → SOLVED=5 → CLOSED=6` (+ `ACCEPTED=7, OBSERVED=8, APPROVAL=10`) — int constants, bukan enum DB.
- Timeline polymorphic di bawah tiket: followup (`glpi_itilfollowups`, `is_private`), task (`glpi_tickettasks`, `actiontime, users_id_tech/groups_id_tech`), solution (`glpi_itilsolutions` + approval `users_id_approval/date_approval`), validation (`glpi_ticketvalidations`, `global_validation` — status `APPROVAL`, tolak → kembali ke status sebelumnya).
- Aktor: `glpi_tickets_users / glpi_groups_tickets / glpi_suppliers_tickets` dengan `type` = `REQUESTER=1 / ASSIGN=2 / OBSERVER=3` (+ `alternative_email` untuk non-user).
- SLA/OLA: `slas_id_tto/ttr, time_to_own/time_to_resolve, sla_waiting_duration, waiting_duration`; priority = urgency × impact via **matrix** per entity.
- Search engine: legacy `src/Search.php` + GLPI 11/12 `src/Glpi/Search/` (`SearchEngine`, Provider/Input/Output).

### 4.4 RBAC & keamanan

- Multi-entity hierarkis: `glpi_entities` (`entities_id` parent + `is_recursive` di semua tabel).
- RBAC bitmask per right (`glpi_profilerights`): hak tiket khusus `READGROUP=2048, READASSIGN=4096, ASSIGN=8192, STEAL=16384, OWN=32768, CHANGEPRIORITY=65536, READNEWTICKET=262144` — dicek via `Session::haveRight()`.
- Optimistic locking edit: `glpi_objectlocks` (UNIQUE `itemtype+items_id`).
- API auth: `glpi_users.api_token` + `app_token` (`glpi_apiclients`, range IP); endpoint inventory **tanpa token user** (hanya gate flag + `GLPI-Agent-ID`) — catatan risiko untuk re-engineering: wajib diperketat (agent HMAC sesuai standar ai-rest).
- Sanitasi: `Blacklist` (serial/MAC/model yang dibuang sebelum rule), XML tanpa external entity (XXE aman).

---

## 5. Sintesis untuk Re-engineering omnisight

1. **Skema Prisma (Hari 6–8)** — item yang harus masuk P1/P2:
   - Metadata koleksi dinamis: `collections/fields/relations` (3 tabel ala Directus, snake_case).
   - Policy RBAC: `policies` + join `access` (user/role → policy) + `permissions` (item-rule json, validation json, presets, fields csv, limit) — menggantikan model role tunggal.
   - ITAM ala Snipe-IT/GLPI: `assets` (+status labels), `licenses` + `license_seats`, `action_logs` polymorphic, `agents`, `tickets` + aktor/timeline/validasi.
2. **Rust API (Wave 1)** — standar yang wajib dipertahankan dari referensi:
   - Filter AST: parser JSON → SQL parameterized, **identifier divalidasi terhadap schema** (pola `getColumn` Directus), operator tervalidasi per tipe field.
   - RBAC: merge multi-policy (union fields + `_or` item-rule) + **CASE WHEN field-level**; evaluasi per-request dengan cache.
   - Claim atomik: transaksi + `FOR UPDATE` untuk checkout aset/seat (pola Snipe-IT `lockForUpdate + re-check`); perbaiki checkin yang tidak transaksional.
   - Rules engine dedup: antrean ber-`ranking` (pola GLPI) untuk ingest inventory agent.
   - DDL runtime koleksi dinamis: **bukan Prisma** — dynamic SQL di Rust dengan whitelist tipe + transaksi (pola Directus `createOne`).
3. **Risiko/temuan yang diperbaiki di target**: checkin Snipe-IT non-transaksional; endpoint inventory GLPI tanpa autentikasi agent (target: HMAC + replay window); serial lisensi & field hash harus tetap tunduk pada field-level concealment.

---

## 6. Verifikasi & Isolasi

- [x] `.gitignore` root memuat `.rea_docs/` — `git check-ignore -v .rea_docs/` → `.gitignore:4` ✔
- [x] `git status` hanya menampilkan modifikasi `.gitignore` (folder clone tidak ter-track) ✔
- [x] Shallow clone `--depth 1` ketiga repo ke `.rea_docs/{directus,snipe-it,glpi}`; commit hash tercatat pada header ✔
- [x] Tidak ada `install/build/artisan/composer/npm` dieksekusi — audit 100% statis ✔
- [ ] Cleanup `.rea_docs/` dilakukan pada Hari 21 (`SESI 5.1`) sesuai checklist finalisasi.
