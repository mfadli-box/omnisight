# Osc_base — `prisma/schema/cluster_mail.prisma`

> Dokumen detail cluster **MAIL** — Mail mandiri (`mail_*`).
> 🔗 Kembali ke [database/README.md](README.md).
> Rencana modul: [../planning/app_collab.md](../planning/app_collab.md).

## 1. Ringkasan

Cluster MAIL menyimpan akun email (SMTP/IMAP), pesan keluar/masuk, dan lampiran.
Berbeda dari dispatcher notifikasi `APP06` — ini kotak surat mandiri dari UI.

## 2. Model

### 2.1 `mail_account`
- `@@unique([company_id, address])`; `smtp_host`/`smtp_port`/`smtp_tls`,
  `imap_host`/`imap_port`, `username`, `secret_enc` (terenkripsi).

### 2.2 `mail_message`
- `account_id`? → `mail_account`; `direction` ∈ `IN | OUT`;
  `sender`, `recipients`/`cc`/`bcc` (Json), `subject`, `body`,
  `status` ∈ `QUEUED | SENT | FAILED | RECEIVED`, `sent_at`.
- Indeks `[company_id, created_at]` (kandidat retensi).

### 2.3 `mail_attachment`
- `onDelete: Cascade` dari `mail_message`; `file_id`? (→ `doc_file`), `name`,
  `size_bytes` (BigInt), `mime`, `path`.

## 3. Relasi Inti

```text
mail_account (1) ──► (N) mail_message (1) ──► (N) mail_attachment
```

## 4. Catatan

- Pengiriman memakai `net/smtp` (stdlib); kredensial wajib `secret_enc`.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
