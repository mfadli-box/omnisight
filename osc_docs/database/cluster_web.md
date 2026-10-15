# Osc_base — `prisma/schema/cluster_web.prisma`

> Dokumen detail cluster **WEB** — Web/Proxy (`web_*`).
> 🔗 Kembali ke [database/README.md](README.md).
>
> ✅ **Status: sudah dibangun.** Seluruh 21 model cluster `web_*` telah terpasang di `prisma/schema/cluster_web.prisma` beserta migrasinya. Catatan "rencana/belum dibangun" di bawah bersifat historis.

## 1. Ringkasan

Cluster WEB menyimpan virtual host/reverse proxy, sertifikat TLS, upstream,
snippet/template/location, backup/export, deploy cluster, dan metrik node web.

## 2. Model

### 2.1 `web_vhost`
- `@@unique([company_id, server_name])`; `listen_port` default `443`, `ssl`, `root`.

### 2.2 `web_certificate`
- `common_name`, `issuer`, `serial`, `not_before`, `not_after`, `fingerprint`.
- `status` ∈ `VALID | EXPIRING | EXPIRED | REVOKED`; indeks `not_after` untuk
  pemantauan kedaluwarsa.

### 2.3 `web_upstream`
- `@@index([vhost_id])`; `target_url`, `weight`, `health_status`.
- `onDelete: Cascade` dari `web_vhost`.

### 2.4 Rencana — Web Server, TLS/ACME, Domain & DNS

Modul `WEB` diproyeksikan menjadi **manajemen web server/reverse proxy + domain
& DNS** (ala Nginx UI, lihat [../planning/app_web.md](../planning/app_web.md)).
Model tambahan (**sudah dibangun**):

| Model | Isi pokok |
|---|---|
| `web_server` | Host nginx (`agent_id`, `base_dir`, `config_path`, `nginx_version`, `status`, `managed`). |
| `web_vhost` (perluas) | `server_id`, `type` (PROXY/STATIC/REDIRECT/DEAD/NOT_FOUND), `template_id`?, `cert_id`?, `access_list_id`?, `upstream_id`?, `redirect_to`?, `advanced`, `websocket`, `hsts`, `force_ssl`, `proxy_headers` (Json)?, `default_site`, `enabled`, `revision_id`?. |
| `web_location` | Daftar `location`/path: `vhost_id`, `path`, `match` (PREFIX/EXACT/REGEX), `type` (PROXY/STATIC/REDIRECT), `upstream_id`?/`target`?, `root`?, `redirect_to`?, `options` (Json)?, `sort`. |
| `web_snippet` | Snippet `include`: `server_id`?, `name`, `content` (TEXT), `is_active`. |
| `web_template` | Template config vhost: `name`, `type`, `content` (TEXT), `is_default`. |
| `web_stream` | Stream L4 (TCP/UDP), listen_port, target/upstream. |
| `web_upstream` (perluas) | `server_id`, `name`, `strategy`, `targets` (Json), health check. |
| `web_access_list` / `web_access_entry` | Basic-auth/IP allow-deny + `satisfy` (ANY/ALL) + pass-auth (`auth_forward_url`/`auth_forward_headers`). |
| `web_certificate` (perluas) | `source` (MANUAL/ACME/SELF_SIGNED), `provider`, `challenge` (HTTP01/DNS01), `dns_provider_id`?, `auto_renew`, `ari_enabled`, `renew_at`, `cert_path`/`key_path`, `key_type` (RSA/EC), `ocsp_must_staple`, `wildcard`, `sans` (Json), `last_error`. |
| `web_acme_account` | Akun ACME (`email`, `provider`, `secret_enc`). |
| `web_dns_provider` | Provider DNS (`provider`, `credentials_enc`). |
| `web_domain` | Domain: registrar, `expiry_date` (WHOIS), `nameservers`, `dns_provider_id`, `status`. |
| `web_dns_record` | Record DNS (A/AAAA/CNAME/MX/TXT/NS/SRV/CAA) + `group`, `ddns`, `last_synced_at`; `name` mendukung IDN (punycode). |
| `web_config_revision` | Revisi config (GLOBAL/VHOST/STREAM) + checksum → rollback. |
| `web_change` | Audit perubahan (APPLY/RELOAD/ROLLBACK/CERT_*/DNS_UPDATE/DEPLOY/BACKUP/RESTORE). |
| `web_access_log` | Baris log akses/error nginx terparse (telemetry, retensi pendek). |
| `web_access_stat` | Agregat analitik (PATH/METHOD/STATUS/REFERER/UA/IP) per bucket. |
| `web_server_metric` | Metrik node: `server_id`, `ts`, CPU/mem/load/disk/net (telemetry pendek). |
| `web_backup` | Backup/export: `server_id`?, scope (CONFIG/FULL), kind (EXPORT/IMPORT), path, `encrypted`, checksum, size, status, schedule. |
| `web_deploy` | Cluster deploy/mirror: `vhost_id`?/`server_id`?, `target_server_id`, status, message. |

## 3. Relasi Inti

```text
web_server (1) ──► (N) web_vhost · web_stream · web_upstream · web_certificate · web_config_revision
web_server (1) ──► (N) web_snippet · web_server_metric · web_backup
web_vhost (1) ──► (N) web_upstream · web_location
web_vhost ──► web_template (template_id)?
web_vhost (1) ──► (N) web_access_list ──► web_access_entry   (cert_id → web_certificate)
web_vhost ──► web_certificate (reverse index cert → vhost/stream)
web_server (1) ──► (N) web_access_log · web_access_stat
web_domain (1) ──► (N) web_dns_record ── web_dns_provider ──► web_certificate (DNS-01/wildcard)
web_acme_account ──► web_certificate
web_deploy ──► web_server (target) · web_vhost (asal)
```

## 4. Catatan

- Kredensial DNS/ACME (`credentials_enc`/`secret_enc`) dan private key
  **terenkripsi/backend-only**.
- `web_change`/`web_access_log`/`web_server_metric` beretensi (`retention.go`);
  `web_config_revision` dibatasi jumlah; `web_access_stat` agregat jangka panjang;
  `web_snippet`/`web_template`/`web_location` persisten.
- `web_backup` menyimpan export/backup **terenkripsi** (`encrypted`); restore/import
  via **safe apply** (`nginx -t` + rollback).
- Perubahan konfigurasi via agen (**safe apply**: `nginx -t` + reload + rollback);
  **cluster deploy/mirror** (`web_deploy`) apply per node.
- Keamanan panel (2FA/passkey, allowlist IP, ban login) **diwarisi** auth platform
  ([../planning/app_sys.md](../planning/app_sys.md)) — bukan model `web_*`.
- Model tambahan §2.4 **sudah dibangun**; rincian [../planning/app_web.md](../planning/app_web.md).
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
