# Skema Layanan, Konten, Audit, dan Platform

Schema: `service`, `content`, `audit`, dan `platform`.

## 1. Layanan dan helpdesk

### `service.ticket_categories`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `parent_id` | uuid null | |
| `name` | varchar(120) | |
| `default_priority` | varchar(16) | |
| `default_sla_id` | uuid null | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | |

### `service.sla_policies`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `name` | varchar(120) | |
| `response_minutes` | integer | |
| `resolution_minutes` | integer | |
| `business_hours` | jsonb | Kalender layanan |
| `pause_on_pending` | boolean | |
| `created_at`, `updated_at` | timestamptz | |

### `service.tickets`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `area_id` | uuid null | |
| `location_id` | uuid null | |
| `requester_user_id` | uuid | |
| `assignee_user_id` | uuid null | |
| `category_id` | uuid null | |
| `sla_policy_id` | uuid null | |
| `title` | varchar(200) | |
| `description` | text | Markdown disanitasi |
| `priority` | varchar(16) | `low`, `normal`, `high`, `urgent` |
| `status` | varchar(24) | `new`, `open`, `pending`, `resolved`, `closed`, `cancelled` |
| `source` | varchar(24) | `portal`, `email`, `api`, `phone` |
| `due_at` | timestamptz null | |
| `first_response_at` | timestamptz null | |
| `resolved_at`, `closed_at` | timestamptz null | |
| `version` | integer | |
| `created_at`, `updated_at` | timestamptz | |

Aturan:

- Requester hanya dapat melihat tiket miliknya atau tiket di scope-nya.
- Perubahan status dan assignee dicatat di audit.
- SLA dihitung dari kalender layanan; pause mengikuti kebijakan.
- Deskripsi disanitasi untuk mencegah XSS.

### `service.ticket_comments`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `ticket_id` | uuid fk | |
| `author_user_id` | uuid | |
| `visibility` | varchar(16) | `public`, `internal` |
| `body` | text | Disanitasi |
| `created_at`, `updated_at` | timestamptz | |

### `service.ticket_attachments`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `ticket_id` | uuid fk | |
| `file_id` | uuid fk | `core.files` |
| `created_by` | uuid | |
| `created_at` | timestamptz | |

### `service.contracts`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `vendor_id` | uuid fk | `core.vendors` |
| `contract_no` | varchar(120) | |
| `type` | varchar(48) | `support`, `license`, `service`, `other` |
| `start_at`, `end_at` | date | |
| `value` | numeric(18,2) null | |
| `currency` | char(3) | |
| `status` | varchar(16) | `active`, `expiring`, `expired`, `terminated` |
| `document_file_id` | uuid null | |
| `renewal_notice_days` | integer | Default 30 |
| `created_at`, `updated_at` | timestamptz | |

### `service.kb_articles`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `slug` | varchar(160) | Unik per perusahaan |
| `title` | varchar(200) | |
| `body` | text | Markdown disanitasi |
| `visibility` | varchar(16) | `internal`, `public` |
| `status` | varchar(16) | `draft`, `published`, `archived` |
| `author_user_id` | uuid | |
| `created_at`, `updated_at` | timestamptz | |

### `service.kb_revisions`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `article_id` | uuid fk | |
| `body` | text | |
| `edited_by` | uuid | |
| `created_at` | timestamptz | |

## 2. Konten

### `content.articles`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `slug` | varchar(160) | Unik per perusahaan |
| `title` | varchar(200) | |
| `excerpt` | varchar(400) null | |
| `body` | text | Markdown/HTML tersanitasi |
| `cover_file_id` | uuid null | |
| `status` | varchar(16) | `draft`, `scheduled`, `published`, `archived` |
| `visibility` | varchar(16) | `internal`, `public` |
| `published_at` | timestamptz null | |
| `author_user_id` | uuid | |
| `seo` | jsonb | Judul, deskripsi, canonical |
| `version` | integer | |
| `created_at`, `updated_at` | timestamptz | |

### `content.pages`

Halaman statis seperti tentang, kebijakan privasi, atau halaman status.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `slug` | varchar(160) | |
| `title` | varchar(200) | |
| `body` | text | |
| `status` | varchar(16) | |
| `visibility` | varchar(16) | |
| `published_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

### `content.notification_templates`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `code` | varchar(64) | Unik per perusahaan |
| `channel` | varchar(16) | `in_app`, `email`, `webhook` |
| `subject` | varchar(200) null | |
| `body` | text | Template dengan variabel |
| `variables_schema` | jsonb | Validasi variabel |
| `status` | varchar(16) | `active`, `disabled` |
| `created_at`, `updated_at` | timestamptz | |

Aturan: template tidak boleh mengeksekusi kode; variabel di-escape sesuai kanal. Email memakai HTML tersanitasi.

### `content.notifications`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `user_id` | uuid | |
| `template_code` | varchar(64) null | |
| `channel` | varchar(16) | |
| `payload` | jsonb | Data non-rahasia |
| `status` | varchar(16) | `queued`, `sent`, `failed`, `read` |
| `dedup_key` | varchar(128) null | |
| `scheduled_at` | timestamptz null | |
| `sent_at` | timestamptz null | |
| `read_at` | timestamptz null | |
| `created_at` | timestamptz | |

Constraint: unique `(company_id, dedup_key)` jika dedup_key tidak null.

### `content.notification_deliveries`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `notification_id` | uuid fk | |
| `attempt` | integer | |
| `provider` | varchar(32) | `smtp`, `webhook`, `inapp` |
| `status` | varchar(16) | `success`, `failed` |
| `response_code` | integer null | |
| `error_code` | varchar(48) null | |
| `started_at`, `finished_at` | timestamptz | |

### `content.user_notification_preferences`

| Kolom | Tipe | Catatan |
|---|---|---|
| `user_id` | uuid | |
| `company_id` | uuid fk | |
| `channel` | varchar(16) | |
| `category` | varchar(32) | `alert`, `ticket`, `access`, `security`, `system` |
| `enabled` | boolean | |
| `updated_at` | timestamptz | |

Primary key: `(user_id, company_id, channel, category)`.

## 3. Audit trail

### `audit.audit_events`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `chain_key` | varchar(64) | UUID perusahaan atau `platform` |
| `seq` | bigint | Urutan dalam chain |
| `company_id` | uuid null | Null untuk aksi platform |
| `occurred_at` | timestamptz | |
| `actor_type` | varchar(16) | `user`, `system`, `agent`, `api_key` |
| `actor_user_id` | uuid null | |
| `actor_label` | varchar(160) null | Untuk system/agent |
| `action` | varchar(64) | `create`, `update`, `delete`, `login`, `approve`, `deploy`, `restore`, `execute` |
| `module_code` | varchar(16) | `AB04` |
| `entity_type` | varchar(64) | |
| `entity_id` | uuid null | |
| `scope_type` | varchar(16) null | `company`, `area` |
| `scope_id` | uuid null | |
| `request_id` | uuid | |
| `ip` | inet null | |
| `user_agent` | text null | |
| `before` | jsonb null | Field berubah saja, rahasia diredaksi |
| `after` | jsonb null | |
| `metadata` | jsonb | Alasan, approval, referensi |
| `prev_hash` | bytea | |
| `hash` | bytea | SHA-256 dari payload kanonik + prev_hash |

### `audit.audit_chain_heads`

| Kolom | Tipe | Catatan |
|---|---|---|
| `chain_key` | varchar(64) pk | |
| `last_seq` | bigint | |
| `last_hash` | bytea | |
| `updated_at` | timestamptz | |

Cara append:

1. Buka transaksi.
2. `SELECT ... FOR UPDATE` pada `audit_chain_heads` berdasarkan `chain_key`.
3. Hitung `seq = last_seq + 1`.
4. Hitung hash kanonik.
5. Insert `audit_events`.
6. Update `audit_chain_heads`.
7. Commit bersama perubahan domain.

Aturan:

- Aplikasi hanya punya hak `INSERT` dan `SELECT` pada `audit_events`; `UPDATE`/`DELETE` dicabut.
- Rahasia, password, token, dan isi file tidak boleh masuk `before`/`after`.
- `request_id` menghubungkan log aplikasi, audit, dan trace.
- Audit tidak boleh dihapus dari UI. Retensi dijalankan prosedur terkontrol dengan bukti.
- Verifikasi hash chain dijalankan berkala oleh job.

### `audit.security_events`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `source` | varchar(32) | `wazuh`, `omnisight`, `edge` |
| `external_rule_id` | varchar(64) null | |
| `severity` | varchar(16) | |
| `title` | varchar(200) | |
| `description` | text | |
| `src_ip`, `dst_ip` | inet null | |
| `agent_ref` | varchar(120) null | |
| `raw_ref` | text null | Referensi ke Wazuh, bukan salinan penuh |
| `status` | varchar(16) | `new`, `triaged`, `false_positive`, `resolved` |
| `assignee_user_id` | uuid null | |
| `occurred_at` | timestamptz | |
| `created_at` | timestamptz | |

### `audit.access_reviews`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `period_start`, `period_end` | date | |
| `status` | varchar(16) | `draft`, `active`, `completed`, `overdue` |
| `reviewer_user_id` | uuid | |
| `due_at` | timestamptz | |
| `completed_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

### `audit.access_review_items`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `review_id` | uuid fk | |
| `membership_id` | uuid fk | |
| `role_id` | uuid fk | |
| `scope_type`, `scope_id` | varchar(16), uuid null | |
| `decision` | varchar(16) | `pending`, `keep`, `revoke`, `change` |
| `decided_by` | uuid null | |
| `decided_at` | timestamptz null | |
| `note` | text null | |

Keputusan `revoke` menghasilkan aksi pencabutan yang diaudit.

FK komposit `(company_id, review_id)`, `(company_id, membership_id)`, dan
`(company_id, role_id)` memastikan review, membership, dan role berasal dari
perusahaan yang sama.

### `audit.data_retention_policies`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid null | Null untuk kebijakan platform |
| `data_class` | varchar(32) | `metric`, `login`, `audit`, `notification`, `file` |
| `retention_days` | integer | |
| `action` | varchar(16) | `archive`, `delete` |
| `enabled` | boolean | |
| `created_at`, `updated_at` | timestamptz | |

## 4. Platform

### `platform.integration_endpoints`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid null | Null untuk integrasi platform |
| `kind` | varchar(32) | `hris`, `librenms`, `wazuh`, `glpi`, `netbox`, `snipeit`, `jumpserver`, `directus`, `oxidized`, `beszel` dll. |
| `name` | varchar(120) | |
| `base_url` | text | HTTPS, allowlist |
| `credential_ref` | text | Vault |
| `config` | jsonb | Opsi non-rahasia |
| `status` | varchar(16) | `active`, `disabled`, `unhealthy` |
| `last_checked_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

### `platform.integration_links`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `integration_id` | uuid fk | |
| `local_type` | varchar(48) | |
| `local_id` | uuid | |
| `external_type` | varchar(48) | |
| `external_id` | varchar(160) | |
| `sync_direction` | varchar(16) | `in`, `out`, `both` |
| `status` | varchar(16) | `synced`, `pending`, `conflict`, `error` |
| `last_synced_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

Constraint: `UNIQUE (integration_id, local_type, local_id)`.

`integration_id` memiliki FK ke `platform.integration_endpoints(id)`. Trigger
`platform.enforce_integration_link_tenant()` hanya mengizinkan endpoint global
(`company_id IS NULL`) atau endpoint perusahaan yang sama; referensi lintas
perusahaan ditolak dengan SQLSTATE `23503`.

### `platform.webhooks`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `name` | varchar(120) | |
| `url` | text | HTTPS, allowlist, proteksi SSRF |
| `secret_ref` | text | Vault, untuk tanda tangan |
| `events` | jsonb | Daftar event |
| `enabled` | boolean | |
| `last_delivery_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

### `platform.webhook_deliveries`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `webhook_id` | uuid fk | |
| `event_type` | varchar(64) | |
| `payload_ref` | text | Referensi payload, bukan data sensitif |
| `status` | varchar(16) | `pending`, `success`, `failed` |
| `attempt` | integer | |
| `response_code` | integer null | |
| `next_retry_at` | timestamptz null | |
| `created_at`, `finished_at` | timestamptz | |

FK komposit `(company_id, webhook_id)` mencegah delivery menunjuk webhook
perusahaan lain.

### `platform.settings`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid null | Null untuk setting platform |
| `key` | varchar(120) | |
| `value` | jsonb | |
| `is_secret` | boolean | Jika true, `value` hanya referensi vault |
| `updated_by` | uuid null | |
| `updated_at` | timestamptz | |

Constraint: `UNIQUE (company_id, key)`.

Catatan WP-02:

- Baris global memakai `company_id` NULL, misalnya `locale.default`.
- Policy RLS saat ini hanya mengizinkan `company_id = current_setting('app.company_id')`, sehingga baris global tidak terlihat oleh `osc_rest_app`. Visibilitas baca global dan larangan tulis lintas tenant diputuskan di ADR-017.
- Definisi peran platform sementara disimpan sebagai `platform.role.*` sampai ADR-017 diputuskan; sumber definitifnya tetap `permissions.json`.

### `platform.feature_flags`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid null | |
| `key` | varchar(120) | |
| `enabled` | boolean | |
| `config` | jsonb | |
| `updated_by` | uuid null | |
| `updated_at` | timestamptz | |

### `platform.outbox_events`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid null | |
| `aggregate_type` | varchar(48) | |
| `aggregate_id` | uuid | |
| `event_type` | varchar(64) | |
| `payload` | jsonb | Tanpa rahasia |
| `status` | varchar(16) | `pending`, `processing`, `done`, `failed` |
| `available_at` | timestamptz | |
| `attempts` | integer | |
| `created_at`, `processed_at` | timestamptz | |

Outbox diproses notifier `osc_auto` lewat `osc_rest`; kegagalan dikirim ulang dengan backoff.

### `platform.impersonation_sessions`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid fk | |
| `actor_user_id` | uuid | Platform admin |
| `target_user_id` | uuid | |
| `reason` | text | Wajib |
| `approved_by` | uuid null | |
| `started_at`, `ended_at` | timestamptz | |
| `request_id` | uuid | |
| `actions_count` | integer | |

Aturan:

- Impersonasi harus eksplisit, beralasan, dan berbatas waktu.
- Semua aksi selama impersonasi diaudit dengan `actor_type=user` dan metadata impersonasi.
- Default platform admin tidak dapat melihat data bisnis tanpa impersonasi.

## 5. Retensi dan penghapusan

| Data | Retensi contoh | Tindakan |
|---|---|---|
| Metrik raw | 30 hari | Drop partisi |
| Metrik rollup | 1 tahun | Arsip/delete |
| Login attempt | 180 hari | Delete partisi |
| Job run | 90 hari | Delete partisi |
| Notifikasi | 90 hari | Arsip/delete |
| Audit | 2 tahun | Arsip dengan bukti |
| Tiket tertutup | 3 tahun | Arsip |
| File | Mengikuti klasifikasi | Hapus objek + metadata |

Penghapusan harus:

1. Mengikuti kebijakan `audit.data_retention_policies`.
2. Dijalankan job terjadwal dengan idempotency.
3. Mencatat ringkasan eksekusi ke audit.
4. Tidak menghapus data yang sedang dalam sengketa atau investigasi.

## 6. Catatan keamanan

- Audit dan security event tidak memakai HTTP 403; penolakan akses tetap dicatat.
- Semua akses ke rekaman bastion dan file sensitif diaudit.
- Webhook keluar memakai HMAC dan proteksi SSRF.
- Template notifikasi di-escape per kanal.
- Data platform lintas perusahaan hanya untuk Platform Owner dengan kontrol ketat.
