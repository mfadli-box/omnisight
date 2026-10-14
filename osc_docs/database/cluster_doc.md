# Osc_base — `prisma/schema/cluster_doc.prisma`

> Dokumen detail cluster **DOC** — Document & Kolaborasi (`doc_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster DOC menyimpan repositori dokumen, versi berkas, dan tanda tangan.

## 2. Model

### 2.1 `doc_document`
- `@@unique([company_id, code])`; `title`, `category`, `description`, `owner_id`,
  `is_active`.

### 2.2 `doc_version`
- `@@unique([document_id, version])`; `onDelete: Cascade` dari `doc_document`.
- `file_path`, `mime_type`, `size_bytes` (BigInt), `checksum`, `change_note`.

### 2.3 `doc_sign`
- `onDelete: Cascade` dari `doc_document`; relasi opsional ke `doc_version`.
- `user_id`, `status` ∈ `PENDING | SIGNED | REJECTED`, `comment`, `signed_at`.

## 3. Relasi Inti

```text
doc_document (1) ──► (N) doc_version (1) ──► (N) doc_sign
             └──► (N) doc_sign
```

## 4. Catatan

- Unggah berkas memakai `UploadHandler` (`osc_rest/backbone/upload.go`) — belum
  diregistrasi ke route.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
