# Planning `WEB` — Web Server / Reverse Proxy + Domain & DNS (ala Nginx UI)

> Rencana modul **`WEB`**: dari sekadar tabel vhost/proxy menjadi **manajemen
> web server penuh** — **site/vhost**, **reverse proxy**, **stream L4**,
> **upstream/load-balancing**, **access-list**, **editor konfigurasi**, dan
> **sertifikat TLS + ACME (Let's Encrypt) auto-renew** — **plus** manajemen
> **domain & DNS** (registrar, **WHOIS expiry**, record DNS). Penyejajar
> **Nginx UI** (dan sebagian **uptime-kuma** untuk health/expiry). Bagian dari
> [Planning](README.md) · Lihat juga [blueprint](blueprint.md),
> [roadmap](roadmap.md), [checklist](checklist.md), modul terkait
> [NET](app_net.md) (DNS/domain jaringan internal & pemetaan), [OBS](app_obs.md)
> (uptime/status page & alert expiry), [SEC](app_sec.md) (log nginx → SIEM),
> dan `BOT` (agen).

## 1. Tujuan & Lingkup

Konsol tunggal untuk mengelola website, proxy, dan domain:

- **Server web** — daftar host nginx (host/agen) yang dikelola (`web_server`).
- **Sites (vhost)** — reverse proxy / static / redirect; enable/disable tanpa
  hapus; **config editor** (advanced directive) + **`nginx -t`** + reload.
- **Stream (L4)** — TCP/UDP passthrough/load-balance (`web_stream`).
- **Upstream** — grup backend (round-robin/least-conn/ip-hash), health check.
- **Access list** — basic-auth (user/password terenkripsi) & allow/deny IP.
- **Sertifikat TLS** — unggah manual **atau** **ACME** (Let's Encrypt/ZeroSSL,
  HTTP-01/DNS-01), **auto-renew**, pantau kedaluwarsa.
- **Domain & DNS** — data registrar, **tanggal kedaluwarsa (WHOIS)**, server
  nama, **record DNS** via provider API (Cloudflare/Route53/…).
- **Audit & rollback** — setiap perubahan config = revisi + riwayat + rollback.
- **Analitik log akses** — parse access/error nginx → statistik (top path/method/
  status/referer/UA/IP, bandwidth, error rate) + grafik; terpisah dari SIEM `SEC`.
- **Health/uptime** — probe & status page menyatu dengan [OBS](app_obs.md);
  alert kedaluwarsa sertifikat/domain.
- **Wizard site/reverse-proxy** — alur buat terpandu (domain → upstream → TLS →
  apply) + pilih **template config**.
- **Penyetelan proxy lanjutan** — **WebSocket upgrade**, **HSTS**, **force-SSL
  redirect**, **proxy headers**, dan **custom `location`/path routing** (field
  vhost terstruktur + daftar `location`, melampaui kolom `advanced` TEXT).
- **Snippet & include** — snippet konfigurasi yang dipakai ulang + picker
  `include` di editor (`web_snippet`).
- **Template config** — pustaka template vhost (static/proxy/redirect/404) yang
  dipilih saat pembuatan (`web_template`).
- **Monitoring resource node** — CPU/memori/load/disk server web (perluasan
  endpoint ping/stats → `web_server_metric`).
- **Live log viewer** — tail + pencarian log nginx mentah (di luar
  `web_access_log` terparse + statistik).
- **Manajemen versi/upgrade nginx** — deteksi versi + alur upgrade biner nginx
  (opsional).
- **Backup & portabilitas config** — export/import **terenkripsi**, backup
  **full/restore**, + backup terjadwal (`web_backup`).
- **Cluster deploy/mirror** — sebarkan/mirror config ke banyak node + deploy satu
  site ke node jarak jauh (`web_deploy`).
- **Dead host / 404 / default site** — tipe vhost khusus `DEAD`/`NOT_FOUND`
  (custom 404) & default server.
- **Static file browser/upload** — jelajah + unggah berkas pada direktori tersaji.
- **Sertifikat wildcard/SAN** — penerbitan **wildcard** eksplisit via **DNS-01**.
- **Opsi sertifikat** — tipe kunci **RSA/EC**, **OCSP Must-Staple**, **ARI**
  (renewal), **self-signed**, log/galat penerbitan + petunjuk, verifikasi
  **HTTP-01 loopback**.
- **DDNS & grouping record DNS** — pembaruan dinamis, pengelompokan record, & IDN.
- **Access list lanjutan** — `satisfy any/all` + **pass-auth** (forward ke auth
  eksternal).
- **Reverse index sertifikat** — "site/stream mana yang memakai sertifikat ini".
- **Keamanan panel** — **2FA/passkey** + allowlist IP admin + ban login gagal
  (**mewarisi** auth platform OmniSight; lihat [app_sys.md](app_sys.md)).
- **Multi-tenant** — per `company_id`, RBAC OmniSight.

> **Safe apply** (pola [NET](app_net.md)): setiap perubahan konfigurasi
> diuji (`nginx -t`), disimpan sebagai revisi, lalu direload — **rollback
> otomatis** bila gagal.

## 2. Referensi Fitur (Nginx UI · uptime-kuma)

| Area | Referensi | Target `WEB` |
|---|---|---|
| Kelola server/web-host | Nginx UI | ✅ `web_server` |
| Sites (server block) + editor | Nginx UI | ✅ config editor + advanced |
| Enable/disable tanpa hapus | Nginx UI | ✅ |
| Streams (TCP/UDP) | Nginx UI | ✅ `web_stream` |
| Upstream/load-balancing | Nginx UI | ✅ `web_upstream` |
| Redirection & error page | Nginx UI | ✅ (vhost type REDIRECT) |
| Certificates: manual | Nginx UI | ✅ `web_certificate` |
| Certificates: **ACME** + auto-renew | Nginx UI | ✅ (`lego`/`certbot`) |
| DNS-01 challenge (DNS provider) | Nginx UI | ✅ `web_dns_provider` |
| Access list (basic auth/IP) | Nginx UI | ✅ |
| Global config (nginx.conf) | Nginx UI | ✅ (revisi) |
| Cert-expiry monitoring | uptime-kuma, Nginx UI | ✅ (alert via `OBS`) |
| **Domain expiry (WHOIS)** | uptime-kuma | ✅ `web_domain` |
| Uptime monitor & status page | uptime-kuma | ✅ via `OBS` (`obs_check`/`obs_status_page`) |
| Maintenance window | uptime-kuma | ✅ via `OBS` (`obs_maintenance`) |
| Analitik log akses (GoAccess-like) | Nginx UI | ✅ `web_access_stat` (+ raw `web_access_log`) |
| WebSocket/HSTS/force-SSL/headers + `location`/path | Nginx UI | ✅ field vhost + `web_location` |
| Wizard site/reverse-proxy | Nginx Proxy Manager | ✅ alur buat terpandu |
| Snippet + include picker | Nginx UI | ✅ `web_snippet` |
| Template config | Nginx UI / NPM | ✅ `web_template` (pilih saat buat) |
| Backup/restore + export/import | Nginx UI | ✅ `web_backup` (terenkripsi, terjadwal) |
| Cluster deploy/mirror | Nginx UI | ✅ `web_deploy` |
| Resource monitoring node (CPU/mem/load/disk) | Nginx UI | ✅ `web_server_metric` (extend ping/stats) |
| Live log tail/search | Nginx UI | ✅ `/logs/tail` + `/logs/search` |
| Nginx binary upgrade/version | Nginx UI | ✅ endpoint versi + upgrade opsional |
| Dead host / 404 / default site | Nginx Proxy Manager | ✅ vhost type `DEAD`/`NOT_FOUND` |
| Static file browser/upload | Nginx UI | ✅ endpoint `files`/`files/upload` |
| Wildcard/SAN cert (DNS-01) | Nginx UI | ✅ wildcard eksplisit |
| Cert options (RSA/EC, OCSP, ARI, self-signed) | Nginx UI | ✅ kolom + log penerbitan |
| DDNS + grouping record + IDN | Nginx UI | ✅ `web_dns_record` |
| Access-list `satisfy` + pass-auth | Nginx UI | ✅ `web_access_list`/`web_access_entry` |
| Reverse index cert → site/stream | Nginx UI | ✅ endpoint `certificates/:id/usage` |
| Panel 2FA/passkey + IP allowlist + ban | platform | ✅ via auth OmniSight ([app_sys.md](app_sys.md)) |

**Referensi alat**: Nginx UI, Nginx Proxy Manager, uptime-kuma, certbot/lego/acme.sh,
Cloudflare API.

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §14)

1. **Kode modul:** `WEB` (diperluas dari vhost/proxy) — halaman `WEB01`.. .
2. **Cluster DB:** `web_*` (lanjutan `cluster_web.prisma`).
3. **Akses nginx:** **selalu via agen** `osc_auto/agent_vm` (capability **`web`**);
   backend tidak menulis file nginx langsung. Agen mengelola `nginx.conf`/
   `sites-available`, uji, reload.
4. **Config generation & safe apply:** backend menghasilkan config dari model;
   agen menulis, `nginx -t`, reload; gagal → **rollback** ke revisi sebelumnya
   (`web_config_revision`).
5. **ACME:** dijalankan di **agen** (`lego`/`certbot`/`acme.sh`) — HTTP-01 lokal
   atau **DNS-01** via `web_dns_provider`; sertifikat & kunci disimpan aman
   (path di server, salinan metadata di DB).
6. **DNS provider API:** kredensial provider disimpan **terenkripsi**
   (`credentials_enc`); dipakai untuk DNS-01 **dan** pengelolaan record.
7. **Domain/WHOIS:** lookup WHOIS berkala (via agen/job `JMS`) → `expiry_date`;
   alert kedaluwarsa lewat `OBS`.
8. **Upstream/stream:** model tersimpan; apply via agen; health check dari
   agen/`OBS`.
9. **Log & keamanan:** log nginx dapat dikirim ke `SEC` (SIEM); WAF perimeter
   tetap modul `WAF`.
10. **Health/status page:** **bukan** di `WEB`, melainkan `OBS`
    (`obs_check`/`obs_status_page`) — `WEB` menyuplai target HTTP.
11. **Snippet/template/location:** disimpan sebagai model; generator menyusun
    config dari model + snippet (`include`), bukan ditempel manual; wizard
    memakai template.
12. **Backup/export terenkripsi:** export config (dan full) **dienkripsi**;
    backup **terjadwal via `JMS`**; restore/import = **safe apply** (uji +
    rollback).
13. **Cluster deploy/mirror:** satu sumber kebenaran (DB) → fan-out ke node via
    agen; hasil per node dicatat `web_deploy`.
14. **Resource monitoring & live log:** metrik diambil dari agen; live tail
    (SSE) + pencarian **opt-in** & tunduk RBAC/retensi.
15. **Opsi sertifikat & wildcard:** wildcard → **DNS-01** wajib; dukung
    **RSA/EC**, **OCSP Must-Staple**, **ARI**, **self-signed**; galat/hint dari
    log ACME + verifikasi **HTTP-01 loopback**.
16. **DDNS:** pembaruan record periodik via provider API (job `JMS`); grouping
    record & IDN (punycode).
17. **Keamanan panel:** 2FA/passkey, allowlist IP admin, ban login gagal
    **diwarisi** dari auth platform ([app_sys.md](app_sys.md)) — tidak
    diimplementasi ulang di `WEB`.

## 4. Arsitektur & Topologi

```
Browser ──► osc_site (:37773) ──/proxy/pages/WEB/*──► osc_rest (:37772)
                                                        │  model + generate config + audit
                                                        └── /rest/agent ──► agent_vm (capability web)
                                                                              │  nginx -t / reload
                                                                              ├── ACME (lego/certbot)
                                                                              ├── DNS provider API
                                                                              └── WHOIS lookup
osc_rest ──pgx──► PostgreSQL (web_*)   osc_rest ──► OBS (uptime/cert/domain alert)
```

- **Backend = penghubung tunggal DB**; agen mengubah konfigurasi & koneksi TLS.
- **Tanpa reload manual** di server; semua terkontrol & terekam.

## 5. Model Database — cluster `web_*`

### 5.1 Sudah ada

| Model | Isi |
|---|---|
| `web_vhost` | Virtual host: `server_name`, `listen_port` (default 443), `ssl`, `root`. |
| `web_certificate` | Sertifikat: `common_name`, `issuer`, `not_before`, `not_after`, `status` (VALID/EXPIRING/EXPIRED/REVOKED). |
| `web_upstream` | Upstream: `target_url`, `weight`, `health_status`. |

### 5.2 Baru

| Model | Isi pokok | Kunci |
|---|---|---|
| `web_server` | Host nginx: `code`, `name`, `agent_id`? (→ `bot_agent`), `base_dir`, `config_path`, `nginx_version`, `status`, `managed`, `is_active` | `@@unique([company_id, code])` |
| `web_vhost` (perluas) | Tambah: `server_id`, `type` (PROXY/STATIC/REDIRECT/DEAD/NOT_FOUND), `cert_id`?, `access_list_id`?, `upstream_id`?/`stream_id`?, `redirect_to`?, `advanced` (TEXT), `websocket` (Bool), `hsts` (Bool), `force_ssl` (Bool), `proxy_headers` (Json)?, `default_site` (Bool), `enabled`, `revision_id`? | `@@unique([company_id, server_name, listen_port])` |
| `web_location` | Daftar `location`/path: `vhost_id`, `path`, `match` (PREFIX/EXACT/REGEX), `type` (PROXY/STATIC/REDIRECT), `upstream_id`?/`target`?, `root`?, `redirect_to`?, `options` (Json)?, `sort` | indeks `[vhost_id, sort]` |
| `web_snippet` | Snippet `include`: `server_id`?, `name`, `content` (TEXT), `is_active` | `@@unique([company_id, name])` |
| `web_template` | Template config vhost: `name`, `type`, `content` (TEXT), `is_default` (Bool) | `@@unique([company_id, name])` |
| `web_stream` | Stream L4: `server_id`, `name`, `protocol` (TCP/UDP), `listen_port`, `upstream_id`?, `target`?, `enabled` | `@@unique([company_id, name])` |
| `web_upstream` (perluas) | Tambah: `server_id`, `name`, `strategy` (ROUND_ROBIN/LEAST_CONN/IP_HASH/HASH), `targets` (Json), `check_path`?, `check_interval`? | `@@unique([company_id, name])` |
| `web_access_list` | Daftar akses: `name`, `type` (BASIC_AUTH/IP), `satisfy` (ANY/ALL), `auth_forward_url`? (pass-auth), `auth_forward_headers` (Json)?, `is_active` | `@@unique([company_id, name])` |
| `web_access_entry` | Entri: `list_id`, `kind` (USER/IP), `username`?, `password_enc`?, `cidr`?, `allow` (Bool) | indeks `[list_id]` |
| `web_certificate` (perluas) | Tambah: `server_id`, `source` (MANUAL/ACME/SELF_SIGNED), `provider` (LETSENCRYPT/ZEROSSL), `challenge` (HTTP01/DNS01), `dns_provider_id`?, `auto_renew`, `ari_enabled`, `renew_at`?, `cert_path`?, `key_path`?, `key_type` (RSA/EC), `ocsp_must_staple` (Bool), `wildcard` (Bool), `sans` (Json), `last_error`? | indeks `[company_id, not_after]` |
| `web_acme_account` | Akun ACME: `email`, `provider`, `secret_enc` (account key), `is_active` | `@@unique([company_id, email])` |
| `web_dns_provider` | Provider DNS: `name`, `provider` (CLOUDFLARE/ROUTE53/DIGITALOCEAN/…), `credentials_enc`, `is_active` | `@@unique([company_id, name])` |
| `web_domain` | Domain: `code`, `name`, `registrar`, `registered_at`?, `expiry_date`?, `auto_renew` (Bool), `nameservers` (Json), `dns_provider_id`?, `managed` (Bool), `status` (ACTIVE/EXPIRING/EXPIRED/UNKNOWN), `notes`? | `@@unique([company_id, name])` |
| `web_dns_record` | Record DNS: `domain_id`, `type` (A/AAAA/CNAME/MX/TXT/NS/SRV/CAA), `name` (mendukung IDN → punycode), `value`, `ttl`, `priority`?, `proxied` (Bool), `group`?, `ddns` (Bool), `last_synced_at`?, `is_active` | indeks `[domain_id, type]`, `[domain_id, group]` |
| `web_config_revision` | Revisi config: `server_id`, `scope` (GLOBAL/VHOST/STREAM), `ref_id`?, `content` (TEXT), `checksum`, `applied_at`, `user_id` | indeks `[server_id, created_at]` |
| `web_change` | Audit perubahan: `server_id`, `action` (APPLY/RELOAD/ROLLBACK/CERT_ISSUE/CERT_RENEW/DNS_UPDATE), `target`, `status`, `message`, `user_id`, `created_at` | indeks `[company_id, created_at]` |
| `web_access_log` | Baris log akses/error terparse (telemetry, retensi pendek): `server_id`, `vhost_id`?, `ts`, `src_ip`, `method`, `path`, `status`?, `bytes`, `referer`?, `ua`?, `duration_ms`?, `kind` (ACCESS/ERROR), `raw`? | indeks `[server_id, ts]`, `[vhost_id, ts]` |
| `web_access_stat` | Agregat analitik: `server_id`, `vhost_id`?, `bucket`, `dimension` (PATH/METHOD/STATUS/REFERER/UA/IP), `key`, `hits`, `bytes`, `errors` | `@@unique([server_id, dimension, key, bucket])` |
| `web_server_metric` | Metrik node (telemetry, retensi pendek): `server_id`, `ts`, `cpu_pct`, `mem_used`, `mem_total`, `load1`/`load5`/`load15`, `disk_used`, `disk_total`, `net_rx`/`net_tx` | indeks `[server_id, ts]` |
| `web_backup` | Backup/export: `server_id`?, `scope` (CONFIG/FULL), `kind` (EXPORT/IMPORT), `path`, `encrypted` (Bool), `checksum`, `size`, `status`, `schedule`?, `created_at`, `user_id` | indeks `[server_id, created_at]` |
| `web_deploy` | Cluster deploy/mirror: `vhost_id`?/`server_id`?, `target_server_id`, `status`, `message`, `user_id`, `created_at` | indeks `[company_id, created_at]` |

Relasi inti:

```text
web_server (1) ──► (N) web_vhost · web_stream · web_upstream · web_certificate · web_config_revision
web_server (1) ──► (N) web_access_log ──(agregasi)──► web_access_stat
web_server (1) ──► (N) web_snippet · web_server_metric · web_backup
web_vhost (1) ──► (N) web_upstream
    ├── web_location (path/location)   ├── web_template (template_id)?
    ├── web_certificate (cert_id) ◄── reverse index cert→vhost/stream
    └── web_access_list (access_list_id) ──► web_access_entry
web_domain (1) ──► (N) web_dns_record
    └── web_dns_provider ──► web_certificate (DNS-01 / wildcard)
web_acme_account ──► web_certificate
web_deploy ──► web_server (target) · web_vhost (asal)
web_change ◄── audit semua aksi
```

> `web_change`/`web_config_revision` = audit/revisi; `web_certificate` status
> dievaluasi atas `not_after`; `web_domain.expiry_date` untuk WHOIS.

## 6. Backend (osc_rest) & Agen

Struktur: `osc_rest/skeleton/web/` (`web_handler.go`, `web_usecase.go`,
`web_repository.go`, `web_template.go`) + `mechanic/nginx/` (generator config,
revisi) + agen **`osc_auto/agent_vm`** (capability `web`).

### 6.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("WEB", level)`)

| Area | Endpoint |
|---|---|
| Dashboard | `GET /rest/pages/WEB/overview` (server, cert/domain expiring, uptime) |
| Servers | `GET/POST /WEB/servers`, `GET/PUT/DELETE /WEB/servers/:id`, `POST /WEB/servers/:id/ping` |
| Server stats/versi | `GET /WEB/servers/:id/stats` (CPU/mem/load/disk), `GET /WEB/servers/:id/nginx-versions`, `POST /WEB/servers/:id/nginx-upgrade` |
| Static files | `GET /WEB/servers/:id/files?path=`, `POST /WEB/servers/:id/files/upload`, `POST /WEB/servers/:id/files/mkdir\|delete` |
| Vhosts | `GET/POST /WEB/vhosts`, `GET/PUT/DELETE /WEB/vhosts/:id`, `POST /WEB/vhosts/wizard`, `POST /WEB/vhosts/:id/enable\|disable`, `POST /WEB/vhosts/:id/apply` |
| Vhost locations | `GET/POST /WEB/vhosts/:id/locations`, `PUT/DELETE /WEB/locations/:id`, `GET/PUT /WEB/vhosts/:id/tuning` (WebSocket/HSTS/force-SSL/headers) |
| Snippets | `GET/POST /WEB/snippets`, `PUT/DELETE /WEB/snippets/:id` |
| Templates | `GET/POST /WEB/templates`, `PUT/DELETE /WEB/templates/:id`, `POST /WEB/templates/:id/clone` |
| Cluster deploy | `POST /WEB/vhosts/:id/deploy`, `POST /WEB/servers/:id/mirror` |
| Streams | `GET/POST /WEB/streams`, `PUT/DELETE /WEB/streams/:id` |
| Upstreams | `GET/POST /WEB/upstreams`, `PUT/DELETE /WEB/upstreams/:id` |
| Access lists | `GET/POST /WEB/access-lists`, `PUT/DELETE /WEB/access-lists/:id`, `.../:id/entries` |
| Certificates | `GET/POST /WEB/certificates`, `PUT/DELETE /WEB/certificates/:id`, `POST /WEB/certificates/:id/issue\|renew\|upload`, `GET /WEB/certificates/:id/usage` (reverse index), `GET /WEB/certificates/:id/logs` |
| ACME accounts | `GET/POST /WEB/acme-accounts`, `PUT/DELETE /WEB/acme-accounts/:id` |
| DNS providers | `GET/POST /WEB/dns-providers`, `PUT/DELETE /WEB/dns-providers/:id`, `POST /WEB/dns-providers/:id/test` |
| Domains | `GET/POST /WEB/domains`, `GET/PUT/DELETE /WEB/domains/:id`, `POST /WEB/domains/:id/whois` |
| DNS records | `GET/POST /WEB/domains/:id/records`, `PUT/DELETE /WEB/dns-records/:id`, `POST /WEB/domains/:id/records/sync`, `POST /WEB/domains/:id/ddns` |
| Revisions | `GET /WEB/servers/:id/revisions`, `POST /WEB/revisions/:id/rollback` |
| Access analytics | `GET /WEB/servers/:id/access-stats?range=&dimension=`, `GET /WEB/servers/:id/access-logs` (filter) |
| Live logs | `GET /WEB/servers/:id/logs/tail` (SSE), `GET /WEB/servers/:id/logs/search?q=&kind=` |
| Backup & portabilitas | `GET/POST /WEB/servers/:id/backups`, `POST /WEB/backups/:id/restore`, `GET /WEB/servers/:id/export`, `POST /WEB/servers/:id/import` |
| Changes | `GET /WEB/changes`, `GET /WEB/deploys` |
| Config | `GET /WEB/servers/:id/config`, `PUT /WEB/servers/:id/config` (global, safe apply) |
| Settings | `GET/PUT /WEB/settings` |

### 6.2 Endpoint agen (`/rest/agent`, `USBots()`, token `bot_agent` + mTLS)

| Endpoint agen | Fungsi |
|---|---|
| `POST /rest/agent/web/apply` | Tulis config (vhost/stream/global) + `nginx -t` + reload (rollback bila gagal). |
| `POST /rest/agent/web/test` | Uji konfigurasi saja (`nginx -t`). |
| `POST /rest/agent/web/cert/issue` | Terbitkan sertifikat (ACME HTTP-01/DNS-01, termasuk **wildcard/SAN**; verifikasi **loopback** untuk HTTP-01). |
| `POST /rest/agent/web/cert/renew` | Perpanjang sertifikat (termasuk **ARI**). |
| `POST /rest/agent/web/dns` | Kelola record DNS via provider API (+ **DDNS**). |
| `POST /rest/agent/web/whois` | Lookup WHOIS → tanggal kedaluwarsa domain. |
| `POST /rest/agent/web/stats` | Status nginx (koneksi, version, uptime) + metrik node (CPU/mem/load/disk) → `web_server_metric`. |
| `POST /rest/agent/web/logs` | Kirim/parse log akses & error nginx → `web_access_log`/`web_access_stat`. |
| `POST /rest/agent/web/logs/tail` | Stream/tail log mentah (live) + pencarian. |
| `POST /rest/agent/web/nginx/upgrade` | Deteksi & upgrade biner nginx (opsional). |
| `POST /rest/agent/web/files` | Jelajah/unggah berkas direktori tersaji. |
| `POST /rest/agent/web/backup` \| `.../restore` | Export/import terenkripsi + backup/restore full. |

> Semua lewat grup `/rest/agent` (`USBots()`); agen **tidak** mengakses DB.
> Kredensial DNS/ACME dikirim per-job terenkripsi (kanal mTLS).

### 6.3 Safe apply (config)

- Backend menyusun config → simpan `web_config_revision` → agen apply.
- Agen: backup config aktif → tulis → `nginx -t` → reload → sukses/rollback.
- Setiap hasil dicatat `web_change` (+ `USLogs`).
- **Restore/import** mengikuti alur yang sama (uji + rollback) sebelum
  mengganti config aktif.
- **Cluster deploy/mirror** apply per node; tiap node dicatat di `web_deploy`
  (sukses/rollback independen).
- **Upgrade nginx** mengikuti pola aman: cek versi → backup biner/config → uji →
  swap (opsional rollback biner).

## 7. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `WEB01` | **Dashboard** — server, site aktif, sertifikat/domain menjelang kedaluwarsa, uptime |
| `WEB02` | **Servers** — host nginx + uji/status + **monitor resource** (CPU/mem/load/disk) + versi/upgrade nginx + static files |
| `WEB03` | **Sites** — daftar vhost (proxy/static/redirect/**dead**/**404**/default), enable/disable + **wizard buat** + pilih template |
| `WEB04` | **Site detail** — editor config + advanced, **tuning** (WebSocket/HSTS/force-SSL/headers), **locations/path**, snippet/include picker, upstream, cert, access-list, apply/revisi, **deploy ke node** |
| `WEB05` | **Upstreams** — grup backend + strategi + health |
| `WEB06` | **Streams** — TCP/UDP L4 |
| `WEB07` | **Certificates** — manual & ACME (HTTP-01/DNS-01), **wildcard/SAN**, opsi (RSA/EC, OCSP Must-Staple, ARI, self-signed), auto-renew, expiry, log penerbitan + **reverse index usage** |
| `WEB08` | **Access Lists** — basic-auth/IP + `satisfy any/all` + pass-auth |
| `WEB09` | **Domains & DNS** — registrar, WHOIS expiry, record DNS (grouping/DDNS/IDN), provider |
| `WEB10` | **Changes & Revisions** — audit + rollback + deploy |
| `WEB11` | **Settings** — akun ACME, provider DNS, default |
| `WEB12` | **Analytics** — statistik log akses/error (top path/status/IP, bandwidth, error rate) + **live log tail/search** |
| `WEB13` | **Snippets & Templates** — pustaka snippet (`include`) + template config vhost |
| `WEB14` | **Backup & Portabilitas** — export/import terenkripsi, backup full/restore, jadwal |
| `WEB15` | **Cluster Deploy** — mirror config antar-node + riwayat deploy (`web_deploy`) |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`, pola tab
(`APP02`/`APP04`), `@uiw/react-codemirror` (editor config/snippet),
`recharts` (grafik uptime OBS + resource node), `EventSource` (live log tail
SSE), pola wizard dari modul lain.

## 8. Keamanan & RBAC

- **Kredensial DNS/ACME** terenkripsi (`credentials_enc`/`secret_enc`), tidak
  dikembalikan mentah; akses `POST` + audit.
- **Config berisiko** → safe apply (uji + rollback) + revisi; aksi destruktif
  konfirmasi (+ opsi approval `APP04`).
- **Sertifikat privat key** disimpan di server (path), salinan tidak di git.
- **Isolasi tenant:** semua query difilter `company_id`.
- **WHOIS/API provider** dibatasi (rate-limit, kredensial least privilege).
- **Export/backup terenkripsi** (`web_backup.encrypted`); file backup tidak
  berisi kunci mentah; restore/import via safe apply + audit.
- **Live log/tail & static files** dibatasi RBAC (akses raw log/berkas dianggap
  sensitif) + audit.
- **Keamanan panel** (2FA/passkey, allowlist IP admin, ban login gagal)
  **diwarisi** dari auth platform ([app_sys.md](app_sys.md)) — **tidak**
  diimplementasi ulang di `WEB`.
- **Audit:** `web_change` + `USLogs` (`app_user_action`).

### 8.1 Otorisasi
- Baca: `VIEW`; ubah vhost/cert/DNS: `POST`; hapus/rollback/deploy/restore:
  `BOOK`/`APP04`; akses live log/static files/export: `POST` + audit.

## 9. Retensi & Audit

- `web_change` → purge via `retention.go` (mis. 365 hari, `RE_DAYS_WEB_CHANGE`).
- `web_config_revision` → dibatasi jumlah/umur (mis. 50 revisi terakhir).
- `web_certificate`/`web_domain`/`web_dns_record`/vhost/upstream/stream/server/
  `web_snippet`/`web_template`/`web_location` → persisten.
- `web_access_log` → telemetry beretensi pendek (mis. 14 hari); `web_access_stat`
  → agregat lebih panjang (mis. 1 tahun).
- `web_server_metric` → telemetry pendek (mis. 30 hari); **live log tail** tidak
  disimpan (streaming) atau beretensi sangat pendek.
- `web_backup`/`web_deploy` → mengikuti kebijakan backup/deploy (mis. 90 hari).
- Semua mutasi UI → `USLogs` (`app_user_action`).

## 10. Integrasi Lintas-Modul

- **OBS** ([app_obs.md](app_obs.md)) — probe uptime (`obs_check`), **status page**
  (`obs_status_page`), alert kedaluwarsa cert/domain, maintenance window.
- **NET** ([app_net.md](app_net.md)) — DNS/domain jaringan internal; pemetaan IP.
- **WAF** — perlindungan perimeter untuk site yang diproksi.
- **SEC** ([app_sec.md](app_sec.md)) — log nginx (access/error) → SIEM.
- **AMM** ([app_amm.md](app_amm.md)) — relasi aset/host.
- **JMS** — penjadwalan auto-renew ACME (termasuk ARI), lookup WHOIS berkala,
  **backup terjadwal**, & update **DDNS**.
- **SYS** ([app_sys.md](app_sys.md)) — auth platform: **2FA/passkey**, allowlist
  IP admin, ban login gagal (**diwarisi**); notifikasi admin.
- **BOT** — registrasi agen (`bot_agent`).

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Server & vhost** | Model `web_server`/perluas `web_vhost`; capability `web`; apply/test/reload (safe apply); halaman `WEB02`–`WEB04`. |
| **B. Upstream & stream** | `web_upstream`/`web_stream`; health; halaman `WEB05`–`WEB06`. |
| **C. Access list** | `web_access_list`/`web_access_entry`; halaman `WEB08`. |
| **D. TLS & ACME** | Perluas `web_certificate` + `web_acme_account`; HTTP-01/DNS-01 + auto-renew; halaman `WEB07`. |
| **E. Domain & DNS** | `web_domain`/`web_dns_record`/`web_dns_provider` + WHOIS; halaman `WEB09`; sinkron OBS. |
| **F. Revisi & polish** | `web_config_revision`/`web_change` + rollback; log nginx → `SEC`; halaman `WEB10`–`WEB11`. |
| **F2. Analitik log** | Parse access/error nginx (`web_access_log`/`web_access_stat`) + grafik (top path/status/IP, bandwidth, error rate); halaman `WEB12`. |
| **G. Wizard/tuning/snippet** | Wizard create, `web_snippet`/`web_template`/`web_location`; tuning proxy lanjutan (WebSocket/HSTS/force-SSL/headers); tipe `DEAD`/`NOT_FOUND`/default; halaman `WEB03`/`WEB04`/`WEB13`. |
| **H. Monitor & log live** | `web_server_metric`; tail/search log live; versi/upgrade nginx; static file browser; polish `WEB02`/`WEB12`. |
| **I. Backup & portabilitas** | `web_backup`; export/import terenkripsi; full backup/restore + jadwal (JMS); halaman `WEB14`. |
| **J. Cluster & cert lanjutan** | `web_deploy` mirror/deploy; wildcard/SAN + opsi cert (RSA/EC, OCSP, ARI, self-signed); DDNS/grouping/IDN; access-list `satisfy`/pass-auth; reverse index; halaman `WEB15`. |

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Config salah → downtime | `nginx -t` + revisi + rollback otomatis. |
| Kegagalan auto-renew → cert kadaluwarsa | Alert dini (OBS) + retry + uji. |
| Kredensial DNS/ACME bocor | Enkripsi, least privilege, audit, tanpa reveal. |
| Domain kedaluwarsa tanpa sadar | WHOIS berkala + alert (OBS). |
| Rate-limit provider DNS | Backoff + kuota + jadwal JMS. |
| Akses agen berlebihan | Token+mTLS, allowlist path server, audit. |
| Backup/export bocor | Enkripsi (`web_backup.encrypted`) + RBAC + audit. |
| Live log/statis membebani server | Opt-in, rate-limit, RBAC, tanpa penyimpanan permanen. |
| Cluster drift (node tidak sinkron) | Mirror dari satu sumber (DB) + `web_deploy` + uji per node. |
| Upgrade nginx merusak layanan | Backup biner/config + uji + rollback. |
| Sertifikat wildcard gagal (DNS-01) | Uji kredensial provider + log/hint + retry. |

## 13. Non-Goals

- Menggantikan penuh panel hosting (mail/FTP/one-click app) — OmniSight = konsol
  web/proxy/domain.
- Multi-web-server engine (Apache/Caddy) fase awal — fokus **nginx** dulu.
- Registrasi/pembelian domain otomatis (tanpa integrasi registrar) — data
  registrar manual + WHOIS; aksi registrar menyusul.
- Monitoring uptime/status page **(milik `OBS`)**, bukan `WEB`.

## 14. Keputusan

### 14.1 Terkonfirmasi
- [x] Modul **`WEB`** diperluas: vhost/proxy + **domain/DNS/WHOIS** + **ACME**.
- [x] Akses nginx **via agen** `osc_auto/agent_vm` (capability `web`); safe apply
  (uji + rollback).
- [x] **Analitik log akses/error** (`web_access_log`/`web_access_stat`) di `WEB`
  (terpisah dari ingest SIEM `SEC`).
- [x] Penyetelan proxy lanjutan (**WebSocket/HSTS/force-SSL/headers**) + **`location`/path** terstruktur (`web_location`), bukan hanya `advanced` TEXT.
- [x] **Wizard site** + **snippet & include** (`web_snippet`) + **template config** (`web_template`).
- [x] **Backup/export terenkripsi** (`web_backup`) + full backup/restore + terjadwal (JMS).
- [x] **Cluster deploy/mirror** (`web_deploy`) — deploy site ke node jarak jauh.
- [x] **Live log tail/search** + **resource monitoring node** (`web_server_metric`).
- [x] **Wildcard/SAN (DNS-01)** + opsi cert (**RSA/EC**, **OCSP Must-Staple**, **ARI**, **self-signed**).
- [x] **DDNS** + grouping record + **IDN**; access-list `satisfy any/all` + **pass-auth**.
- [x] **Reverse index cert → site/stream**.
- [x] **Keamanan panel** (2FA/passkey, allowlist IP admin, ban login gagal) diwarisi auth platform ([app_sys.md](app_sys.md)).

### 14.2 Perlu konfirmasi
- [ ] Engine fokus **nginx** dulu (Apache/Caddy menyusul)?
- [ ] ACME tool: **`lego`** (Go, mudah dibundel) vs `certbot`/`acme.sh`?
- [ ] Provider DNS fase awal: **Cloudflare** dulu, lainnya menyusul?
- [ ] Kelola record DNS **langsung** (provider API) atau **data-diri** (manual) dulu?
- [ ] Approval perubahan config produksi via **`APP04`/`BOOK`**?
- [ ] **Upgrade biner nginx** via endpoint (opsional) atau cukup manual/OS package?
- [ ] **Backup**: kunci enkripsi per-user atau kunci platform?
- [ ] **Cluster deploy**: sinkron penuh vs per-site?
- [ ] **Live log**: streaming SSE vs polling?

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Enkripsi nilai sensitif: `mechanic/crypto`.
- Safe apply pola: `osc_rest` modul `NET` ([app_net.md](app_net.md)).
- Retensi: `osc_rest/backbone/retention.go`.
- Agen per-VM: **`osc_auto/agent_vm`** (capability `web`; backend = penghubung DB;
  live log tail/SSE, metrik node, backup/restore).
- Auth panel (2FA/passkey, allowlist IP, ban login): [app_sys.md](app_sys.md).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_web.prisma`,
  [database/cluster_web.md](../database/cluster_web.md).
- Referensi eksternal: Nginx UI, Nginx Proxy Manager, uptime-kuma, certbot/lego,
  Cloudflare/Route53 API.
