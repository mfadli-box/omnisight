# Planning `File Manager` & `Kolaborasi` (Chat, Mail, Announcement/News)

> Rencana **modul kolaborasi & berkas** yang belum tercakup modul lain.
> Melengkapi `APP06` (Notification) dan `DOC` (Document).
> **Status DB: sudah dibangun** (`doc_folder/file/version/share/quota`, `tim_*`,
> `app_announcement*`) — lihat [cluster_doc.md](../database/cluster_doc.md) dan
> [cluster_tim.md](../database/cluster_tim.md) (cluster TIM menggabungkan chat +
> mail). Backend/frontend menyusul.
> 🔗 Kembali ke [planning/README.md](README.md).

## 1. Latar Belakang

Hasil [gap-analysis.md](gap-analysis.md) menemukan fitur yang **belum masuk
perencanaan**: manajemen berkas pengguna, chat internal, pengiriman mail
(mandiri), dan pengumuman/news. Dokumen ini menutup gap perencanaan tersebut.

## 2. Ruang Lingkup

| Fitur | Ringkas | Kemungkinan kode |
|---|---|---|
| **File Manager** | CRUD berkas/folder per-user & per-company, unggah, unduh, rename, move, hapus, share (tautan/ACL), kuota, versi, preview, pemindaian antivirus, storage lokal/S3. | `DOC` (perluas) |
| **Chat** | Percakapan internal antar-user/kanal, pesan realtime via WebSocket, lampiran, read-state, mention. | `TIM` — Chat |
| **Mail** | Kotak masuk/sent internal + pengiriman email (SMTP) mandiri dari UI; berbeda dari dispatcher notifikasi `APP06`. | `TIM` — Mail |
| **Announcement/News** | Pengumuman & berita internal dengan target (semua/company/role), jadwal tayang, read-tracking; ringkasan di dashboard. | `ANN` |

> Kode final ditetapkan saat aplikasi mulai dikerjakan.

## 3. Model Database (usulan)

Semua model mengikuti konvensi [database/README.md](../database/README.md#4-konvensi-model)
(`id` uuid, `created_at`/`updated_at`, `is_active`, prefix cluster).

### 3.1 File Manager (cluster `doc_*`)
| Model | Keterangan |
|---|---|
| `doc_folder` | Folder hierarkis: `parent_id`?, `name`, `owner_id`, `company_id`, `path`. `@@unique([company_id, parent_id, name])`. |
| `doc_file` | Berkas: `folder_id`?, `name`, `mime`, `size`, `checksum`, `storage` (LOCAL/S3), `path`, `version`, `owner_id`, `scan_status`. |
| `doc_file_version` | Riwayat versi: `file_id`, `version`, `size`, `checksum`, `path`, `created_by`. |
| `doc_share` | Berbagi: `file_id`/`folder_id`, `grantee_user_id`?/`grantee_company_id`?, `access` (VIEW/EDIT), `token`?, `expires_at`?. |
| `doc_quota` | Kuota per-user/company: `scope`, `owner_id`/`company_id`, `quota_bytes`, `used_bytes`. |

### 3.2 Chat (cluster `tim_*` — gabung dengan Mail)
| Model | Keterangan |
|---|---|
| `tim_room` | Kanal/DM: `type` (DM/GROUP), `name`?, `company_id`, `created_by`. |
| `tim_member` | Anggota: `room_id`, `user_id`, `role`, `last_read_at`. |
| `tim_message` | Pesan: `room_id`, `sender_id`, `body`, `attachment_id`? (→ `doc_file`), `sent_at`. Indeks `[room_id, sent_at]` (retensi). |
| `tim_reaction` | Reaksi: `message_id`, `user_id`, `emoji`. |

### 3.3 Mail (cluster `tim_*` — digabung ke TIM)
| Model | Keterangan |
|---|---|
| `tim_account` | Akun SMTP/IMAP: `name`, `address`, `smtp_host/port/tls`, `username`, `secret_enc`, `is_active`. |
| `tim_email` | Pesan: `account_id`, `direction` (IN/OUT), `sender`, `recipients` (Json), `cc`/`bcc` (Json)?, `subject`, `body`, `status`, `sent_at`. |
| `tim_attachment` | Lampiran: `message_id`, `file_id`? (→ `doc_file`), `name`, `size`, `mime`. |

### 3.4 Announcement/News (cluster `app_*` atau `news_*`)
| Model | Keterangan |
|---|---|
| `app_announcement` | Pengumuman: `title`, `body` (TEXT/markdown), `category`, `target_type` (ALL/COMPANY/ROLE), `target_id`?, `publish_at`, `expire_at`?, `pinned`, `created_by`. |
| `app_announcement_read` | Pelacakan baca: `announcement_id`, `user_id`, `read_at`. `@@unique([announcement_id, user_id])`. |

## 4. Backend (osc_rest)

- Skeleton `osc_rest/skeleton/{doc,chat,mail,app}/` mengikuti pola `appNN/`
  (handler/usecase/repository/template) dan [konvensi](../development/conventions.md).
- Unggah berkas memakai `backbone/upload.go` (kategori id, whitelist ekstensi) —
  perlu didaftarkan & ditambah pemindaian.
- Chat realtime via WebSocket (grup `auths`), mirip jalur terminal/PAM.
- Mail memakai `net/smtp` (stdlib) + enkripsi kredensial (`secret_enc`).

## 5. Frontend (osc_site)

- File Manager: halaman `/DOC/files` (list/grid, breadcrumb, drag-drop, preview,
  share dialog, kuota).
- Chat: panel `/TIM/chat` (daftar kanal, thread, composer, indikator online).
- Mail: `/TIM/mail` (inbox/sent/compose).
- Announcement: `/ANN` + kartu ringkasan di dashboard.

## 6. Dependensi

- `APP03` (user), `APP02` (company), `APP06` (notifikasi mail/chat opsional),
  `DOC` (penyimpanan berkas).

## 7. Roadmap

| Tahap | Isi |
|---|---|
| A | DB: model File Manager (`doc_*`) + Announcement (`app_announcement*`). |
| B | Backend + UI File Manager & Announcement. |
| C | Chat (model `tim_room`/`tim_member`/`tim_message`/`tim_reaction` + WebSocket + UI). |
| D | Mail (model `tim_account`/`tim_email`/`tim_attachment` + SMTP + UI). |

> Non-goal awal: federasi eksternal (Matrix/XMPP), IMAP sync penuh, real-time
> video. Fokus internal dulu.
