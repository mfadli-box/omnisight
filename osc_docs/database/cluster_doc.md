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

### 2.4 `doc_folder` — File Manager (hierarkis)
- `@@unique([company_id, parent_id, name])`; relasi diri `FolderTree`
  (`parent_id`) + `doc_file[]`.

### 2.5 `doc_file`
- `folder_id` → `doc_folder`; `mime`, `size_bytes` (BigInt), `checksum`,
  `storage` ∈ `LOCAL | S3`, `version`, `scan_status` ∈
  `PENDING | CLEAN | INFECTED | SKIPPED`.

### 2.6 `doc_file_version`
- `@@unique([file_id, version])`; `onDelete: Cascade` dari `doc_file`;
  `size_bytes`, `checksum`, `path`, `created_by`.

### 2.7 `doc_share`
- Berbagi berkas/folder: `file_id`?/`folder_id`?, `grantee_user_id`?/
  `grantee_company_id`?, `access` ∈ `VIEW | EDIT`, `token`?, `expires_at`?.

### 2.8 `doc_quota`
- `@@unique([company_id, scope, owner_id])`; `scope` ∈ `USER | COMPANY`,
  `quota_bytes`, `used_bytes` (BigInt).

## 3. Relasi Inti

```text
doc_document (1) ──► (N) doc_version (1) ──► (N) doc_sign
             └──► (N) doc_sign

doc_folder (1) ──► (N) doc_file (1) ──► (N) doc_file_version
doc_folder (self, parent_id/parent-children "FolderTree")
doc_share / doc_quota (berdiri sendiri, FK kasar ke file/folder/owner)
```

## 4. Catatan

- Unggah berkas memakai `UploadHandler` (`osc_rest/backbone/upload.go`) — belum
  diregistrasi ke route. Rencana File Manager: [../planning/app_collab.md](../planning/app_collab.md).
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
