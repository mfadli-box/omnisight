# Planning `POD` — Container/Pod Management (Docker/Podman + Kubernetes)

> Rencana modul **`POD`** sebagai konsol container/pod OmniSight: mengelola
> runtime **Docker/Podman** (pengganti **Dockge** & **Arcane** / alternatif
> Portainer) **dan** inventaris **Kubernetes** dalam satu modul. Bagian dari
> [Planning](README.md) · Lihat juga [blueprint](blueprint.md),
> [roadmap](roadmap.md), [checklist](checklist.md), serta modul terkait
> [OBS](app_obs.md) (monitoring container, memakai engine yang sama).

## 1. Tujuan & Lingkup

Satu modul `POD` untuk seluruh domain container:

- **Runtime engine (Docker/Podman)** — pengganti **Dockge** & **Arcane**:
  - Kelola **project/stack Compose** (buat, edit, deploy, up/down, restart,
    hapus, **konversi container ke Compose**).
  - **Git Sync / GitOps** — project ditarik dari repo Git (pull), atau
    didorong balik ke repo (push), dengan auto-sync berkala.
  - Kelola **container** (start/stop/restart/pause/remove, recreate/redeploy,
    **commit container → image**, inspect, logs, exec).
  - Kelola **image** (list, pull, tag, remove, prune) + **image build** +
    **deteksi update** (banding digest lokal vs registry, badge "update tersedia").
  - Kelola **volume & network** (list, buat, hapus, prune) + **backup volume**
    + **browse isi volume** (file manager volume, batas ukuran/path).
  - **Import/adopt** stack & container yang sudah ada di disk/engine (pindai
    `base_dir`, konversi container→stack) — melengkapi pembuatan via UI.
  - **Webhook** — pemicu masuk (CI → redeploy) & event keluar (deploy/update/gagal).
  - **Notifikasi event** — deploy sukses/gagal, **update image tersedia**, dan
    **restart-loop** container → kirim ke dispatcher [`APP06`](app_sys.md)
    (reuse `pod_webhook` untuk penerima luar).
  - **Bulk operations** — start/stop/restart/pull/prune banyak object sekaligus.
  - **Vulnerability scan** image (mis. via Trivy).
  - **Deteksi update semver-aware** — strategi per container/image
    (**digest/auto/tag/semver**), **constraint versi** + pola tag, dan menulis
    ulang image ref baru ke file Compose (bukan digest-only).
  - **Cek update event-driven** — event image Docker → antre cek dengan
    **burst debounce** (melengkapi cek berkala/on-demand).
  - **Auto-heal container unhealthy** — restart container `unhealthy` dengan
    **throttle** (maks N per jendela) + **admission gate**; melengkapi notifikasi
    restart-loop yang sudah ada.
  - **Backup terjadwal + full system** — jadwal **cron** untuk backup volume
    (default tetap **disk lokal**; **S3** ditambah sebagai opsi) + **backup &
    restore full system** tingkat aplikasi (recovery key, restore selektif,
    safety-backup sebelum restore).
  - **Patching image langsung (ala Copacetic)** — tambal CVE OS yang *fixable*
    tanpa rebuild → tag `-patched` + scan ulang; patching terjadwal.
  - **Risk scoring & threat intel** — skor risiko **0–100**, **CISA KEV**,
    **FIRST EPSS**, tren, ekspor CSV, aksi massal temuan.
  - **Scan kerentanan terjadwal** — cron **harian** default, batas resource
    Trivy, **Trivy server remote** opsional, dukungan `.trivyignore`.
  - **Registry search & browse** — cari registry dari dialog pull; daftar
    repo/tag/digest/platform; hapus tag; **ECR token exchange**.
  - **Topologi network + inventaris port** — graf interaktif atas
    `pod_network` + deteksi konflik `host:port`; inventaris port container.
  - **Template Compose** + registri template + **variabel/env** per project.
  - **Multi-environment** (lokal via socket + remote via agent, mTLS).
  - **Editor YAML** Compose + workspace file tree, **terminal interaktif**,
    **log realtime**, dan **Activity/Events**.
  - **Log terstruktur** — render **JSON/logfmt**, pengelompokan multiline,
    unduh log sebagai file, monitor CPU/mem di samping log.
  - **Visualisasi resource** — grafik CPU/mem/network live + stats/sparkline
    inline di tabel container + kartu dashboard.
  - **Monitoring GPU** — meter memori/util **NVIDIA/AMD** di dashboard (upaya
    ringan via `nvidia-smi` / `/sys/class/drm`).
  - **Visibilitas proses container** — tampilan proses (`top`) di detail container.
  - **Workspace volume in-place** — edit file UTF-8 live, rename/move,
    single-file restore dari backup, rename volume (melengkapi file manager).
  - **Hook lifecycle GitOps** — skrip pra-deploy di container runner
    (network/mounts/timeout), digerbangi **capability**.
  - **Git lanjutan** — GPG commit signing, konfigurasi identitas commit, policy
    merge `.env.git`, mode host-key **strict/accept-new**, impor massal JSON sync.
  - **Notifikasi provider + templating** — provider outbound langsung (email,
    webhook, Discord/Telegram/Slack/Signal/Ntfy/Gotify/Matrix/Google
    Chat/Pushover) via **registry adapter ala Shoutrrr**, payload webhook
    **Go-template**, pencocokan success-body, notifikasi update ter-batch
    (tetap melengkapi dispatcher [`APP06`](app_sys.md)).
  - **API scoped & OpenAPI** — API key dengan **izin ter-scope**, **OpenAPI
    3.1**, stream **NDJSON** untuk operasi besar, upload **chunked resumable**
    (impor image, upload backup).
  - **CLI `POD`** — CLI tipis di atas `/rest/pages/POD/*` (builds, vulns,
    activities, webhooks, ekspor openapi).
  - **Registry & image lanjutan** — login/pull **dan push**, tag/retag, riwayat
    image, `docker system df` + prune, **buildx** (build args, target stage,
    platform multi-arch).
  - **Compose lanjutan** — multi-`-f`/`compose.override.yaml`, **profiles**,
    `.env`/`--env-file`, **scale/replicas**, edit restart policy & healthcheck,
    `compose config` (validasi), **rollback stack** bila deploy gagal.
  - **Operasional** — resource limit container (CPU/mem), stats ringkas,
    `docker cp`/file browser, **TLS/context** (simpan CA/cert, `docker context`/SSH).
  - **Podman lanjutan** — **pods**, **Quadlet/systemd** generation, rootless UID
    mapping, provider `podman-compose`/`podman compose`, `podman machine`.
- **Kubernetes** — inventaris cluster/node/workload (`pod_cluster`,
  `pod_node`, `pod_workload`, sudah ada di cluster `pod_*`).

Keputusan: modul **`POD`** dan cluster **`pod_*`** (DKR/Dockge + Arcane
digabung ke POD).

## 2. Paritas Fitur (Dockge & Arcane)

Kolom sumber: **D** = Dockge, **A** = Arcane.

| Fitur | Sumber | Target `POD` | Catatan |
|---|---|---|---|
| Kelola project/stack Compose | D + A | ✅ | File `compose.yaml` per project + riwayat revisi. |
| Editor Compose (YAML) + validasi | D + A | ✅ | `@uiw/react-codemirror` + `@codemirror/lang-yaml` (sudah ada). |
| Workspace file tree (file pendukung project) | A | ✅ | Batas ukuran/kedalaman/jumlah file. |
| Interactive terminal (container) | D | ✅ | xterm + WebSocket (pola `mechanic/sshproxy.go`, `src/uix/web-terminal.tsx`). |
| Real-time logs | D + A | ✅ | Stream Docker API → WS/SSE. |
| Manajemen image | D + A | ✅ | List/pull/remove/prune. |
| Image build | A | ✅ | Build dari Dockerfile/Compose **via pipeline `DSO`**; riwayat `pod_build`. |
| Container create/edit/redeploy/recreate | A | ✅ | Recreate dengan konfigurasi baru + restore bila gagal. |
| Commit container → image | A | ✅ | `POST /commit` via Engine API. |
| Convert container → Compose | A | ✅ | Generate Compose dari container standalone. |
| Update (per container & project) | D + A | ✅ | **Manual dengan trigger** (tombol/endpoint, opsional webhook): pull image + recreate; toggle/label. Bukan penjadwalan otomatis. |
| Git Sync / GitOps (pull & push) | A | ✅ | `pod_git_sync` + kredensial repo; auto-sync. |
| Volume backups | A | ✅ | `pod_backup` + restore; target **disk lokal** (S3 menyusul). |
| Browse isi volume | A | ✅ | File manager volume (list/baca/unggah/hapus) dengan batas ukuran/path. |
| Vulnerability scan image | A | ✅ | `pod_scan` + `pod_scan_finding` (scanner **Trivy**). |
| Templates & template registry | A | ✅ | `pod_template` + `pod_template_registry`. |
| Variabel/env per project | A | ✅ | `pod_env_var` (nilai rahasia terenkripsi). |
| Remote environments (agent + mTLS) | A | ✅ | `pod_engine` + agen `osc_auto/agent_vm`, `/rest/agent`. |
| Activity & events | A | ✅ | `pod_action` + stream `GET /events`. |
| Multi-user / RBAC | A | ✅ | `USAuth` + `USRole("POD", …)` + multi-company. |
| Berbasis file stack di disk | D | ✅ | `base_dir` per engine; file tetap bisa diedit manual. |
| Push image + login registry | A | ✅ | Kredensial `pod_registry` untuk pull **dan** push (hasil build `DSO`). |
| Tag/retag, history, save/load | A | ✅ | Engine API (`/images/*`, `/images/{name}/tag`, `/images/{name}/history`). |
| Compose override/profiles/env-file | D + A | ✅ | Multi-`-f`, `profiles`, `.env`/`--env-file`. |
| Scale/replicas service | A | ✅ | `--scale` / `deploy.replicas`. |
| Validasi & rollback stack | D + A | ✅ | `compose config` + snapshot sebelum deploy + rollback bila `up` gagal. |
| `system df` & prune/cleanup | D + A | ✅ | Disk usage + prune terjadwal (via `JMS` opsional). |
| Resource limit & stats container | A | ✅ | Edit limit CPU/mem; stats ringkas di UI. |
| File browser / `docker cp` | A | ✅ | Copy/upload ke container (batas ukuran/path). |
| TLS/context (CA/cert, context/SSH) | A | ✅ | Simpan CA/cert di `pod_engine`; dukung `docker context`. |
| Buildx (args/target/platform) | A | ✅ | Didelegasi ke `DSO` dengan kontrak argumen eksplisit. |
| Podman pods & Quadlet/systemd | A | ✅ | Khusus Podman; generate unit Quadlet. |
| **Deteksi update image** (digest vs registry) | D + A | ✅ | `pod_image` + cek berkala/on-demand; badge "update tersedia". |
| **Import/adopt stack dari disk** | D | ✅ | Pindai `base_dir`, adopt container/stack yang belum terdaftar. |
| **Webhook masuk/keluar** | A | ✅ | `pod_webhook` (trigger CI/CD & event keluar). |
| **Notifikasi event** | A | ✅ | Deploy gagal/sukses, update tersedia, restart-loop → dispatcher `APP06` + `pod_webhook`. |
| **Bulk operations** | A | ✅ | Aksi massal lintas container/stack/image. |
| **Deteksi update semver-aware** | D + A | ✅ | Strategi per container/image + constraint/pola tag + tulis ulang image ref ke Compose (lihat `pod_image`/`pod_container`). |
| **Cek update event-driven** | A | ✅ | Event image → antre cek dengan burst debounce (`pod_update_check`). |
| **Auto-heal unhealthy** | A | ✅ | Restart throttled + admission gate (`pod_heal_policy`). |
| **Backup terjadwal + full system** | A | ✅ | Cron `pod_backup_schedule` + full system backup/restore (`pod_system_backup`, recovery key, restore selektif); S3 opsi. |
| **Patching image langsung** | A | ✅ | Ala Copacetic: tag `-patched` + re-scan + jadwal (`pod_patch`). |
| **Risk scoring & threat intel** | A | ✅ | Skor 0–100, CISA KEV, FIRST EPSS, tren, CSV, aksi massal (`pod_scan_finding`). |
| **Scan terjadwal** | A | ✅ | Cron harian default, resource caps, Trivy server remote, `.trivyignore` (`pod_scan_schedule`). |
| **Registry search & browse** | A | ✅ | Cari repo/tag/digest/platform + hapus tag + ECR token (`pod_registry_repository`/`pod_registry_tag`). |
| **Topologi network + port** | A | ✅ | Graf `pod_network` + deteksi konflik `host:port`; inventaris port (`pod_port_binding`). |
| **Log terstruktur** | A | ✅ | JSON/logfmt, multiline, unduh file, monitor CPU/mem (`pod_log_setting`). |
| **Visualisasi resource** | A | ✅ | Grafik live + sparkline inline + kartu dashboard. |
| **Monitoring GPU** | A | ✅ | NVIDIA/AMD (`pod_gpu`, `nvidia-smi` / `/sys/class/drm`). |
| **Visibilitas proses** | A | ✅ | Tampilan `top` proses di detail container. |
| **Workspace volume in-place** | A | ✅ | Edit file live, rename/move, single-file restore, rename volume. |
| **Hook lifecycle GitOps** | A | ✅ | Skrip pra-deploy di runner (network/mounts/timeout), gated capability. |
| **Git lanjutan** | A | ✅ | GPG signing, identitas commit, `.env.git` policy, host-key mode, impor massal JSON. |
| **Notifikasi provider + templating** | A | ✅ | Adapter ala Shoutrrr (email/webhook/Discord/Telegram/Slack/Signal/Ntfy/Gotify/Matrix/Google Chat/Pushover), Go-template, success-body, batch (`APP06` tetap). |
| **API keys scoped + OpenAPI 3.1** | A | ✅ | Izin ter-scope (`pod_api_key`), OpenAPI 3.1, NDJSON stream, chunked resumable upload. |
| **CLI** | A | ✅ | `POD` CLI tipis di atas `/rest/pages/POD/*` (builds, vulns, activities, webhooks, openapi). |
| Host shell/console | A | ❌ | Non-goal — hanya exec container (§13). |
| Docker Swarm | A | ❌ | Non-goal (diputuskan). |
| REST API + OpenAPI | A | ✅ | Gunakan endpoint `/rest/pages/POD/*`; OpenAPI opsional. |
| Kubernetes | — | ✅ | Model `pod_cluster/node/workload` (inventaris; **apply/scale** opsional §14.2). |

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §14)

1. **Kode modul:** `POD` (**DKR/Dockge + Arcane digabung ke POD**) — halaman
   `POD01`..`POD0N`.
2. **Cluster DB:** `pod_*` (file `cluster_pod.prisma` + `cluster_pod.md`).
3. **Akses engine:** klien tipis **Docker Engine HTTP API** melalui
   `net/http` + custom transport (unix socket / TCP+TLS) — **tanpa** dependency
   berat. **Docker & Podman diproses terpisah** (driver + CLI masing-masing:
   `docker` vs `podman`) namun **backend & data (cluster `pod_*`) tunggal**.
4. **Operasi Compose:** eksekusi **CLI** (`docker compose` / `podman compose`)
   via `os/exec` dengan argumen tervalidasi + working dir di `base_dir`.
   **File `compose.yaml` disimpan**: di disk (`base_dir`) **dan** salinan revisi
   di `pod_stack_revision`. Engine API untuk inspeksi/status/log/exec.
5. **Streaming:** WebSocket untuk exec/log/events (backend proxy), SSE untuk
   log teks satu arah.
6. **Multi-engine sejak awal:** lokal (Unix socket) + remote via **agen**
   (`osc_auto/agent_vm` + mTLS) dalam **satu** backend. Agen ditanam di setiap
   VM; **backend `osc_rest` adalah satu-satunya penghubung ke DB** — agen tidak
   pernah mengakses database.
7. **GitOps:** sinkronisasi project ↔ repo Git **dua arah (pull + push)** via
   `git`/library, kredensial SSH/HTTPS terenkripsi; editor read-only untuk file
   ter-sync.
8. **Vulnerability scan:** **Trivy** (rekomendasi) sebagai scanner — CLI/binary,
   menghasilkan `pod_scan` + temuan; bukan scanner bawaan.
9. **Builds:** **didelegasikan ke `DSO`** (pipeline build image); `POD` memicu
   pipeline dan menampilkan status via `pod_build`. Pull/supply image dari
   registry tetap di `POD`.
10. **Terminal exec:** **direkam** (sesi + output) ke `pod_exec_session`;
    retensi diatur via env (`RE_DAYS_POD_EXEC`).
11. **Update:** **manual dengan trigger** (tombol/endpoint, opsional webhook);
    bukan penjadwalan otomatis.
12. **Backup volume:** target **disk lokal** (path terkonfigurasi); S3 menyusul.
13. **Registry push** (melengkapi pull) + login; hasil build `DSO` didorong ke
    `pod_registry` tujuan.
14. **Compose lanjutan:** multi-`-f`/override, **profiles**, `.env`/`--env-file`,
    scale, `compose config`, **rollback stack**.
15. **Operasional lanjutan:** `system df`/prune, resource limit + stats, file
    browser/`docker cp`, TLS/context.
16. **Podman lanjutan:** **pods**, **Quadlet/systemd**, rootless mapping,
    provider compose.
17. **Deteksi update image:** banding **digest** lokal vs registry (`HEAD`
    manifest) — on-demand + berkala; tandai `update_available` (badge di UI).
18. **Import/adopt:** pindai `base_dir`/Engine API untuk stack & container yang
    belum terdaftar lalu "adopt" ke `pod_stack`.
19. **Webhook:** `pod_webhook` untuk **trigger masuk** (redeploy/update) &
    **event keluar** (deploy/update/gagal) dengan token rahasia.
20. **Bulk operations:** endpoint aksi massal (container/stack/image) dengan
    batas jumlah + audit.
21. **Notifikasi:** event kunci (deploy/update/restart-loop) dikirim ke
    **dispatcher [`APP06`](app_sys.md)**; penerima luar tetap via `pod_webhook`.
22. **Browse volume:** file manager untuk isi volume (reuse `file browser`
    container) dengan batas ukuran/kedalaman/path (anti symlink-traversal).
23. **Update semver-aware:** cek update mendukung **strategi** (`digest`/`auto`/
    `tag`/`semver`) + **constraint** + **pola tag** per container/image; bila
    cocok, **image ref baru ditulis ulang** ke file Compose sebelum recreate
    (bukan digest-only).
24. **Cek update event-driven:** event image Docker (`/events`) memicu **antrean
    cek** dengan **burst debounce** — melengkapi cek berkala & on-demand.
25. **Auto-heal:** policy restart otomatis container `unhealthy` dengan
    **throttle** (maks N per jendela) + **admission gate** (berhenti bila
    kesehatan cluster turun); selalu diaudit.
26. **Backup:** jadwal **cron** (`pod_backup_schedule`), default **disk lokal**,
    **S3** sebagai opsi; **full system backup/restore** (`pod_system_backup`)
    dengan **recovery key**, **restore selektif**, dan **safety-backup** sebelum
    restore.
27. **Patching image:** tambal CVE OS *fixable* **tanpa rebuild** (ala
    **Copacetic**) → tag `-patched` + **scan ulang**; dapat **dijadwalkan**.
28. **Risk & threat intel:** skor risiko **0–100** pada `pod_scan`/
    `pod_scan_finding`, perkaya dengan **CISA KEV**/**FIRST EPSS**, tren
    temuan, ekspor CSV, dan aksi massal temuan.
29. **Scan terjadwal:** cron **harian** default dengan **batas resource** Trivy,
    opsi **Trivy server remote**, dan dukungan `.trivyignore`.
30. **Registry browse:** pencarian registry dari dialog pull + daftar
    repo/tag/digest/platform + hapus tag + **ECR token exchange** (proxy OCI
    penuh tetap non-goal).
31. **Topologi & port:** graf interaktif `pod_network` + inventaris
    **published ports** dengan deteksi konflik `host:port`.
32. **Log terstruktur & resource:** render JSON/logfmt + multiline + unduh file;
    grafik resource live + sparkline; **GPU** (NVIDIA/AMD); tampilan **proses**
    (`top`).
33. **Workspace volume in-place:** edit file UTF-8 live, rename/move,
    single-file restore dari backup, rename volume (melengkapi file manager).
34. **GitOps lanjutan:** **hook pra-deploy** di runner container (network/
    mounts/timeout, gated capability), **GPG signing**, identitas commit,
    policy `.env.git`, host-key **strict/accept-new**, impor massal JSON sync.
35. **Notifikasi:** registry **provider langsung ala Shoutrrr** (email/webhook/
    Discord/Telegram/Slack/Signal/Ntfy/Gotify/Matrix/Google Chat/Pushover) +
    **Go-template** payload + success-body + batch update; tetap melengkapi
    dispatcher [`APP06`](app_sys.md).
36. **API:** **API key scoped** (`pod_api_key`), spesifikasi **OpenAPI 3.1**,
    stream **NDJSON** untuk operasi besar, dan upload **chunked resumable**.
37. **CLI:** biner **`POD`** tipis di atas `/rest/pages/POD/*` (bukan jalur DB
    langsung; reuse auth API key scoped).

> Beberapa butuh keputusan (lihat §14): push registry, Podman Quadlet,
    penyimpanan CA/cert TLS, approval aksi berisiko (`APP04`).

## 4. Arsitektur & Topologi

```
Browser ──► osc_site (:37773)
              ├── /proxy/pages/POD/*  ──► osc_rest (:37772) ── Engine API ──► dockerd/podman (socket)
              └── WS /POD/... (exec, logs, events)
osc_rest ──os/exec──► `docker compose -f <base_dir>/<stack>/compose.yaml ...`
osc_rest ──/rest/agent (USBots)──► agent_vm (osc_auto) di VM target ──► dockerd/podman host tsb.
```

- **Engine lokal:** `unix:///var/run/docker.sock` (backend jalan sebagai user
  dengan akses socket; saat ini proses root & grup `docker`).
- **Engine remote:** **agen `osc_auto/agent_vm`** (biner Go, ditanam di setiap
  VM) mengekspos subset Engine API, diautentikasi token `bot_agent` + mTLS,
  lewat grup `/rest/agent` (`USBots()`).
- **Backend sebagai penghubung DB:** `osc_rest` menyimpan/membaca semua data
  dari Postgres. Agen **hanya** berkomunikasi dengan `osc_rest` — **tidak
  pernah** mengakses database.
- **Satu agen, banyak kemampuan:** `agent_vm` menyediakan capability `engine`
  (POD) dan `metrics` (OBS) sesuai konfigurasi per host.

## 5. Integrasi Engine

| Kemampuan | Docker | Podman |
|---|---|---|
| Endpoint | `unix:///var/run/docker.sock`, `tcp://host:2375/2376` | `unix:///run/podman/podman.sock` |
| Versi API | `GET /version`, `/_ping` | kompatibel Docker API |
| List/inspect | `/containers/json`, `/images/json`, `/volumes`, `/networks` | sama |
| Lifecycle | start/stop/restart/pause/kill/remove | sama |
| Exec/Attach | `POST /containers/{id}/exec` + upgrade (hijack) | sama |
| Events | `GET /events` (stream) | sama |
| Compose | `docker compose` (plugin v5.x) | `podman compose` / `podman-compose` |
| Disk/purge | `/system/df`, `/containers/prune`, `/images/prune`, `/volumes/prune` | sama |
| Buildx | `docker buildx` (args/target/platform) | `podman build` (buildah) |
| Pods | — | `podman pod` (CLI) |
| Quadlet/systemd | — | `podman generate systemd` / Quadlet unit |
| TLS/context | `tcp://` + CA/cert, `docker context` | `--tls-verify`, koneksi remote |

- **Docker & Podman = driver terpisah** (socket, CLI, dan composer berbeda),
  tetapi memakai **backend & cluster DB yang sama**. Abstraction `engineDriver`
  (`DockerDriver`, `PodmanDriver`) di `mechanic/dockerclient/`.
- Status terbaru lingkungan: **Docker 29.8.0**, **Compose v5.5.1** (plugin) +
  `docker-compose 1.29.2`. **Podman belum terpasang** → driver siap sejak awal,
  pengujian Podman menunggu instalasi.
- Klien Engine ditulis di paket baru `osc_rest/mechanic/dockerclient/` (transport
  unix/TCP, versi API ternegosiasi, timeout, error terstruktur).

## 6. Model Database — cluster `pod_*`

### 6.1 Sudah ada (Kubernetes)

| Model | Isi |
|---|---|
| `pod_cluster` | Cluster k8s: `provider`, `api_endpoint`, `version`, `status`. |
| `pod_node` | Node: `role`, `ip_address`, `cpu_capacity`, `status`, `last_seen`. |
| `pod_workload` | Workload: `namespace`, `name`, `kind`, `image`, `replicas`, `status`. |

### 6.2 Baru (runtime Docker/Podman)

| Model | Isi pokok | Kunci |
|---|---|---|
| `pod_engine` | Host/engine: `code`, `name`, `engine` (DOCKER/PODMAN), `endpoint`, `tls`, `tls_ca_enc`, `tls_cert_enc`, `tls_key_enc`, `context`, `connection_mode` (LOCAL/TCP/AGENT/CONTEXT), `agent_id`, `base_dir`, `status`, `last_seen`, `is_active`, `company_id` | `@@unique([company_id, code])` |
| `pod_stack` | Compose stack: `name`, `project_name`, `directory`, `compose_path`, `override_paths` (JSON), `env_path`, `profiles` (TEXT[]), `status` (RUNNING/STOPPED/PARTIAL/ERROR/UNKNOWN), `auto_update`, `last_deployed_at` | `@@unique([engine_id, name])` |
| `pod_stack_revision` | Riwayat file compose: `revision`, `content` (TEXT), `content_hash`, `note`, `created_by` | `@@unique([stack_id, revision])` |
| `pod_service` | Service dalam stack: `name`, `image`, `replicas`, `profiles` (TEXT[]), `status`, `ports` (JSON), `depends_on` (JSON) | `@@unique([stack_id, name])` |
| `pod_container` | Container: `external_id`, `name`, `image`, `image_id`, `state`, `health`, `restart_count`, `pod_ref`?, `ports` (JSON), `labels` (JSON), `update_strategy` (DIGEST/AUTO/TAG/SEMVER), `version_constraint`, `tag_pattern`, `auto_heal`, `started_at`, `finished_at` | `@@unique([engine_id, external_id])` |
| `pod_image` | Image: `external_id`, `repo_tags` (TEXT[]), `size_bytes` (BigInt), `dangling`, `digest`, `remote_digest`, `update_available`, `update_strategy` (DIGEST/AUTO/TAG/SEMVER), `version_constraint`, `tag_pattern`, `latest_version`, `patch_available`, `patched_tag`, `last_checked_at`, `last_pulled_at` | `@@unique([engine_id, external_id])` |
| `pod_volume` | Volume: `name`, `driver`, `mountpoint`, `scope`, `labels` (JSON) | `@@unique([engine_id, name])` |
| `pod_network` | Network: `external_id`, `name`, `driver`, `scope`, `subnet`, `gateway`, `internal` | `@@unique([engine_id, external_id])` |
| `pod_registry` | Registry privat: `code`, `name`, `url`, `username`, `token_enc`, `can_push` | `@@unique([company_id, code])` |
| `pod_action` | Audit operasi (log): `action`, `target_type`, `target_ref`, `status`, `message`, `started_at`, `finished_at`, `duration_ms`, `user_id` | indeks `company_id`, `created_at` |
| `pod_env_var` | Variabel/env per project (atau global engine): `key`, `value_enc` (rahasia), `is_secret`, `stack_id`? | `@@unique([stack_id, key])` |
| `pod_git_credential` | Kredensial repo Git: `name`, `url`, `auth_type` (SSH/TOKEN/BASIC), `secret_enc`, `known_hosts`?, `gpg_key_enc`?, `commit_name`, `commit_email`, `host_key_mode` (STRICT/ACCEPT_NEW) | `@@unique([company_id, name])` |
| `pod_git_sync` | Sinkronisasi project ↔ repo: `direction` (PULL/PUSH), `repo_id`, `branch`, `compose_path`, `dest_path`, `auto_sync`, `interval_sec`, `pre_deploy` (JSON: script/image/network/mounts/timeout), `env_git_policy` (MERGE/REPLACE/IGNORE), `gpg_sign` (Bool), `host_key_mode` (STRICT/ACCEPT_NEW), `last_sync_at`, `last_commit`, `status` | `@@unique([stack_id, direction])` |
| `pod_build` | Build image: `stack_id`?, `dockerfile`, `context`, `target`, `platform` (TEXT[]), `args` (JSON), `image_tag`, `push` (Bool), `registry_id`?, `status` (QUEUED/RUNNING/SUCCESS/FAILED), `log` (TEXT), `started_at`, `finished_at` | indeks `company_id`, `created_at` |
| `pod_backup` | Backup volume: `volume_id`?, `name`, `kind` (VOLUME/SYSTEM), `target` (DISK/S3), `path`, `s3_config` (JSON), `selective` (JSON), `schedule_id`?, `safety_backup_id`?, `size_bytes`, `status`, `started_at`, `finished_at` | indeks `[company_id, created_at]` |
| `pod_scan` | Pemindaian image: `image_ref`, `scanner` (TRIVY), `scanner_version`, `trivy_server`?, `schedule_id`?, `risk_score` (0–100), `kev_count`, `epss_max`, `status`, `critical`, `high`, `medium`, `low`, `scanned_at` | indeks `[company_id, scanned_at]` |
| `pod_scan_finding` | Temuan: `scan_id`, `vuln_id`, `package`, `installed_version`, `fixed_version`, `severity`, `risk_score`, `in_kev` (Bool), `epss` (Float), `trend` (NEW/PERSISTENT/FIXED), `first_seen`, `last_seen`, `title` | indeks `[scan_id, severity]` |
| `pod_template` | Template Compose: `code`, `name`, `content` (TEXT), `variables` (JSON), `registry_id`? | `@@unique([company_id, code])` |
| `pod_template_registry` | Sumber template: `name`, `url`, `type` (LOCAL/GIT/HTTP), `is_active` | `@@unique([company_id, name])` |
| `pod_exec_session` | Rekaman sesi terminal: `company_id`, `engine_id`, `container_ref`, `user_id`, `command`, `log` (TEXT), `size_bytes`, `started_at`, `finished_at` | indeks `[company_id, started_at]` |

Relasi inti:

```text
pod_engine (1) ──► (N) pod_stack ──► pod_stack_revision
                       ├──► (N) pod_service
                       ├──► (N) pod_env_var · (1) pod_git_sync · (N) pod_build
                       └──► (N) pod_container ──► (N) pod_scan ──► pod_scan_finding
pod_engine (1) ──► (N) pod_container · pod_image · pod_volume · pod_network
pod_engine (1) ──► (N) pod_backup (volume) · pod_template (company)
pod_git_credential (1) ──► (N) pod_git_sync
pod_engine (1) ──► (N) pod_exec_session (rekaman terminal, retensi)
pod_registry (company) · pod_template_registry (company) · pod_webhook (company)
pod_action (audit, retensi)

# Kubernetes (sudah ada)
pod_cluster (1) ──► (N) pod_node · pod_workload
```

> Catatan: `pod_stack_revision` menyimpan salinan YAML sebagai sumber
> pemulihan/riwayat; file asli tetap di disk `base_dir`.

### 6.3 Tambahan lanjutan (runtime)

| Model | Isi pokok | Kunci |
|---|---|---|
| `pod_pod` | Podman pod: `engine_id`, `external_id`, `name`, `status`, `shared_net`, `members` (JSON) | `@@unique([engine_id, external_id])` |
| `pod_secret` | Compose secret/config: `engine_id`?, `stack_id`?, `name`, `kind` (SECRET/CONFIG), `value_enc`/`path`, `is_secret` | `@@unique([company_id, name])` |
| `pod_disk_usage` | Cache `system df`: `engine_id`, `type` (IMAGES/CONTAINERS/VOLUMES/BUILD_CACHE), `total`, `active`, `size_bytes`, `reclaimable_bytes`, `collected_at` | indeks `[engine_id, type]` |
| `pod_webhook` | Webhook masuk/keluar: `code`, `name`, `direction` (IN/OUT), `target` (stack_id/engine_id)?, `action` (REDEPLOY/UPDATE/PRUNE), `secret_enc`, `url` (OUT), `events` (JSON), `is_active`, `last_called_at` | `@@unique([company_id, code])` |
| `pod_update_check` | Antrean cek update event-driven: `engine_id`, `image_ref`, `trigger` (EVENT/SCHEDULE/MANUAL), `status`, `debounce_until`, `checked_at`, `result` (JSON) | indeks `[engine_id, status]` |
| `pod_heal_policy` | Auto-heal unhealthy: `engine_id`, `scope` (ENGINE/CONTAINER), `target_ref`?, `max_restarts`, `window_sec`, `cooldown_sec`, `admission_min_healthy`, `is_active` | `@@unique([engine_id, scope, target_ref])` |
| `pod_backup_schedule` | Jadwal backup: `code`, `name`, `cron`, `target` (VOLUME/SYSTEM), `volume_id`?, `destination` (DISK/S3), `s3_config` (JSON), `retention_n`, `is_active`, `last_run_at` | `@@unique([company_id, code])` |
| `pod_system_backup` | Backup full system: `name`, `kind` (FULL/SELECTIVE), `scope` (JSON: engines/stacks/volumes/db), `path`, `size_bytes`, `recovery_key_enc`, `safety_backup_id`?, `status`, `started_at`, `finished_at` | indeks `[company_id, created_at]` |
| `pod_patch` | Patching image (ala Copacetic): `image_id`, `source_ref`, `patched_ref`, `tool` (COPACETIC), `cve_ids` (JSON), `scan_id`?, `schedule_id`?, `status`, `log` (TEXT), `started_at`, `finished_at` | indeks `[company_id, created_at]` |
| `pod_scan_schedule` | Jadwal scan/patch: `code`, `name`, `cron`, `task` (SCAN/PATCH), `engine_id`?, `scope` (JSON image/stack), `trivy_server`?, `resource_caps` (JSON), `ignore_path` (`.trivyignore`)?, `is_active`, `last_run_at` | `@@unique([company_id, code])` |
| `pod_threat_intel` | Cache threat intel: `vuln_id`, `source` (KEV/EPSS), `in_kev` (Bool), `epss` (Float), `known_ransomware` (Bool), `due_date`, `fetched_at` | `@@unique([source, vuln_id])` |
| `pod_registry_repository` | Repo registry: `registry_id`, `name`, `namespace`, `tag_count`, `last_synced_at` | `@@unique([registry_id, name])` |
| `pod_registry_tag` | Tag registry: `repository_id`, `tag`, `digest`, `platforms` (JSON), `size_bytes` (BigInt), `created_at` | `@@unique([repository_id, tag])` |
| `pod_port_binding` | Inventaris published ports: `engine_id`, `container_id`?, `host_ip`, `host_port`, `container_port`, `protocol`, `conflict` (Bool), `conflict_with`? | indeks `[engine_id, host_port]` |
| `pod_gpu` | Monitoring GPU: `engine_id`?, `node_ref`?, `vendor` (NVIDIA/AMD), `name`, `memory_total_mb`, `memory_used_mb`, `util_percent`, `temp_c`, `collected_at` | indeks `[engine_id, vendor]` |
| `pod_notification_channel` | Provider notifikasi (ala Shoutrrr): `code`, `name`, `provider` (EMAIL/WEBHOOK/DISCORD/TELEGRAM/SLACK/SIGNAL/NTFY/GOTIFY/MATRIX/GOOGLE_CHAT/PUSHOVER), `config_enc` (JSON), `events` (JSON), `template_id`?, `success_body` (TEXT), `batch_window_sec`, `is_active` | `@@unique([company_id, code])` |
| `pod_notification_template` | Template notifikasi: `code`, `name`, `provider`, `subject`, `body` (TEXT, Go-template), `is_active` | `@@unique([company_id, code])` |
| `pod_log_setting` | Pengaturan log: `engine_id`?, `format` (TEXT/JSON/LOGFMT), `multiline_pattern`, `max_bytes` | `@@unique([engine_id])` |
| `pod_api_key` | API key scoped: `code`, `name`, `prefix`, `hash`, `scopes` (TEXT[]), `expires_at`, `last_used_at`, `is_active` | `@@unique([company_id, prefix])` |

> Field TLS (`tls_ca_enc`/`tls_cert_enc`/`tls_key_enc`) disimpan terenkripsi
> untuk engine `tcp://` TLS; `pod_pod` hanya untuk engine Podman. Database
> `osc_base` belum diubah — bagian ini rencana.

## 7. Backend (osc_rest)

Struktur mengikuti pola skeleton: `osc_rest/skeleton/pod/`
(`pod_handler.go`, `pod_usecase.go`, `pod_repository.go`, `pod_template.go`) +
`mechanic/dockerclient/` + `mechanic/dockerproxy.go` (WS).

### 7.1 Endpoint (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("POD","POST")`)

| Area | Endpoint |
|---|---|
| Engine | `GET/POST /rest/pages/POD/engines`, `GET/PUT/DELETE /POD/engines/:id`, `POST /POD/engines/:id/ping` |
| Stack | `GET/POST /POD/stacks`, `GET/PUT/DELETE /POD/stacks/:id` |
| Stack action | `POST /POD/stacks/:id/deploy\|up\|down\|restart\|stop\|pull\|scale\|rollback`; `POST /POD/stacks/:id/config` (validasi) |
| Compose file | `GET /POD/stacks/:id/compose`, `PUT /POD/stacks/:id/compose` (revisi baru) |
| Workspace files | `GET /POD/stacks/:id/files`, `GET/PUT /POD/stacks/:id/files?path=` (batas ukuran/kedalaman) |
| Git sync | `GET/POST /POD/stacks/:id/git-sync`, `DELETE /POD/stacks/:id/git-sync`, `POST /POD/stacks/:id/git-sync/run` |
| Git repo | `GET/POST/DELETE /POD/git-credentials`, `POST /POD/git-credentials/:id/test` |
| Env vars | `GET/POST /POD/stacks/:id/env`, `DELETE /POD/stacks/:id/env/:key` |
| Builds | `GET/POST /POD/builds`, `GET /POD/builds/:id`, `GET /POD/builds/:id/log` (SSE) |
| Vulner. scan | `POST /POD/images/:id/scan`, `GET /POD/scans`, `GET /POD/scans/:id`, `DELETE /POD/scans/:id` |
| Backups | `GET/POST /POD/backups`, `POST /POD/backups/:id/restore`, `DELETE /POD/backups/:id` |
| Templates | `GET/POST /POD/templates`, `GET/PUT/DELETE /POD/templates/:id` |
| Template registry | `GET/POST/DELETE /POD/template-registries` |
| Stack logs | `GET /POD/stacks/:id/logs` (SSE) |
| Container | `GET /POD/containers`, `GET /POD/containers/:id`, `POST /POD/containers/:id/start\|stop\|restart\|pause\|kill`, `DELETE /POD/containers/:id`, `GET /POD/containers/:id/inspect` |
| Container logs | `GET /POD/containers/:id/logs` (SSE; param `format`=text/json/logfmt, `multiline`); `GET /POD/containers/:id/logs/download` |
| Container exec | `GET /POD/containers/:id/exec` (WebSocket) |
| Container misc | `POST /POD/containers/:id/commit` (→ image), `POST /POD/containers/:id/convert` (→ Compose project) |
| Exec sessions | `GET /POD/exec-sessions`, `GET /POD/exec-sessions/:id` (rekaman), `DELETE /POD/exec-sessions/:id` |
| Image | `GET /POD/images`, `POST /POD/images/pull`, `POST /POD/images/:id/push`, `POST /POD/images/:id/tag`, `GET /POD/images/:id/history`, `DELETE /POD/images/:id`, `POST /POD/images/prune` |
| Volume/Network | `GET/POST/DELETE /POD/volumes`, `/POD/networks` (+ `prune`); `POST /POD/containers/:id/mounts` (attach/detach) |
| Volume files | `GET /POD/volumes/:id/files`, `GET/PUT/DELETE /POD/volumes/:id/files?path=` (browse, batas) |
| Notifikasi event | `GET/PUT /POD/settings/notifications` (event → dispatcher `APP06`) |
| Image update | `POST /POD/images/:id/check-update`, `POST /POD/engines/:id/check-updates`; `GET/PUT /POD/images/:id/update-policy`, `GET /POD/updates` |
| Update check queue | `GET /POD/update-checks`, `POST /POD/update-checks/:id/run` (event-driven + debounce) |
| Auto-heal | `GET/PUT /POD/heal-policies`, `POST /POD/heal-policies/:id/test` |
| Patching | `POST /POD/images/:id/patch`, `GET /POD/patches`, `GET /POD/patches/:id`, `GET /POD/patches/:id/log` (SSE) |
| Scan schedule | `GET/POST /POD/scan-schedules`, `PUT/DELETE /POD/scan-schedules/:id`, `POST /POD/scan-schedules/:id/run` |
| Scan findings | `GET /POD/scans/:id/findings`, `GET /POD/scans/:id/findings.csv`, `POST /POD/scans/:id/findings/bulk`; `GET /POD/threat-intel` |
| Registry browse | `GET /POD/registries/:id/repositories`, `GET /POD/registries/:id/repositories/:repo/tags`, `DELETE /POD/registries/:id/repositories/:repo/tags/:tag`, `POST /POD/registries/:id/ecr-token` |
| Network topology | `GET /POD/engines/:id/network-topology`, `GET /POD/engines/:id/port-bindings` |
| GPU | `GET /POD/engines/:id/gpu`, `GET /POD/nodes/:id/gpu` |
| Volume workspace | `POST /POD/volumes/:id/files/rename`, `POST /POD/volumes/:id/files/move`, `POST /POD/volumes/:id/rename`, `POST /POD/volumes/:id/files/restore` |
| Backup schedule | `GET/POST /POD/backup-schedules`, `PUT/DELETE /POD/backup-schedules/:id`, `POST /POD/backup-schedules/:id/run` |
| System backup | `GET/POST /POD/system-backups`, `GET /POD/system-backups/:id`, `POST /POD/system-backups/:id/restore`, `DELETE /POD/system-backups/:id` |
| Git hooks | `GET/PUT /POD/stacks/:id/git-sync/hooks`, `POST /POD/stacks/:id/git-sync/hooks/test`; `POST /POD/git-sync/import` (bulk JSON) |
| Notifications | `GET/POST /POD/notification-channels`, `PUT/DELETE /POD/notification-channels/:id`, `POST /POD/notification-channels/:id/test`; `GET/POST /POD/notification-templates` |
| API keys | `GET/POST /POD/api-keys`, `PUT/DELETE /POD/api-keys/:id`, `POST /POD/api-keys/:id/rotate` |
| Log settings | `GET/PUT /POD/log-settings` |
| OpenAPI | `GET /POD/openapi.json` (OpenAPI 3.1), `GET /POD/openapi.ndjson` (stream operasi besar) |
| Chunked upload | `POST /POD/uploads/init`, `PUT /POD/uploads/:id/chunk`, `POST /POD/uploads/:id/complete` (impor image, upload backup) |
| Adopt/import | `POST /POD/engines/:id/scan-stacks`, `POST /POD/stacks/adopt` |
| Webhook | `GET/POST /POD/webhooks`, `PUT/DELETE /POD/webhooks/:id`, `POST /POD/webhooks/:id/test`; masuk: `POST /hooks/POD/:code` |
| Bulk ops | `POST /POD/containers/bulk`, `POST /POD/stacks/bulk`, `POST /POD/images/bulk` |
| Registry | `GET/POST/DELETE /POD/registries`, `POST /POD/registries/:id/login`, `POST /POD/registries/:id/test`, `GET /POD/registries/:id/search?q=` |
| Disk usage | `GET /POD/engines/:id/df`, `POST /POD/engines/:id/prune` (system prune) |
| Container files | `GET /POD/containers/:id/files`, `POST /POD/containers/:id/cp` (copy/upload) |
| Pods (Podman) | `GET/POST /POD/pods`, `POST /POD/pods/:id/start\|stop\|restart`, `DELETE /POD/pods/:id` |
| Secrets/Configs | `GET/POST/DELETE /POD/secrets`, `/POD/configs` |
| Quadlet | `GET/POST /POD/pods/:id/quadlet` (generate unit systemd) |
| Events | `GET /POD/events` (WebSocket) |
| Action log | `GET /POD/actions` (read-only) |
| Kubernetes | endpoint `pod_cluster/node/workload` (CRUD/fan-out seperti modul lain) |

> Endpoint WS (exec/logs/events) didaftarkan di grup route yang meng-upgrade
> koneksi; autentikasi token lewat query/`Sec-WebSocket-Protocol` dan dicek
> `USRole("POD","POST")` untuk exec.

### 7.2 Operasi Compose
- Validasi ketat: `project_name`/`stack.name` hanya `[a-z0-9_-]`, path di dalam
  `engine.base_dir` (cegah traversal), tanpa interpolasi shell (pakai
  `exec.Command` argumen array).
- Perintah: `docker compose --project-name <p> --project-directory <dir> -f <file> up -d|down|restart|stop|pull`.
- `down` opsional `--remove-orphans`; volume tidak dihapus kecuali diminta.

### 7.3 Agen (`osc_auto`, grup `/rest/agent`, `USBots()`)

- Kode agen berada di **`osc_auto/`** (scaffold yang **dipakai**: `agent_vm`,
  `agent_ci`; `agent_ws`/`agent_mx` belum diperlukan/TBD). Untuk `POD`, agen
  per-VM = **`osc_auto/agent_vm`** (capability `engine`).
- Registrasi/heartbeat via `bot_agent`/`bot_heartbeat`; autentikasi token +
  mTLS. **Agen tidak mengakses DB** — semua baca/tulis lewat `osc_rest`.
- Endpoint agen (dihosting `osc_rest`): `POST /rest/agent/pod/register`,
  `GET /rest/agent/pod/ws` (kanal perintah/stream), `POST /rest/agent/pod/proxy`
  (panggilan Engine API terjembatani), `POST /rest/agent/pod/heartbeat`.

## 8. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `POD01` | **Projects/Stacks** — tabel project (nama, engine, status, aksi cepat) + detail (tab: Editor Compose, Files, Services, Containers, Logs, Env, Git Sync, Builds, Actions) |
| `POD02` | **Containers** — tabel + filter engine/stack/state; detail (Inspect, Logs **terstruktur**, **Proses/`top`**, Terminal **direkam**, **Files/`cp`**, **Ports**, Compose tab); aksi commit/convert; **bulk**; badge update + **sparkline** resource |
| `POD03` | **Images** — list/pull/push/tag/history/remove/prune + build (buildx) + tombol scan + **patch** + dialog pull dengan **registry search** |
| `POD04` | **Volumes & Networks** + backup/restore volume + **browse/edit isi volume in-place** (rename/move, single-file restore, rename volume) + **jadwal backup** + secrets/configs; **topologi network** + **inventaris published ports** |
| `POD05` | **Environments/Engines** — daftar engine Docker/Podman + test koneksi + TLS/context + GPU |
| `POD06` | **Registries** + kredensial Git + login/logout + **browse repo/tag/digest/platform** + pengaturan |
| `POD07` | **Scans** — hasil pemindaian + temuan + **risk score/KEV/EPSS/tren** + ekspor CSV + aksi massal + **jadwal scan** + `.trivyignore`/Trivy server |
| `POD08` | **Templates** — template Compose + registri |
| `POD09` | **Activity** — riwayat aksi (`pod_action`) & events + ekspor **NDJSON** |
| `POD10` | **Kubernetes** — cluster/node/workload (model `pod_cluster` dll.) |
| `POD11` | **System** — disk usage (`system df`), prune, **pods** (Podman) & Quadlet/systemd + **full system backup/restore** |
| `POD12` | **Webhooks** — pemicu masuk/keluar + uji + riwayat |
| `POD13` | **Updates & Patching** — pusat update (strategi semver, cek event-driven + debounce, **auto-heal policy**, **patching** ala Copacetic) |
| `POD14` | **Insights** — dashboard resource/GPU, grafik CPU/mem/network live, kartu ringkas |
| `POD15` | **Notifications** — provider (ala Shoutrrr) + template Go + success-body + batch (dispatcher `APP06` tetap) |
| `POD16` | **API & Keys** — API key scoped + rotasi + preview **OpenAPI 3.1** + unduh CLI |

**Reuse yang sudah tersedia:**
- Editor YAML: `@uiw/react-codemirror` + `@codemirror/lang-yaml`.
- Terminal: `@xterm/xterm` + `@xterm/addon-fit`, `src/uix/web-terminal.tsx`,
  `src/lib/ws.ts` (`useSocket`).
- Tabel/form & proxy: `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`.
- Pola satu halaman + tab (seperti `APP02`/`APP04`).

## 9. Keamanan & RBAC

- **Socket Docker ≈ akses root** → modul `POD` hanya untuk user ber-privilege
  tinggi. Mutasi: `USRole("POD","POST")`; baca: `VIEW`.
- **Audit wajib**: setiap aksi (deploy/up/down/exec/remove/pull) ditulis ke
  `pod_action` **dan** `USLogs` (`app_user_action`).
- **Kredensial registry**: disimpan terenkripsi (`token_enc`), tidak pernah
  dikembalikan ke klien.
- **Exec terminal**: **direkam** ke `pod_exec_session` (sesi + output, dengan
  timestamp), retensi via env `RE_DAYS_POD_EXEC`; batasi image/user;
  pertimbangkan alasan wajib ("break-glass").
- **Agen remote** (`osc_auto/agent_vm`): token `bot_agent`, mTLS, allowlist
  perintah; agen hanya mengekspos subset API dan **tidak** mengakses DB
  (backend = penghubung tunggal).
- **Path**: semua file di bawah `base_dir` engine; tolak symlink keluar direktori.
- **Podman rootless** dianjurkan untuk mengurangi dampak socket root-level.
- **Auto-heal & patching**: keduanya mutasi privileged → **throttle +
  admission gate**, audit ke `pod_action`, dan patching hanya menyentuh CVE OS
  *fixable* (tag `-patched`) tanpa mengubah sumber.
- **API key scoped**: disimpan sebagai **hash** (bukan plaintext), scope
  eksplisit (`READ`/`POST`/area), rotasi + `expires_at`; diaudit.
- **Host shell/console** bukan fitur — hanya **exec container** (rekam), sesuai
  postur keamanan (§13).

## 10. Retensi & Audit

- `pod_action` (log) → purge via `retention.go` (default 90 hari, `RE_DAYS_POD_ACTION`).
- `pod_stack_revision` disimpan (bukan telemetry), batasi jumlah revisi (mis. 50
  terakhir) agar tidak tak terbatas.
- `pod_build.log` dipangkas setelah selesai; `pod_scan`/`pod_scan_finding`
  beretensi (mis. 90 hari); `pod_backup` metadata disimpan (file eksternal).
- **`pod_exec_session`** (rekaman terminal) → retensi via env
  `RE_DAYS_POD_EXEC` (default 90 hari), masuk daftar `retention.go`.
- **`pod_update_check`**, **`pod_port_binding`**, dan **`pod_gpu`** =
  telemetri ringan → purge via `retention.go` (window pendek, mis. 30 hari).
- **`pod_threat_intel`** (cache KEV/EPSS) disegarkan berkala; **`pod_patch`**,
  **`pod_backup`** (termasuk `pod_system_backup`), dan **`pod_scan`** beretensi
  (mis. 90 hari); `pod_system_backup` menyimpan **recovery key terenkripsi**
  terpisah.
- Event realtime tidak disimpan (stream saja) kecuali diminta.

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Fondasi (multi-engine)** | Model `pod_*` (runtime) + migrasi; `mechanic/dockerclient` dengan `engineDriver` **Docker + Podman** (proses/CLI terpisah); CRUD `pod_engine` + ping; list container/image (read). |
| **B. Stacks** | CRUD stack + editor Compose + **file `compose.yaml` disimpan** + revisi; action `up/down/restart/pull` (CLI); audit `pod_action`. |
| **C. Resources** | Container lifecycle + inspect; image pull/remove/prune; volume/network. |
| **D. Realtime** | Logs (SSE) + terminal exec (WS) + events (WS) + **rekaman sesi** (`pod_exec_session`). |
| **E. Remote engine** | Agen **`osc_auto/agent_vm`** + engine remote via `/rest/agent` (mTLS, backend ke DB); registry privat + **update manual via trigger** (bukan terjadwal). |
| **F. GitOps** | `pod_git_credential`/`pod_git_sync`; **pull + push** project, auto-sync; editor read-only file ter-sync. |
| **G. Build, scan, backup** | `pod_build` (build via pipeline **`DSO`**); vulnerability scan **Trivy** `pod_scan`/`pod_scan_finding`; backup/restore volume `pod_backup` (**disk lokal**). |
| **H. Templates & polish** | `pod_template`/`pod_template_registry`; hardening Podman, UX, test, dokumentasi. |
| **I. Kubernetes** | CRUD `pod_cluster`/`pod_node`/`pod_workload` (inventaris k8s). |
| **J. Lanjutan (gap)** | Registry **push** + login; tag/history/save/load; Compose lanjutan (override/profiles/env-file/**scale**/config/**rollback stack**); `system df`/prune; resource limit + stats; file browser/`cp` + **browse isi volume**; TLS/context; **pods & Quadlet** Podman; secrets/configs. |
| **K. Update, adopsi & webhook** | **Deteksi update image** (digest) + badge; **import/adopt** stack dari disk/engine; **webhook** masuk/keluar; **bulk operations**; **notifikasi event** (deploy/update/restart-loop → `APP06`); alert container (handoff `OBS`); halaman `POD12`. |
| **L. Update lanjutan & auto-heal** | Strategi update **semver-aware** (+ tulis ulang image ref ke Compose); **cek event-driven** + burst debounce (`pod_update_check`); **auto-heal** unhealthy (`pod_heal_policy`); **patching** ala Copacetic (`pod_patch`); halaman `POD13`. |
| **M. Scan & threat intel** | **Scan terjadwal** (`pod_scan_schedule`, cron harian, resource caps, Trivy server, `.trivyignore`); **risk scoring 0–100**, **CISA KEV**, **FIRST EPSS**, tren, CSV, aksi massal (`pod_scan_finding`, `pod_threat_intel`). |
| **N. Backup lanjutan** | **Jadwal backup** (`pod_backup_schedule`, S3 opsi) + **full system backup/restore** (`pod_system_backup`, recovery key, restore selektif, safety-backup). |
| **O. Observability & UX** | **Log terstruktur** (JSON/logfmt, multiline, unduh, monitor CPU/mem); **visualisasi resource** (grafik/sparkline/kartu `POD14`); **GPU** (`pod_gpu`); **proses container** (`top`); **registry browse**; **topologi network + published ports** (`pod_port_binding`); **workspace volume in-place**. |
| **P. GitOps lanjutan & notifikasi** | **Hook pra-deploy** runner (gated capability), GPG signing, identitas commit, `.env.git` policy, host-key mode, impor massal JSON; **provider notifikasi** ala Shoutrrr + **Go-template** + success-body + batch; halaman `POD15`. |
| **Q. API & CLI** | **API key scoped** (`pod_api_key`), **OpenAPI 3.1**, stream **NDJSON**, **chunked resumable upload**; **CLI `POD`**; halaman `POD16`. |

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Socket root-level disalahgunakan | RBAC `POST`, audit wajib, opsional podman rootless, break-glass. |
| Perintah CLI injection | `exec.Command` argumen array, validasi nama/path, tanpa shell. |
| Konkurensi edit Compose | Revisi + `content_hash`, tolak simpan bila berubah (optimistic locking). |
| Backpressure stream log/exec | Buffer + batas rate; putus koneksi lambat. |
| Agent remote tidak terpercaya | TLS + mTLS, token, allowlist, heartbeat (`bot_agent`). |
| Perbedaan Docker/Podman | Lapisan abstraksi engine + uji keduanya. |
| Kredensial Git/registry bocor | Simpan terenkripsi (`*_enc`), jangan kembalikan mentah, scope per company. |
| Git sync menimpa perubahan lokal | Arah pull bikin file read-only; push hanya bila dikonfigurasi; konflik dilaporkan. |
| Scanner kerentanan berat | Jalankan Trivy terpisah/terjadwal; cache DB; batasi konkurensi. |
| Backup volume besar | Streaming arsip, batas ukuran, jadwal opsional (via `JMS`), target **disk lokal**. |
| Auto-heal menyebabkan restart storm | **Throttle** (maks N per jendela) + **admission gate** + cooldown + audit. |
| Patching merusak image | Hanya CVE OS *fixable*, hasil tag **`-patched`** terpisah, **scan ulang** + audit; sumber tak diubah. |
| Full system restore salah sasaran | **Safety-backup** wajib sebelum restore, **restore selektif**, recovery key terenkripsi. |
| API key bocor | Simpan **hash**, scope minimal, `expires_at` + rotasi, audit pemakaian. |
| Registry browse / ECR token | Kredensial terenkripsi, rate limit, tak ekspos token ke klien. |
| Template notifikasi injection | **Go-template** di-sandbox, secret `*_enc`, allowlist provider. |
| Edit volume in-place merusak data | Validasi path/anti-traversal, backup otomatis + audit, batas ukuran. |
| Upload chunked tidak konsisten | Token resume + checksum per chunk + batas ukuran/waktu. |

## 13. Non-Goals

- Docker Swarm (**non-goal, diputuskan** — Arcane mendukungnya, `POD` tidak).
- **Registry UI penuh / proxy OCI** (cukup kredensial pull **+ push**) — cukup halaman registries. **Search & browse** repo/tag registry diperbolehkan; **proxy OCI penuh tetap non-goal**.
- **Host shell/console** — **non-goal** (diputuskan): hanya **exec ke dalam container** (direkam); tidak ada shell host-level, sesuai postur keamanan (`APP04`/RBAC).
- Basis data kerentanan sendiri (pakai Trivy/database publik).
- Aplikasi mobile native (Arcane Mobile) — fokus web responsif.
- Manajemen host OS (itu ranah `VMS`/`NET`).

## 14. Keputusan (dikonfirmasi)

- [x] Kode modul **`POD`** (DKR/Dockge + Arcane digabung ke POD); prefix **`pod_*`**.
- [x] Operasi Compose: **CLI** (`docker compose` / `podman compose`); **file
  `compose.yaml` disimpan** (disk `base_dir` + salinan revisi `pod_stack_revision`).
- [x] **Multi-engine** (lokal + remote) sejak awal.
- [x] **Podman** didukung sejak awal: **proses/CLI dipisah**, tetapi **backend &
  data (cluster `pod_*`) tunggal**.
- [x] **GitOps**: **pull + push** (dua arah).
- [x] **Vulnerability scan**: **Trivy**.
- [x] **Image build**: **delegasi ke `DSO`**.
- [x] Terminal exec: **direkam** (`pod_exec_session`), retensi via env
  `RE_DAYS_POD_EXEC`.
- [x] Update: **manual dengan trigger** (bukan penjadwalan otomatis).
- [x] Backup volume: **disk lokal**.
- [x] **Docker Swarm**: **non-goal** (tanpa Swarm).
- [x] **Notifikasi event** (deploy/update/restart-loop) via dispatcher
  [`APP06`](app_sys.md) + `pod_webhook`.
- [x] **Browse isi volume** (file manager volume) dengan batas ukuran/path.
- [x] **Update semver-aware**: strategi per container/image (`digest`/`auto`/
  `tag`/`semver`) + constraint/pola tag + **tulis ulang image ref** ke file
  Compose; melengkapi deteksi digest.
- [x] **Cek update event-driven** (event image → antre dengan **burst
  debounce**), melengkapi berkala & on-demand.
- [x] **Auto-heal** container `unhealthy`: restart **throttled** + **admission
  gate**, selalu diaudit.
- [x] **Backup terjadwal** (`pod_backup_schedule`) + **full system backup/
  restore** (`pod_system_backup`: recovery key, restore selektif, safety-backup);
  default **disk lokal**, **S3** opsi.
- [x] **Patching image langsung** (ala **Copacetic**) tanpa rebuild → tag
  `-patched` + **scan ulang**; dapat dijadwalkan.
- [x] **Risk scoring 0–100** + **CISA KEV** + **FIRST EPSS** + tren + CSV +
  aksi massal pada `pod_scan_finding`.
- [x] **Scan kerentanan terjadwal** (cron harian default, resource caps, opsi
  Trivy server remote, `.trivyignore`).
- [x] **Registry search & browse** (repo/tag/digest/platform, hapus tag, ECR
  token exchange); **proxy OCI penuh tetap non-goal**.
- [x] **Topologi network** (graf `pod_network`) + **inventaris published ports**
  + deteksi konflik `host:port`.
- [x] **Log terstruktur** (JSON/logfmt, multiline, unduh file, monitor CPU/mem).
- [x] **Visualisasi resource** (grafik live + sparkline + kartu dashboard).
- [x] **Monitoring GPU** (NVIDIA/AMD via `nvidia-smi` / `/sys/class/drm`).
- [x] **Visibilitas proses container** (`top`) di detail container.
- [x] **Workspace volume in-place** (edit live, rename/move, single-file
  restore, rename volume).
- [x] **Hook lifecycle GitOps** (skrip pra-deploy runner, gated capability).
- [x] **Git lanjutan** (GPG signing, identitas commit, `.env.git` policy,
  host-key strict/accept-new, impor massal JSON sync).
- [x] **Notifikasi provider + templating** (adapter ala **Shoutrrr**,
  **Go-template**, success-body, batch) — tetap melengkapi dispatcher `APP06`.
- [x] **API key scoped** + **OpenAPI 3.1** + **NDJSON** stream + **chunked
  resumable upload**.
- [x] **CLI `POD`** tipis di atas `/rest/pages/POD/*`.
- [x] **Host shell/console**: **non-goal** (hanya exec container).

### 14.1 Keputusan lanjutan (perlu konfirmasi)

- [ ] **Push registry** (melengkapi pull) + login — termasuk sejak Fase A?
- [ ] **Podman Quadlet/systemd** (generate unit) — termasuk atau menyusul?
- [ ] Simpan **CA/cert TLS** di `pod_engine` (terenkripsi) untuk engine `tcp://`?
- [ ] **Approval aksi berisiko** (rollback, `down`, prune) via `APP04` + RBAC `BOOK`?
- [ ] **Prune/cleanup terjadwal** via `JMS` atau manual saja?
- [ ] **Cek update image**: on-demand saja atau juga berkala (via `JMS`)?
- [ ] **Webhook** termasuk fase awal atau lanjutan?
- [ ] **Kubernetes apply/scale/rollout** — kelola penuh atau tetap inventaris saja?
- [ ] **Auto-heal** default **ON/OFF**, scope engine vs per-container, dan
  batas `max_restarts`/jendela?
- [ ] **Patching**: otomatis setelah scan cocok atau wajib approval `APP04`?
- [ ] **Destinasi S3** backup: langsung di `pod_backup_schedule` atau menyusul?
- [ ] **Full system backup**: cakupan (DB + `base_dir` + data cluster) &
  penyimpanan **recovery key** (KMS vs kolom `*_enc`)?
- [ ] **Trivy server remote** self-hosted atau cloud?
- [ ] **Notifikasi**: default via dispatcher `APP06` atau provider langsung?
- [ ] Distribusi **CLI** (single binary/plugin) & auth via API key scoped?
- [ ] **OpenAPI 3.1** di-generate dari route atau ditulis tangan?

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- WebSocket proxy pola: `osc_rest/mechanic/sshproxy.go`.
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Retensi: `osc_rest/backbone/retention.go`.
- Upload/path helper: `osc_rest/backbone/upload.go` (`UploadBase`).
- Terminal UI: `osc_site/src/uix/web-terminal.tsx`, `osc_site/src/lib/ws.ts`.
- Deps siap pakai: `gorilla/websocket` (Go), `@xterm/xterm`,
  `@codemirror/lang-yaml`, `@uiw/react-codemirror` (frontend).
- **Agen:** `osc_auto/agent_vm` (per-VM; capability `engine` untuk POD,
  `metrics` untuk OBS); backend `osc_rest` = penghubung tunggal ke DB.
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_*.prisma`,
  [database/README.md](../database/README.md).
- Referensi fitur (untuk paritas): Dockge, **Arcane** (getarcane.app),
  Portainer.

## 16. Perbedaan Ringkas: Dockge vs Arcane vs `POD`

| Aspek | Dockge | Arcane | `POD` (target) |
|---|---|---|---|
| Fokus | Compose stacks sederhana | Manajemen Docker penuh + GitOps | Manajemen Docker/Podman + K8s, multi-tenant |
| GitOps | ❌ | ✅ pull/push | ✅ (Fase F) |
| Vulnerability scan | ❌ | ✅ | ✅ (Trivy, Fase G) |
| Backup volume | ❌ | ✅ | ✅ (Fase G) |
| Templates | ❌ | ✅ | ✅ (Fase H) |
| Remote agent | terbatas | ✅ mTLS | ✅ (`osc_auto/agent_vm`) |
| Multi-tenant/RBAC | dasar | user management | ✅ OmniSight (`company_id` + `USRole`) |
| Kubernetes | ❌ | ❌ (fokus Docker) | ✅ |
| Podman | ✅ | ✅ | ✅ |
| Update semver-aware + tulis ulang Compose | ❌ | terbatas | ✅ (Fase L) |
| Auto-heal / patching image | ❌ | terbatas | ✅ (Fase L) |
| Risk scoring + KEV/EPSS + scan terjadwal | ❌ | ✅ scan dasar | ✅ (Fase M) |
| Full system backup/restore | ❌ | ❌ | ✅ (Fase N) |
| Registry search & browse | ❌ | ✅ | ✅ (Fase O) |
| Notifikasi provider + templating | terbatas (webhook) | ✅ | ✅ (Shoutrrr-like, Fase P) |
| API scoped + OpenAPI 3.1 + CLI | ❌ | API | ✅ (Fase Q) |
| Host shell/console | ✅ | ✅ | ❌ non-goal (exec container) |

## 17. Catatan Gap yang Dilengkapi (audit Dockge & Arcane)

Ringkasan penambahan dari audit paritas (tanpa menghapus keputusan lama):

- **Update** — strategi **semver-aware** + tulis ulang image ref ke Compose,
  cek **event-driven** ber-debounce, **auto-heal** `unhealthy` (throttle +
  admission gate), **patching** ala Copacetic. Model: `pod_update_check`,
  `pod_heal_policy`, `pod_patch`; perluasan `pod_image`/`pod_container`.
- **Scan & intel** — scan **terjadwal**, **risk score 0–100**, **CISA KEV**,
  **FIRST EPSS**, tren, CSV, aksi massal. Model: `pod_scan_schedule`,
  `pod_threat_intel`; perluasan `pod_scan`/`pod_scan_finding`.
- **Backup** — jadwal **cron** (S3 opsi) + **full system backup/restore**
  (recovery key, restore selektif, safety-backup). Model:
  `pod_backup_schedule`, `pod_system_backup`; perluasan `pod_backup`.
- **Registry** — **search & browse** repo/tag/digest/platform + ECR token
  (proxy OCI penuh tetap non-goal). Model: `pod_registry_repository`,
  `pod_registry_tag`.
- **Observability** — log **terstruktur**, visualisasi **resource**, **GPU**,
  proses container, topologi network + **published ports**. Model: `pod_gpu`,
  `pod_port_binding`, `pod_log_setting`.
- **Volume** — workspace **in-place** (edit live, rename/move, single-file
  restore, rename volume).
- **GitOps lanjutan** — **hook pra-deploy** runner (gated capability), GPG
  signing, identitas commit, `.env.git` policy, host-key mode, impor massal.
  Perluasan `pod_git_credential`/`pod_git_sync`.
- **Notifikasi** — provider **ala Shoutrrr** + **Go-template** + success-body
  + batch (dispatcher `APP06` tetap). Model: `pod_notification_channel`,
  `pod_notification_template`.
- **API & CLI** — **API key scoped**, **OpenAPI 3.1**, **NDJSON**, **chunked
  resumable upload**, CLI `POD`. Model: `pod_api_key`.
- **Non-goal** — **host shell/console** (hanya exec container).

> Catatan: referensi ke dokumen dispatcher notifikasi/kontrol admin kini
> [`app_sys.md`](app_sys.md) (sebelumnya `app_admin.md`).
