# Gap Analysis - Fitur yang Diminta

> **Status terbaru (diperbarui):** lapisan database sudah **lengkap** (290 model
> di 13 cluster). Gap yang tersisa bersifat **implementasi runtime** dan
> **fitur yang belum masuk perencanaan** (kini dicatat di
> [app_collab.md](app_collab.md)). Lihat ringkasan di bawah.

Berdasarkan permintaan review, berikut hasil gap analysis untuk fitur User File Management, User Guide, Notification/Chat/Mail/Announcement/News.

## 1. User File Management

**Status**: DB siap; backend parsial.
- Implementasi: `/files/[...path]` route di `osc_site/src/app/files/[...path]/route.ts` (auth + boundary check). 
- DB: **sudah dibangun** — `doc_folder`, `doc_file`, `doc_file_version`, `doc_share`, `doc_quota` (lihat [cluster_doc.md](../database/cluster_doc.md)).
- Gap: Tidak ada manajemen file UI (upload/list/delete/share/rename/move/permission per-folder/company). Tidak ada quota/versioning runtime, preview (selain pdf/png/jpg), antivirus/scanning, eksternal storage (S3).
- Rencana: **[app_collab.md §3.1](app_collab.md)**.

## 2. User Guide

**Status**: Ada (dasar). File [`../user-guide.md`](../user-guide.md) telah dibuat &
di-link dari [docs README](../README.md). Masih minim — perlu diperkaya
(screenshot, per-modul) dan/atau bantuan inline di frontend.

**Rekomendasi**: Perluas `user-guide.md` seiring modul dibangun.

## 3. Notification, Chat, Mail, Announcement/News

**Status**: DB siap untuk semua; runtime notifikasi & kolaborasi belum.
- Notification: DB **lengkap** (`app_notify_*`, `obs_notify_channel`); runtime
  dispatcher **belum ada** (APP06).
- Mail/SMTP: DB **sudah dibangun** (`mail_*`); runtime SMTP **belum ada** —
  rencana di [app_collab.md §3.3](app_collab.md).
- Chat: DB **sudah dibangun** (`chat_*`); runtime WebSocket **belum ada** —
  rencana di [app_collab.md §3.2](app_collab.md).
- Announcement/News: DB **sudah dibangun** (`app_announcement*`); status page
  OBS tetap punya `is_announcement` — rencana di [app_collab.md §3.4](app_collab.md).

**Rekomendasi**: Prioritaskan APP06 (notifikasi runtime) + mail/SMTP.

## 4. Monitoring/Management Tools (Docker/VM/MikroTik/Asset/Bastion/Web)

DB sudah **lengkap** untuk semua modul. Perencanaan detail ada di app_*.md
(POD vs Dockge/Arcane, OBS vs Beszel/Uptime-Kuma, NET vs LibreNMS,
SEC+VMS vs Wazuh/Proxmox, AMM vs Snipe-IT, PAM vs JumpServer, WEB vs
Nginx-UI/NPM). Gap yang tersisa: **implementasi backend + frontend** sesuai
planning.

## 5. Security Re-check

Sudah dilakukan hardening: token hashing, logout revoke, files route verifikasi backend, hapus storageKey fallback, TOTP decrypt. Sisa: token plaintext di DB sudah di-hash (kita ubah ke hash), captcha client-side perlu verifikasi server, rate-limit in-memory (multi-replica), CSP unsafe-inline (trade-off). Lihat [security.md](../development/security.md).

## 6. Dockerization

Sudah: docker-compose host (`osc_base`/`osc_rest`/`osc_site`), docker-compose agent (`osc_auto`), Dockerfiles ada. Dokumentasi di [docker-compose.md](../docker-compose.md), deploy di [deploy/](../deploy/).
