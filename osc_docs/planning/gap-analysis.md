# Gap Analysis - Fitur yang Diminta

Berdasarkan permintaan review, berikut hasil gap analysis untuk fitur User File Management, User Guide, Notification/Chat/Mail/Announcement/News.

## 1. User File Management

**Status**: Ada (parsial). 
- Implementasi: `/files/[...path]` route di `osc_site/src/app/files/[...path]/route.ts` (auth + boundary check). 
- Gap: Tidak ada manajemen file UI (upload/list/delete/share/rename/move/permission per-folder/company). Tidak ada quota, versioning, preview (selain pdf/png/jpg). Tidak ada antivirus/scanning. Tidak ada eksternal storage (S3). Tidak ada modul APP/SYS khusus untuk user file management.

**Rekomendasi**: Tambah fitur di planning (mis. DOC/File manager module) atau perluas `app_sys`/modul baru.

## 2. User Guide

**Status**: Tidak ada. Tidak ditemukan dokumentasi user guide (hanya dev docs: README, conventions, run, security, docker-compose). Tidak ada help/tutorial di frontend.

**Rekomendasi**: Tambah `osc_docs/user-guide.md`, atau fitur help inline.

## 3. Notification, Chat, Mail, Announcement/News

**Status**: Hanya perencanaan, belum implementasi (lihat APP06 di app_sys.md).
- Notification: direncanakan APP06 (kanal email/webhook/Telegram/Slack, template, rules). Belum ada kode.
- Mail/SMTP: tidak ada implementasi pengiriman.
- Chat: tidak ada (internal chat, socket chat).
- Announcement/News: status page punya `is_announcement` (OBS), tapi tidak ada news feed internal.

**Rekomendasi**: Prioritaskan APP06 + channel email/SMTP.

## 4. Monitoring/Management Tools (Docker/VM/MikroTik/Asset/Bastion/Web)

Sudah ada perencanaan detail di app_*.md (POD vs Dockge/Arcane, OBS vs Beszel/Uptime-Kuma, NET vs LibreNMS, SEC+VMS vs Wazuh/Proxmox, AMM vs Snipe-IT, PAM vs JumpServer, WEB vs Nginx-UI/NPM). Gap detail sudah dibahas sebelumnya. Untuk implementasi, perlu membangun sesuai planning.

## 5. Security Re-check

Sudah dilakukan hardening: token hashing, logout revoke, files route verifikasi backend, hapus storageKey fallback, TOTP decrypt. Sisa: token plaintext di DB sudah di-hash (kita ubah ke hash), captcha client-side perlu verifikasi server, rate-limit in-memory (multi-replica), CSP unsafe-inline (trade-off). Lihat security.md.

## 6. Dockerization

Sudah: docker-compose host (base/rest/site), docker-compose agent (osc_auto), Dockerfiles ada. Dokumentasi di osc_docs/docker-compose.md, deploy di osc_docs/deploy/.
