# Osc_base — `prisma/schema/cluster_tim.prisma`

> Dokumen detail cluster **TIM** — Tim & Kolaborasi (`tim_*`).
> Gabungan cluster **CHAT** + **MAIL** (model diseragamkan berprefiks `tim_`).
> 🔗 Kembali ke [database/README.md](README.md).
> Rencana modul: [../planning/app_collab.md](../planning/app_collab.md).

## 1. Ringkasan

Cluster TIM mencakup dua kemampuan kolaborasi:

- **Chat internal** — kanal/percakapan langsung (DM), keanggotaan, pesan, dan
  reaksi. Pesan realtime dikirim via WebSocket (rencana).
- **Mail mandiri** — akun email (SMTP/IMAP), pesan keluar/masuk, dan lampiran.
  Berbeda dari dispatcher notifikasi `APP06` — ini kotak surat mandiri dari UI.

## 2. Model

### 2.1 Chat

#### `tim_room`
- `type` ∈ `DM | GROUP`; `name`?, `created_by`, `company_id`.

#### `tim_member`
- `@@unique([room_id, user_id])`; `onDelete: Cascade` dari `tim_room`.
- `role` ∈ `MEMBER | ADMIN`; `last_read_at`.

#### `tim_message`
- `onDelete: Cascade` dari `tim_room`; `sender_id`, `body`, `attachment_id`
  (opsional → `doc_file`), `sent_at`.
- Indeks `[room_id, sent_at]` (kandidat retensi).

#### `tim_reaction`
- `@@unique([message_id, user_id, emoji])`; `onDelete: Cascade` dari
  `tim_message`.

### 2.2 Mail

#### `tim_account`
- `@@unique([company_id, address])`; `smtp_host`/`smtp_port`/`smtp_tls`,
  `imap_host`/`imap_port`, `username`, `secret_enc` (terenkripsi).

#### `tim_email`
- `account_id`? → `tim_account`; `direction` ∈ `IN | OUT`;
  `sender`, `recipients`/`cc`/`bcc` (Json), `subject`, `body`,
  `status` ∈ `QUEUED | SENT | FAILED | RECEIVED`, `sent_at`.
- Indeks `[company_id, created_at]` (kandidat retensi).

#### `tim_attachment`
- `onDelete: Cascade` dari `tim_email`; `file_id`? (→ `doc_file`),
  `name`, `size_bytes` (BigInt), `mime`, `path`.

## 3. Relasi Inti

```text
tim_room (1) ──► (N) tim_member
          └──► (N) tim_message (1) ──► (N) tim_reaction

tim_account (1) ──► (N) tim_email (1) ──► (N) tim_attachment
```

## 4. Catatan

- Pesan/telemetri ber-retensi (lihat `retention.go`).
- Pengiriman mail memakai `net/smtp` (stdlib); kredensial wajib `secret_enc`.
- Cluster ini lahir dari penggabungan cluster CHAT + MAIL; skema dimuat ulang
  sebagai **baseline tunggal** `20261015102113_init` (lihat
  [README.md](README.md#5-manajemen-migrasi)).
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
