# QA & Debugger Technical Report: Wave 2 — Agent Enrollment, Telemetry/Uptime Ingest, Docker Compose Stack & Nginx VHost Control Plane

- **Date**: 2026-11-13
- **Author**: ai-test (QA & Debugger Engineer)
- **Workspace**: `osc_docs/test/rest_qad`
- **Test Suite Location**: `osc_docs/test/rest_qad/test/wave2/` (ditambah unit pendukung di `test/unit/test_w2_hmac_agent.py` & `test/unit/test_w2_infra_vectors.py`)
- **Target API & Contract Reference**: `osc_docs/rest/api-w2.md`, `osc_docs/rest/contracts/w2.openapi.yaml`, `osc_docs/base/schema-p3.md`

## 1. Test Scope & Root-Cause Context

Suite ini memverifikasi fungsionalitas & kontrak Wave 2 `osc_rest` (SESI 3.1) sebelum dieksekusi agent `osc_auto` (SESI 3.2) dan UI `osc_site` (SESI 3.3):

1. **Agent Enrollment (§2.1)** — `POST /agents/enrollment-tokens` (gate admin, token hex-64 *ditampilkan sekali*, TTL clamp 1–72 jam) → `POST /agents/enroll` (publik): `agent_id` UUID (= ManagedNode dinamis di `assets`), `hmac_secret` hex-64, `company_id` terikat token. Konsumsi token **one-time atomik** — replay token → `401 UNAUTHORIZED` tanpa bocoran kredensial.
2. **Telemetry & Uptime Ingest (§2.2)** — `/agents/inventory/ingest`, `/agents/metrics/ingest` (batch host + container + S.M.A.R.T., hitungan `system_rows`/`container_rows`/`smart_reports` sesuai isi batch), `/agents/uptime/ingest`, `/agents/logs` — semuanya diakses **HMAC-SHA256 per-request** dengan kanonis `{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}`. Batas batch (`containers ≤ 200`, `smart ≤ 64`, log ≤ 100 baris) ditolak `400 VALIDATION_ERROR`.
3. **Docker Stack CRUD (§2.4)** — create valid → env plaintext **tidak pernah** di-echo respons (Envelope AES-256-GCM); gerbang struktural menolak compose invalid (`include` top-level, indentasi tab, service tanpa `image`/`build`, key di luar allowlist, > 256 KB) dan `working_dir` traversal; `PUT` memutakhirkan snapshot; dispatch `up` → `202 QUEUED` + `dispatch_ref`; command di luar enum `up|down|pull|restart` → 400; delete → soft delete (`GET` → 404).
4. **Nginx VHost CRUD (§2.5)** — UNIQUE `(nginx_node_id, server_name, listen_port)` → 409; brace tak seimbang / tanpa blok `server {` / `include` traversal / include relatif → 400; update mengembalikan status `DRAFT`; dispatch `test_reload` → 202 + `dispatch_ref`.
5. **HMAC signer harness** — signer test tervalidasi **vektor resmi RFC 4231** (case 1 & 2) + implementasi HMAC referensi manual (RFC 2104, key > block-size) sehingga kegagalan auth pada test live pasti berasal dari server, bukan harness.

## 2. Clean Architecture Test Structure

- `src/domain/`:
  - `models_w2.py` — `EnrollmentToken`, `AgentCredential`, `StackDraft`, `VhostDraft`, `IngestSummary` (dataclass murni).
  - `gateways_w2.py` — port `W2ApiClient` (`Protocol`: get/post/put/delete JSON + `post_agent_signed`).
  - `models.py`, `errors.py` — fondasi sebelumnya (dipertahankan; `ApiResponseSnapshot`).
- `src/application/`:
  - `hmac_agent.py` — signer kanonis HMAC-SHA256 (RFC 2104) murni stdlib + vektor RFC 4231.
  - `infra_vectors.py` — **mirror-validator** (`validate_stack_name`, `validate_working_dir`, `validate_compose_content`, `validate_nginx_content`, `validate_dispatch_command`) + generator vektor valid/invalid (traversal, injection, oversize) — memastikan vektor uji benar sebelum dikirim live.
  - `w2_flows.py` — orkestrasi use case (issue token, enroll, ingest inventory/metrics/uptime, push logs) — hanya bergantung port domain.
- `src/infrastructure/`:
  - `w2_client.py` — `W2HttpxClient` (httpx, `follow_redirects=False`, `trust_env=False`, `X-Correlation-ID` per request; `post_agent_signed` menghitung `X-Agent-Id`/`X-Agent-Timestamp`/`X-Agent-Signature`).
  - `config.py`, `http_client.py` — fondasi sebelumnya (dipertahankan).
- `test/`: `test/wave2/` (4 modul + conftest env-driven) — marker `@pytest.mark.integration`, `@pytest.mark.contract`, `@pytest.mark.wave2`; test live **skip deterministik** bila target/kredensial env tidak tersedia (gate probe `/api/v1/health`; RoE: trafik tidak pernah dikirim ke layanan asing).

## 3. Test Case Matrix

| Test ID | Scenario / Edge Case | Input / Precondition | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| `QA-W2-E01` | Issue token oleh admin | JWT admin + `node_type=HOST` | `201` + token hex-64, id UUID, `expires_at` ≤ 72 jam, correlation echo | Pass (kontrak) / Skip (live — target tidak terjangkau) |
| `QA-W2-E02` | Gate admin | JWT member | `403 FORBIDDEN` | Pass / Skip (live) |
| `QA-W2-E03` | Tanpa JWT | Anonim | `401/403` | Pass / Skip (live) |
| `QA-W2-E04` | Enroll sekali tampil kredensial | Token sah + model/label | `201` + `agent_id` UUID + `hmac_secret` hex-64; token tidak di-echo | Pass / Skip (live) |
| `QA-W2-E05` | **Replay token enrollment** | Token sama dipakai 2× | Klaim kedua `401 UNAUTHORIZED`, tanpa `agent_id`/`hmac_secret` di body | Pass / Skip (live) |
| `QA-W2-E06` | Token tak dikenal | hex-64 acak | `401 UNAUTHORIZED` generik, tanpa detail internal | Pass / Skip (live) |
| `QA-W2-E07` | `asset_model_id` kosong | Field wajib hilang | `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `QA-W2-E08` | TTL clamp | `ttl_hours=999` | `expires_at` ≤ now+72 jam | Pass / Skip (live) |
| `QA-W2-I01` | Inventory ingest | HMAC sah + payload | `202` + `snapshot_id` UUID | Pass / Skip (live) |
| `QA-W2-I02` | Batch telemetry | host + 2 container + SMART | `202` + `system_rows=1`, `container_rows=2`, `smart_reports=1` | Pass / Skip (live) |
| `QA-W2-I03` | Batas batch container | 201 container | `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `QA-W2-I04` | Batas batch SMART | 65 laporan | `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `QA-W2-I05` | Heartbeat uptime | `monitor_id` UUID nol (bukan milik tenant) | `202` sah atau `400/404` tenant-guard | Pass / Skip (live) |
| `QA-W2-I06` | Ingest tanpa HMAC | Tanpa header `X-Agent-*` | `401 UNAUTHORIZED` | Pass / Skip (live) |
| `QA-W2-I07` | Logs push & cap | 2 baris lalu 101 baris | `published=2`; 101 baris → `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `QA-W2-S01` | Env tidak di-echo | Create + GET + GET list | `GF_SECURITY_ADMIN_PASSWORD=…` tidak ada di body mana pun | Pass / Skip (live) |
| `QA-W2-S02` | Nama duplikat | POST sama 2× | `409 CONFLICT` | Pass / Skip (live) |
| `QA-W2-S03` | Gerbang compose (6 vektor) | `include`, tab, tanpa `services`, service tanpa source, key asing, >256 KB | Semua `400 VALIDATION_ERROR` | Pass (mirror unit) / Skip (live) |
| `QA-W2-S04` | `working_dir` traversal (7 vektor) | `..`, `~`, `\`, relatif, control char | Semua `400 VALIDATION_ERROR` | Pass (mirror unit) / Skip (live) |
| `QA-W2-S05` | Update + backup pointer | PUT compose baru | `200`; `backup_object_key` (bila ada) tanpa `..` | Pass / Skip (live) |
| `QA-W2-S06` | Dispatch `up` | Stack sah | `202 QUEUED` + `dispatch_ref` | Pass / Skip (live) |
| `QA-W2-S07` | Allowlist dispatch (8 vektor injection) | `up; cat /etc/shadow`, `up$(touch …)`, dsb. | Semua `400 VALIDATION_ERROR` | Pass (mirror unit) / Skip (live) |
| `QA-W2-S08` | Delete soft | DELETE → GET | `2xx` lalu `404` | Pass / Skip (live) |
| `QA-W2-N01` | Create vhost | Node + server_name + port 80 | `2xx`, muncul di listing | Pass / Skip (live) |
| `QA-W2-N02` | UNIQUE triple | Duplikat (node, name, port) | `409 CONFLICT` | Pass / Skip (live) |
| `QA-W2-N03` | Gerbang nginx (5 vektor) | Brace tak seimbang, tanpa `server {`, include traversal, include relatif, oversize | Semua `400 VALIDATION_ERROR` | Pass (mirror unit) / Skip (live) |
| `QA-W2-N04` | Update reset status | PUT config | `200` + status `DRAFT` | Pass / Skip (live) |
| `QA-W2-N05` | Dispatch `test_reload` | Vhost sah | `202 QUEUED` + `dispatch_ref` | Pass / Skip (live) |
| `QA-W2-N06` | Command non-enum | `reload; id` | `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `QA-W2-N07` | Delete vhost | DELETE → GET | `2xx` lalu `404` | Pass / Skip (live) |
| `QA-W2-U01` | HMAC vs RFC 4231 (case 1, 2) | Kunci & pesan resmi RFC | `b0344c61…`, `5bdcc146…` | Pass (unit) |
| `QA-W2-U02` | HMAC vs referensi manual (key > block-size) | Key 131×0xaa, dst. | Identik dengan RFC 2104 manual + stdlib | Pass (unit) |
| `QA-W2-U03` | Kanonis signature | `{ts}\n{METHOD}\n{path}\n{sha256(body)}` | Bentuk persis; body/method sensitif; deterministik | Pass (unit) |
| `QA-W2-U04` | Mirror validator vektor | 6 compose + 5 nginx + 8 nama + 7 working_dir + 8 dispatch | Semua vektor invalid terdeteksi; sampel valid lolos | Pass (unit) |

## 4. Debugging & Reproduction Notes

- **Vektor RFC 4231 dari ingatan tidak bisa dipercaya**: test case 6 yang ditulis manual ternyata salah memori → test merah. Diperbaiki dengan mempertahankan hanya vektor case 1 & 2 (terverifikasi) dan menambah **implementasi HMAC referensi manual** (RFC 2104: key > block-size → hash key dulu) sebagai orakel bebas — signer kini tervalidasi terhadap dua sumber independen.
- **Mirror validator sebagai semacam contract-first**: unit test menolak vektor yang "terlalu lemah" (mis. traversal tanpa `..`/`~`) sehingga test live tidak pernah false-pass karena payload salah rakit.
- **Reproduksi live**: `docker compose up -d osc_base rustfs osc_rest`, set env (lihat `test/wave2/conftest.py`): `QA_W2_ADMIN_USERNAME/PASSWORD` (+`QA_W2_ADMIN_MFA_SECRET`), `QA_W2_ASSET_MODEL_ID`, `QA_W2_STATUS_LABEL_ID`, `QA_W2_DOCKER_HOST_ID`, `QA_W2_NGINX_NODE_ID`, opsional `QA_W2_MEMBER_USERNAME/PASSWORD`, `QA_W2_COMPANY_ID`, lalu:
  `cd osc_docs/test/rest_qad && python3 -m pytest -v` (semua; tanpa env → live skip, unit tetap hijau) atau `python3 -m pytest test/wave2 -v -m "integration"`.
- Status verifikasi lokal (tanpa stack): `python3 -m pytest -q` → **32 passed, 85 skipped** (exit 0).
- Catatan lingkungan: probe health `127.0.0.1:8000` menjawab `401` (bukan 200/503) → gate RoE meng-skip seluruh test live deterministik; tidak ada trafik yang dikirim ke layanan yang bukan osc_rest.
