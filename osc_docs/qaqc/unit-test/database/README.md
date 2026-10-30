# Unit Test Database

Status: Disetujui (0.6)

Database adalah sumber kebenaran identitas, akses, inventaris, dan audit. Unit test database memverifikasi migrasi, constraint, RLS, fungsi audit, dan seed pada PostgreSQL sementara.

## 1. Alat

| Kebutuhan | Pilihan |
|---|---|
| Database uji | PostgreSQL ephemeral melalui testcontainers atau container CI |
| Migrasi | `prisma migrate deploy` pada database kosong |
| Tes SQL | pgTAP atau harness SQL khusus |
| Klien | `psql` dengan user aplikasi, bukan superuser |
| Data | Fixture SQL/seed sintetis |

## 2. Cakupan

| Area | Contoh pengujian |
|---|---|
| Migrasi | Dari database kosong dan dari versi sebelumnya |
| Constraint | Foreign key komposit, unique parsial, check `locale` |
| RLS | Tenant hanya melihat datanya, tanpa konteks tidak melihat data |
| Audit | Payload kanonik deterministik, hash chain, append-only |
| Partisi | Routing bulanan, retensi, query lintas partisi |
| Seed | Idempotent, permission dan role sistem lengkap |
| View laporan | Read-only dan tidak membocorkan tenant lain |
| Transaksi | Rollback, isolation, retry pada konflik |

## 3. Matriks RLS wajib

| Skenario | Harapan |
|---|---|
| `SET LOCAL app.company_id = A` | Hanya baris perusahaan A |
| `SET LOCAL app.company_id = B` | Hanya baris perusahaan B |
| Tanpa `app.company_id` | Tidak ada baris |
| Query join lintas perusahaan | Tidak mengembalikan data lintas tenant |
| User `osc_rest_app` | Tunduk RLS, bukan bypass |
| Tabel dengan `FORCE ROW LEVEL SECURITY` | Pemilik tabel tetap tunduk RLS |

## 4. Data uji

- Dua perusahaan: `company-a`, `company-b`.
- Dua area per perusahaan.
- Pengguna sintetis dengan domain `.invalid`.
- Aset dan tiket sintetis.
- Tidak memakai dump produksi atau data pribadi.
- Semua waktu dalam UTC.

## 5. Aturan

- Tes berjalan pada database kosong setiap suite.
- Gunakan transaksi dan rollback bila memungkinkan; reset database untuk kasus migrasi.
- Tes RLS memakai role aplikasi, bukan superuser.
- Jangan menguji detail internal PostgreSQL; uji perilaku yang menjadi kontrak.
- Fungsi audit diuji dengan input yang sama untuk memastikan hash deterministik.
- Seed dijalankan dua kali untuk membuktikan idempotensi.

## 6. Perintah contoh

```bash
prisma migrate deploy
psql "$TEST_DATABASE_URL" -f tests/rls.sql
psql "$TEST_DATABASE_URL" -f tests/audit.sql
```

## 7. Checklist

- [ ] Migrasi dari kosong lulus.
- [ ] Constraint dan foreign key komposit diuji.
- [ ] RLS positif dan negatif diuji dengan role aplikasi.
- [ ] Audit hash chain deterministik.
- [ ] Partisi dan retensi diuji.
- [ ] Seed idempotent.
- [ ] Tidak ada data produksi atau rahasia.
- [ ] Database uji dibersihkan setelah suite.
