# Osc_base — `prisma/schema/cluster_chat.prisma`

> Dokumen detail cluster **CHAT** — Chat internal (`chat_*`).
> 🔗 Kembali ke [database/README.md](README.md).
> Rencana modul: [../planning/app_collab.md](../planning/app_collab.md).

## 1. Ringkasan

Cluster CHAT menyimpan kanal/percakapan langsung (DM), keanggotaan, pesan, dan
reaksi. Pesan realtime dikirim via WebSocket (rencana).

## 2. Model

### 2.1 `chat_room`
- `type` ∈ `DM | GROUP`; `name`?, `created_by`, `company_id`.

### 2.2 `chat_member`
- `@@unique([room_id, user_id])`; `onDelete: Cascade` dari `chat_room`.
- `role` ∈ `MEMBER | ADMIN`; `last_read_at`.

### 2.3 `chat_message`
- `onDelete: Cascade` dari `chat_room`; `sender_id`, `body`, `attachment_id`
  (opsional → `doc_file`), `sent_at`.
- Indeks `[room_id, sent_at]` (kandidat retensi).

### 2.4 `chat_reaction`
- `@@unique([message_id, user_id, emoji])`; `onDelete: Cascade` dari
  `chat_message`.

## 3. Relasi Inti

```text
chat_room (1) ──► (N) chat_member
          └──► (N) chat_message (1) ──► (N) chat_reaction
```

## 4. Catatan

- Pesan/telemetri ber-retensi (lihat `retention.go`).
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
