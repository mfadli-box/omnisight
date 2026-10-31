# Prisma dan Migrasi

## 1. Pembagian tanggung jawab

| Alat | Tanggung jawab |
|---|---|
| Prisma | Definisi skema, riwayat migrasi, seed data referensi |
| SQL manual di migrasi | RLS, grant, trigger, partisi, function, view, constraint lanjutan |
| SQLx (Rust) | Semua query runtime, transaksi, pemetaan hasil |
| Prisma Client | **Tidak dipakai** di runtime |

Alasan:

- Backend Rust membutuhkan kontrol SQL dan performa yang lebih baik.
- RLS, partisi, dan audit hash chain tidak dapat dimodelkan penuh oleh Prisma.
- Menghindari dua ORM yang saling bertentangan.

## 2. Struktur folder yang direncanakan

```text
osc_base/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   │   ├── 20261030000100_init_core/
│   │   │   └── migration.sql
│   │   ├── 20261030000200_init_asset/
│   │   │   └── migration.sql
│   │   └── ...
│   └── seed.ts
├── sql/
│   ├── 010_roles.sql
│   ├── 020_rls.sql
│   ├── 030_partitions.sql
│   ├── 040_functions.sql
│   └── 050_views.sql
├── .env.example
└── README.md
```

File `sql/` tidak dijalankan otomatis oleh Prisma. Isinya disalin ke migrasi yang relevan atau dijalankan oleh migration job terkontrol. Semua perubahan tetap masuk riwayat migrasi.

## 3. Contoh `schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["core", "asset", "network", "monitor", "ops", "service", "content", "audit", "platform"]
}

model Company {
  id        String   @id @db.Uuid
  code      String   @unique @db.VarChar(32)
  name      String   @db.VarChar(160)
  status    String   @default("active") @db.VarChar(16)
  timezone  String   @default("Asia/Jakarta") @db.VarChar(64)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  areas Area[]

  @@schema("core")
  @@map("companies")
}

model Area {
  id        String   @id @db.Uuid
  companyId String   @map("company_id") @db.Uuid
  parentId  String?  @map("parent_id") @db.Uuid
  code      String   @db.VarChar(32)
  name      String   @db.VarChar(160)
  type      String   @default("branch") @db.VarChar(32)
  status    String   @default("active") @db.VarChar(16)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  company   Company  @relation(fields: [companyId], references: [id])
  locations Location[]

  @@unique([companyId, id])
  @@unique([companyId, code])
  @@index([companyId, status])
  @@schema("core")
  @@map("areas")
}

model Location {
  id        String   @id @db.Uuid
  companyId String   @map("company_id") @db.Uuid
  areaId    String   @map("area_id") @db.Uuid
  parentId  String?  @map("parent_id") @db.Uuid
  code      String   @db.VarChar(32)
  name      String   @db.VarChar(160)
  type      String   @default("site") @db.VarChar(32)
  status    String   @default("active") @db.VarChar(16)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  area      Area     @relation(fields: [areaId], references: [id])
  assets    Asset[]

  @@unique([companyId, areaId, id])
  @@unique([companyId, areaId, code])
  @@index([companyId, areaId, status])
  @@schema("core")
  @@map("locations")
}

model Asset {
  id           String   @id @db.Uuid
  companyId    String   @map("company_id") @db.Uuid
  areaId       String   @map("area_id") @db.Uuid
  locationId   String   @map("location_id") @db.Uuid
  assetTag     String   @map("asset_tag") @db.VarChar(64)
  serialNumber String?  @map("serial_number") @db.VarChar(128)
  name         String   @db.VarChar(160)
  status       String   @default("in_stock") @db.VarChar(24)
  version      Int      @default(1)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz(6)

  location     Location @relation(fields: [locationId], references: [id])

  @@unique([companyId, assetTag])
  @@index([companyId, areaId, status])
  @@index([companyId, locationId, status])
  @@schema("asset")
  @@map("assets")
}
```

Catatan model:

- Relasi FK komposit seperti `(company_id, area_id, location_id)` ditambahkan di SQL migrasi karena tidak semua bentuk dapat dinyatakan nyaman di Prisma.
- Enum PostgreSQL dihindari untuk nilai yang sering berubah; gunakan `varchar` + `CHECK`.
- `@db.Uuid`, `@db.Timestamptz(6)`, `@db.VarChar(n)` dipakai eksplisit.
- `@@map` dan `@map` menjaga nama database snake_case.
- `prisma db push` dilarang di staging/produksi.

## 4. Alur membuat migrasi

```bash
# 1. Ubah schema.prisma
# 2. Buat migrasi tanpa langsung apply
npx prisma migrate dev --create-only --name add_asset_assignment

# 3. Review SQL hasil generate
# 4. Tambahkan SQL manual: RLS, grant, index parsial, trigger, FK komposit
# 5. Apply ke database lokal
npx prisma migrate dev

# 6. Di staging/produksi
npx prisma migrate deploy
```

Aturan review migrasi:

- Tidak boleh ada `DROP TABLE` atau `DROP COLUMN` tanpa rencana dua fase.
- Perubahan kolom harus backward-compatible.
- Migrasi harus bisa dijalankan pada database kosong dan database berisi data.
- Migrasi besar dipisah: tambah kolom → backfill → ubah kode → hapus kolom lama.
- Backfill data berat dijalankan job terpisah, bukan di migrasi yang memblokir deploy.
- Setiap migrasi diuji di staging dengan salinan data tersamarkan.

## 5. Pola expand-contract

Untuk perubahan yang merusak kompatibilitas:

1. **Expand**: tambah kolom/tabel baru, kode menulis ke keduanya.
2. **Backfill**: isi data lama dengan job idempotent.
3. **Migrate**: kode membaca dari yang baru.
4. **Contract**: hapus yang lama setelah semua layanan memakai yang baru.

Contoh: mengganti nama kolom `employee_id` menjadi `employee_no`:

- Tambah `employee_no`.
- Backfill.
- Kode membaca `employee_no` dengan fallback sementara.
- Hapus `employee_id` pada rilis berikutnya.

## 6. SQL manual wajib

### 6.1 RLS

Dijalankan setelah tabel dibuat:

```sql
ALTER TABLE asset.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset.assets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON asset.assets
  USING (company_id = current_setting('app.company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.company_id', true)::uuid);
```

### 6.2 Grant

```sql
GRANT USAGE ON SCHEMA core, asset, network, monitor, ops, service, content, audit, platform
  TO osc_rest_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core, asset, network, monitor, ops, service, content, platform
  TO osc_rest_app;

GRANT SELECT, INSERT ON audit.audit_events TO osc_rest_app;
REVOKE UPDATE, DELETE ON audit.audit_events FROM osc_rest_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, asset, network, monitor, ops, service, content, platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO osc_rest_app;
```

`osc_rest_app` bukan pemilik tabel, sehingga `FORCE ROW LEVEL SECURITY` berlaku.

### 6.3 Foreign key komposit

```sql
ALTER TABLE core.locations
  ADD CONSTRAINT fk_locations_area
  FOREIGN KEY (company_id, area_id)
  REFERENCES core.areas (company_id, id);

ALTER TABLE asset.assets
  ADD CONSTRAINT fk_assets_location
  FOREIGN KEY (company_id, area_id, location_id)
  REFERENCES core.locations (company_id, area_id, id);
```

### 6.4 Index parsial

```sql
CREATE UNIQUE INDEX uq_assets_tag_active
  ON asset.assets (company_id, asset_tag)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_asset_one_active_assignment
  ON asset.asset_assignments (asset_id)
  WHERE status = 'active';
```

### 6.5 Partisi metrik

Partisi dibuat 12 bulan ke depan. Job maintenance khusus membuat partisi berikutnya setiap bulan. Aplikasi tidak memiliki hak DDL.

```sql
CREATE TABLE monitor.metric_samples_2026_11
  PARTITION OF monitor.metric_samples
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
```

### 6.6 Fungsi audit

Fungsi append audit dijalankan dengan hak terbatas dan dipanggil dalam transaksi yang sama:

```sql
CREATE FUNCTION audit.append_event(
  p_chain_key text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq bigint;
  v_prev bytea;
  v_hash bytea;
BEGIN
  SELECT last_seq, last_hash INTO v_seq, v_prev
  FROM audit.audit_chain_heads
  WHERE chain_key = p_chain_key
  FOR UPDATE;

  v_seq := COALESCE(v_seq, 0) + 1;
  v_hash := digest(COALESCE(v_prev, ''::bytea) || convert_to(p_payload::text, 'UTF8'), 'sha256');

  INSERT INTO audit.audit_events (chain_key, seq, prev_hash, hash, /* kolom lain */)
  VALUES (p_chain_key, v_seq, v_prev, v_hash, /* nilai lain */);

  INSERT INTO audit.audit_chain_heads (chain_key, last_seq, last_hash, updated_at)
  VALUES (p_chain_key, v_seq, v_hash, now())
  ON CONFLICT (chain_key)
  DO UPDATE SET last_seq = v_seq, last_hash = v_hash, updated_at = now();
END;
$$;
```

Catatan: fungsi final harus memetakan seluruh kolom audit, memakai payload kanonik (urutan kunci stabil), dan diuji untuk determinisme.

Status WP-02: grant `INSERT` langsung pada `audit.audit_events` masih ada dan `audit.append_event` bergantung pada owner migrasi yang memiliki `BYPASSRLS`. Keduanya belum menjadi satu jalur tulis yang tertutup. Keputusan dan implementasi ada di ADR-015 pada WP-03.

## 7. Seed

Seed harus idempotent dan tidak memuat rahasia.

| Seed | Isi |
|---|---|
| Permission | Katalog semua izin `<modul>:read/post` dan izin submenu sensitif |
| Role sistem | `company_admin`, `area_manager`, `noc_operator`, `field_technician`, `viewer`, `auditor`, `requester` |
| Peran platform | `platform_owner`, `platform_support`, `platform_security` |
| Metric definitions | Kode metrik host/container |
| Template notifikasi | Template sistem dengan placeholder |
| Platform settings | Locale default `en` (didukung `en`, `id`), timezone, kebijakan retensi |
| Feature flags | Flag awal, semua aman dinonaktifkan kecuali inti |

Role perusahaan baru diduplikasi dari template role sistem saat onboarding. Izin submodul sensitif menggantikan izin modul untuk submenu tersebut, sesuai [matriks izin](../../security/matriks-izin.md).

Jumlah grant seed untuk data uji dua perusahaan adalah **162 baris `core.role_permissions` per perusahaan (324 total)**. Angka ini bukan 64 izin dikali 7 role: `post` mencakup `read`, dan submodul sensitif memakai izin submodul. Rincian per role perusahaan: `company_admin` 61, `area_manager` 31, `noc_operator` 26, `field_technician` 10, `viewer` 10, `auditor` 18, `requester` 6.

Contoh seed permission:

```sql
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive)
VALUES
  (gen_random_uuid(), 'AC', 'read', 'Baca modul aset', false),
  (gen_random_uuid(), 'AC', 'post', 'Tulis modul aset', false),
  (gen_random_uuid(), 'AD06', 'post', 'Ubah firewall', true),
  (gen_random_uuid(), 'AH04', 'post', 'Restore konfigurasi', true)
ON CONFLICT (module_code, action) DO NOTHING;
```

## 8. SQLx di Rust

- Query memakai makro `sqlx::query!` / `query_as!` dengan pengecekan saat kompilasi.
- Build di CI memakai database migrasi kosong atau `.sqlx` offline cache.
- Tidak ada string SQL yang disusun dari input pengguna. Sort/filter memakai allowlist.
- Transaksi diawali `BEGIN`, lalu `SET LOCAL app.company_id`, `app.user_id`, `app.request_id`.
- Repository mengembalikan error domain, bukan error SQL mentah.
- `PgPool` memiliki batas koneksi, timeout acquire, statement cache, dan health check.

Contoh:

```rust
let mut tx = pool.begin().await?;
sqlx::query("SELECT set_config('app.company_id', $1, true)")
    .bind(company_id.to_string())
    .execute(&mut *tx)
    .await?;

let assets = sqlx::query_as!(
    AssetRow,
    r#"
    SELECT id, company_id, area_id, location_id, asset_tag, name, status
    FROM asset.assets
    WHERE company_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT $2
    "#,
    company_id,
    limit
)
.fetch_all(&mut *tx)
.await?;

tx.commit().await?;
```

## 9. Larangan

- Tidak memakai `prisma db push` di staging/produksi.
- Tidak mengedit database secara manual tanpa migrasi.
- Tidak menjalankan DDL dari akun aplikasi.
- Tidak menyimpan password/token di seed atau `.env` yang di-commit.
- Tidak memakai `SELECT *` di kode produksi.
- Tidak membuat index tanpa alasan query yang jelas.
- Tidak menghapus audit atau riwayat aset.
- Tidak mengandalkan rollback database sebagai satu-satunya rencana pemulihan; selalu backup sebelum migrasi berisiko.

## 10. Checklist migrasi rilis

- [ ] Migrasi diuji dari database kosong.
- [ ] Migrasi diuji dari salinan data staging.
- [ ] Backward-compatible dengan versi aplikasi sebelumnya.
- [ ] RLS dan grant diperbarui.
- [ ] Index baru dianalisis dampaknya.
- [ ] Backup terbaru tersedia.
- [ ] Rencana rollback aplikasi jelas.
- [ ] Tidak ada rahasia di SQL atau seed.
- [ ] Audit event untuk perubahan konfigurasi kritis tersedia.
