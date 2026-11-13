# SOC Security Verification Report: Wave 3 — Mandatory MFA PAM & Step-Up, Ephemeral Ticket Replay, Command ACL Evasion & Vault Isolation, SIEM/FIM Spoofing

- **Date**: 2026-11-13
- **Author**: ai-test (SOC Security Engineer)
- **Workspace**: `osc_docs/test/rest_soc`
- **Security Test Suite Location**: `osc_docs/test/rest_soc/test/wave3/` (ditambah unit pendukung di `test/unit/test_w3_exploit_vectors.py`)
- **Target API & Contract Reference**: `osc_docs/rest/api-w3.md`, `osc_docs/rest/contracts/w3.openapi.yaml`, `osc_docs/base/schema-p3.md` (§3.13–3.19 SecOps & PAM)

## 1. Threat Model & Attack Surface

Permukaan serangan Wave 3 `osc_rest` + `pam_bastion_gateway` yang diaudit (kredensial & referensi dari ENV, zero hardcoded secret; RoE non-destruktif — tidak ada command yang benar-benar dieksekusi ke aset):

1. **Mandatory MFA PAM & Step-Up 15 Menit (`POST /pam/sessions/authorize`, §2)** — user `mfa_enabled == false` mencoba otorisasi sesi (dengan & tanpa menyelundupkan `otp`, termasuk JSON injection `{"$gt": ""}` dan super admin tanpa MFA — penolakan wajib tanpa kecuali `403 MFA_REQUIRED_FOR_PAM`); step-up kedaluwarsa disimulasikan **deterministik** via login backup-code (`mfa_last_verified_step = 0` → usia verifikasi ≫ 15 menit, api-w3 §1.1) → wajib `403 PAM_STEP_UP_REQUIRED` tanpa `otp`; replay OTP (step ≤ tersimpan) → `401`; lockout 5 gagal/15 menit → `429` (gated `SOC_W3_ALLOW_LOCKOUT`). Penolakan wajib tercatat `pam_session_logs` DENIED dan tidak boleh membocorkan apa pun.
2. **Ephemeral PAM Session Ticket (`POST /agents/pam/ticket/redeem`, HMAC gateway)** — ticket 256-bit TTL ≤ 120 s (clamp 30–600) sekali pakai: redeem pertama sah mengembalikan plaintext kredensial target **tepat sekali** (jalur internal), redeem kedua (replay) wajib `409 CONFLICT`; ticket tampered 1 karakter (bit-flip/truncate/append/case), ticket acak, malformed (kosong/non-hex/unicode/traversal/4 KB), ticket > TTL (env), dan impersonasi gateway (tanpa HMAC, secret salah, agent palsu, ts stale) → `401` generik — respons error/replay **tidak boleh** memuat kredensial.
3. **Command ACL Evasion (`pam_bastion_gateway`) & Vault Isolation** — API-side: `policy.command_filter` (deny/confirm/allow) terkirim utuh pada respons authorize; ACL itu sendiri dievaluasi di agent Go (WS→SSH), sehingga kebenarannya diverifikasi lewat **evaluator referensi** (`application/w3_vectors.evaluate_command`) — spesifikasi executable kontrak gateway (strip ANSI + kontrol, unwrap `sudo`/`env`/assignment + basename, deny menang atas allow, `re:` case-insensitive, regex malformed = fail-closed, confirm = deny-by-default W4) melawan **18 vektor evasion** membaca `/etc/shadow` (sudo flags, path absolut, uppercase, backslash, ANSI wrap, null-byte, tab, newline smuggling, backtick, `$(…)`, base64 pipe, xargs, double-slash, dst.). Isolasi vault dipindai menyeluruh: TIDAK ADA respons (authorize, listing/detail sesi, upload rekaman, error, header) yang memuat plaintext canary, blob `OMS1|`, `secret_encrypted`, `ws_ticket_hash`, atau kunci `"secret"`; probing `account_id` asing/malformed → `400/404` tanpa 5xx/kebocoran lintas tenant (anti IDOR).
4. **Spoofing Event SIEM/FIM (`POST /agents/security/ingest`, HMAC agent)** — keempat kelas event palsu (FIM `/etc/shadow` MODIFIED, alert CRITICAL MITRE T1110, CVE-2026-99999 CRITICAL, compliance CIS FAIL) dikirim **tanpa HMAC valid**: tanpa header, signature garbage/salah-secret, body tampering (partial replay), agent palsu, timestamp stale/future (±30 s), reuse signature lintas-endpoint → `401 UNAUTHORIZED` generik dan **counts `GET /secops/overview` tidak berubah** (zero persist — SIEM poisoning mustahil). Dengan HMAC sah sekalipun: `asset_id` ≠ agent pelapor (spoof lintas host) → `400 VALIDATION_ERROR`, field invalid (checksum non-hex-64, `cve_id` malformed, CVSS > 10, enum) → `400` sebelum persist, batch > batas (501/201) → `400`.

## 2. Clean Architecture Security Suite Structure

- `src/domain/`: `findings.py` (`SecurityFinding`, `Severity`, `AuditEvidence` ter-redaksi) + `gateways.py` (port `SecurityClient`) — fondasi dipertahankan.
- `src/application/`:
  - `w3_vectors.py` (baru) — vektor & spesifikasi executable: `step_age_seconds`/`is_step_up_required` (Δstep × 30 s vs window), `step_up_boundary_cases` (termasuk batas tepat 900 s == window & backup-code step 0), `otp_rescue_attempts`, `tampered_tickets`/`malformed_tickets`/`random_ticket`, evaluator referensi ACL (`strip_ansi_and_control`, `unwrap_program`, `evaluate_command` — deny menang, fail-closed) + `acl_evasion_vectors` (18) & `acl_benign_commands`, `recording_magic_forgeries`, `forged_{fim,alert,vulnerability,compliance}_batch`, `hmac_forgery_cases`, `batch_over_limit_payloads`, `invalid_event_fields`, pemindai `secret_leak_scan` (marker struktural + canary plaintext).
  - `hmac_agent.py` — signer kanonis (RFC 2104 + vektor RFC 4231), dipakai untuk signature sah & palsu.
- `src/infrastructure/`:
  - `w3_soc_client.py` (baru) — `W3SecurityClient` di atas `HttpxSecurityClient` (redaksi bukti + RoE): `authorize_session` (JWT + opsi `X-Forwarded-For` untuk CIDR ACL), `post_agent` (fault injection `ts`/`signature`/`omit`/`body_override` via komposisi `W2SecurityClient`), `upload_recording` (body biner `application/octet-stream`, signature mengikat `sha256_hex(body)`), `get_json` untuk audit trail.
- `test/`: `test/wave3/` (4 modul + `conftest.py` env-driven) + `test/unit/test_w3_exploit_vectors.py` — marker `@pytest.mark.soc`, `@pytest.mark.auth_bypass`, `@pytest.mark.pam`, `@pytest.mark.siem`, `@pytest.mark.wave3`, `@pytest.mark.unit`; live skip deterministik bila target bukan osc_rest (gate health 200/503) dan bila kredensial ENV tidak lengkap (setiap fixture menyatakan variabel yang dibutuhkan).

## 3. Security Control & Attack Matrix

| Check ID | OWASP / CWE Category | Attack Vector Tested | Expected Defense | Result |
| :--- | :--- | :--- | :--- | :--- |
| `SOC-W3-001` | API2:2023 / CWE-308 | Authorize PAM oleh user `mfa_enabled == false` | `403 MFA_REQUIRED_FOR_PAM` + sesi DENIED, tanpa kecuali | Pass (kebijakan) / Skip (live — target tidak terjangkau) |
| `SOC-W3-002` | API2:2023 / CWE-285 | 5 upaya "rescue" OTP oleh user tanpa MFA (`123456`, kosong, spasi, `{"$gt":""}`, numerik) | Gate #3 mendahului verifikasi OTP #7 → tetap `403 MFA_REQUIRED_FOR_PAM` | Pass / Skip (live) |
| `SOC-W3-003` | API2:2023 / CWE-250 | Super admin tanpa MFA mencoba authorize (env opsional) | `403 MFA_REQUIRED_FOR_PAM` — tanpa pengecualian role (bab 5.3) | Pass / Skip (live) |
| `SOC-W3-004` | API7:2023 (audit trail) | Verifikasi penolakan tercatat | `pam_session_logs` berstatus DENIED; tanpa `ticket`/`ws_ticket_hash` | Pass / Skip (live) |
| `SOC-W3-005` | Kontrol positif | MFA segar → authorize tanpa `otp` | `201` + ticket hex-256-bit, TTL ≤ 600 s, `policy.command_filter` terkirim, zero leak | Pass / Skip (live) |
| `SOC-W3-006` | API2:2023 / CWE-613 | Step-up kedaluwarsa (login backup-code → step 0) tanpa `otp` | `403 PAM_STEP_UP_REQUIRED` — verifikasi lama tak berlaku | Pass / Skip (live) |
| `SOC-W3-007` | Kontrol positif | Step-up kedaluwarsa + OTP valid | `201` — alur pemulihan sesuai kontrak | Pass / Skip (live) |
| `SOC-W3-008` | API2:2023 / CWE-613 | Step-up kedaluwarsa + `otp` kosong/tiada (2 varian) | `403 PAM_STEP_UP_REQUIRED` | Pass / Skip (live) |
| `SOC-W3-009` | API2:2023 / CWE-294 | OTP SAMA dipakai dua authorize (step ≤ tersimpan) | Pemakaian kedua `401 UNAUTHORIZED` — anti-replay step | Pass / Skip (live) |
| `SOC-W3-010` | API4:2023 (rate limit) | 5 kegagalan OTP lalu OTP valid (gated `SOC_W3_ALLOW_LOCKOUT`) | Ke-6 → `429 RATE_LIMITED` — lockout 5×/15 mnt (`mfa:{user_id}`) | Pass / Skip (live, gated) |
| `SOC-W3-020` | API2:2023 (jalur internal) | Redeem ticket sah | `200` + plaintext kredensial target TEPAT SEKALI; tanpa ciphertext/blob | Pass / Skip (live) |
| `SOC-W3-021` | API2:2023 / CWE-294 | **Replay ticket terpakai** | `409 CONFLICT` (redeem atomik `WHERE status='AUTHORIZED'`), zero kredensial di respons | Pass / Skip (live) |
| `SOC-W3-022` | API2:2023 / CWE-345 | 5 ticket tampered (flip karakter awal/akhir, truncate, append, case) | `401 UNAUTHORIZED` — SHA-256 lookup ketat | Pass / Skip (live) |
| `SOC-W3-023` | API2:2023 | Ticket acak 256-bit tak pernah diterbitkan | `401` generik | Pass / Skip (live) |
| `SOC-W3-024` | API2:2023 / CWE-20 | 8 ticket malformed (kosong, pendek, `0x…`, unicode, traversal, 4 KB) | `400/401/404` rapi tanpa detail internal | Pass / Skip (live) |
| `SOC-W3-025` | API2:2023 / CWE-613 | Ticket > TTL (env `SOC_W3_EXPIRED_TICKET`/`_SESSION_ID`) | `401 UNAUTHORIZED` — TTL ditegakkan | Pass / Skip (live) |
| `SOC-W3-026` | API2:2023 / CWE-294 | Impersonasi gateway: tanpa HMAC, secret salah, agent palsu, ts stale | `401 UNAUTHORIZED` generik + zero kredensial | Pass / Skip (live) |
| `SOC-W3-030` | API3:2023 (kontrak) | Integritas `policy.command_filter` pada respons authorize | Objek `{deny, confirm, allow}` terkirim utuh ke gateway | Pass / Skip (live) |
| `SOC-W3-031` | CWE-693 (ACL evasion) | **18 vektor evasion** membaca `/etc/shadow` vs evaluator referensi | Semua → DENY (strip ANSI/kontrol, sudo/env/assignment + basename, deny menang) | Pass (unit) |
| `SOC-W3-032` | CWE-693 | `allow: ["cat"]` vs `deny: ["/etc/shadow"]` | Deny MENANG (`cat /etc/shadow` → DENY; `cat /etc/hostname` → ALLOW) | Pass (unit) |
| `SOC-W3-033` | CWE-693 (deny-by-default W4) | Aturan `confirm` (`re:reboot`) pada `sudo reboot -f` | `CONFIRM` → dievaluasi DENY oleh gateway (workflow W4) | Pass (unit) |
| `SOC-W3-034` | CWE-693 (fail-safe) | Regex ACL malformed (`re:[unclosed`) pada deny & allow | Fail-closed → DENY, bukan crash/bypass | Pass (unit) |
| `SOC-W3-035` | CWE-693 (anti-smuggle) | ANSI escape + null-byte + newline di baris perintah | Di-lucuti SEBELUM pencocokan aturan → tetap DENY | Pass (unit) |
| `SOC-W3-036` | CWE-200 (zero secret leakage) | Pindai seluruh respons/header authorize (marker `OMS1|`, `secret_encrypted`, `ws_ticket_hash`, `"secret"`, canary plaintext) | Zero kebocoran — secret tidak pernah di-echo | Pass / Skip (live) |
| `SOC-W3-037` | CWE-200 | Pindai `GET /pam/sessions` & `/{id}` | Hanya pointer `recording_object_key`; tanpa ticket/hash/secret | Pass / Skip (live) |
| `SOC-W3-038` | API1:2023 (IDOR) / CWE-639 | Probing `account_id`: UUID nol, malformed, traversal | `400/404` rapi — tanpa 5xx, tanpa label/secret tenant lain | Pass / Skip (live) |
| `SOC-W3-039` | API8:2023 / CWE-436 | Rekaman menyamar: teks/ZIP/MP4-tanpa-ftyp/JSON dikirim sebagai `CAST_GZ` | `400/413/415` — magic byte divalidasi server-side, zero leak | Pass / Skip (live) |
| `SOC-W3-040` | API3:2023 | Upload rekaman sah (gzip) | `201` metadata pointer-only; key `pam/{company}/{session}/…` aman + sha256-64 | Pass / Skip (live) |
| `SOC-W3-041` | CWE-200 | Error redeem (ticket tampered) | Tanpa kredensial target di respons error | Pass / Skip (live) |
| `SOC-W3-042` | API2:2023 / CWE-294 | Batch FIM palsu (`/etc/shadow` MODIFIED) TANPA header HMAC | `401 UNAUTHORIZED` + counts `/secops/overview` tidak berubah (zero persist) | Pass / Skip (live) |
| `SOC-W3-043` | API2:2023 / CWE-345 | 4 kelas spoof (FIM/alert/CVE/compliance) tanpa HMAC | Semua `401` generik, tanpa detail internal | Pass / Skip (live) |
| `SOC-W3-044` | API2:2023 / CWE-347 | 9 varian pemalsuan HMAC (header hilang, garbage, secret salah, body tampering, agent palsu, ts stale/future, reuse lintas-endpoint) | Semua `401` + counts tetap — window ±30 s & kanonis signature ketat | Pass / Skip (live) |
| `SOC-W3-045` | API2:2023 (SIEM poisoning) | Alert CRITICAL palsu (MITRE T1110) tanpa HMAC | `401` + `alerts_unacknowledged` tidak bertambah | Pass / Skip (live) |
| `SOC-W3-046` | API1:2023 (anti-spoof lintas host) | HMAC sah tapi `asset_id` ≠ agent pelapor | `400 VALIDATION_ERROR` — `asset_id` dipaksa identik agent pelapor | Pass / Skip (live) |
| `SOC-W3-047` | API8:2023 / CWE-20 | Field invalid ber-HMAC sah: checksum non-hex-64, `cve_id` malformed, CVSS 99, enum `MAYBE` | `400 VALIDATION_ERROR` sebelum persist | Pass / Skip (live) |
| `SOC-W3-048` | API4:2023 (DoS batch) | Batch > batas: FIM 501, alert 201, vuln 501, compliance 501 | `400 VALIDATION_ERROR` | Pass / Skip (live) |
| `SOC-W3-049` | API4:2023 (rate limit) | Burst 12× ingest tanpa HMAC | Hanya `401/429`, konsisten, tanpa 5xx | Pass / Skip (live) |
| `SOC-W3-050` | API7:2023 / CWE-209 | Bentuk respons penolakan spoofing | Envelope `status:"error"` generik; payload spoofed tidak di-echo balik | Pass / Skip (live) |

> Unit pendukung (`test/unit/test_w3_exploit_vectors.py`, 18 test): batas step-up (`step_up_boundary_cases`), formula usia 30 s/step, backup-code selalu stale, tampering ticket deterministik, pemindai kebocoran (marker + canary, canary < 4 char diabaikan), bentuk batch palsu.

## 4. Remediation & Hardening Recommendations

Semua kontrol sesuai desain api-w3 §1.1/§4 pada level kebijakan test; saat audit live dijalankan (stack hidup), rekomendasi berlaku untuk setiap check yang FAIL:

1. **Mandatory MFA (SOC-W3-001..003)** → pastikan gate `user.mfa_enabled` dievaluasi SEBELUM step-up/OTP/CIDR dan tidak menerima pengecualian role apa pun (termasuk super admin); kode error `MFA_REQUIRED_FOR_PAM` harus tetap diekspos agar log SOC konsisten; setiap penolakan wajib menulis `pam_session_logs` DENIED + `denied_reason`.
2. **Step-up 15 menit (SOC-W3-006..010)** → pertahankan derivasi usia dari `mfa_last_verified_step` (`(now_step − last_step) × 30 s`, bandingkan KETAT `>` window); anti-replay `step ≤ tersimpan ditolak` dievaluasi atomik bersama pembaruan step; lockout `mfa:{user_id}` 5 gagal/15 menit aktif per-user (bukan per-session) dan mengembalikan `429` ber-envelope konsisten.
3. **Ticket sekali pakai (SOC-W3-021..026)** → redeem tetap satu statement atomik (`UPDATE … SET status='ACTIVE' WHERE id=$1 AND status='AUTHORIZED' AND ws_ticket_hash=$2 AND expires_at > now()`), hash disimpan SHA-256 dengan salt tidak diperlukan (entropi 256-bit), dan plaintext ticket zero-ize di memori gateway setelah redeem; respons `409/401` tidak boleh membedakan "ticket terpakai" vs "tidak dikenal" lebih dari enum kode kontrak.
4. **ACL & vault isolation (SOC-W3-031..041)** → evaluator ACL gateway (Go) wajib mengikuti urutan referensi: strip ANSI/kontrol → unwrap `sudo`/`env`/assignment + basename → deny → confirm (deny W4) → allowlist; regex malformed fail-closed. Jangan pernah meng-echo secret pada respons mana pun (kecuali redeem internal yang sah, tepat satu kali); pastikan `logging::redact` menutup `secret`/`ticket`/`ws_ticket_hash` pada log; object key rekaman tetap server-generated `pam/{company}/{session}/{uuidv7}`.
5. **Ingest SIEM/FIM (SOC-W3-042..050)** → tolak HMAC di luar window ±30 s SEBELUM parsing body; bandingkan signature constant-time; bind `asset_id` pada baris agent pelapor di level query (bukan validasi app terpisah); validasi enum/checksum/CVSS/batas batch sebelum INSERT; pertahankan `tower-governor` per-IP pada route publik ingest.

## 5. Verification Notes

- Reproduksi live: `docker compose up -d osc_base rustfs osc_rest`, lalu set env (lihat `test/wave3/conftest.py`): `SOC_W3_PAM_USERNAME/PASSWORD` + `SOC_W3_PAM_MFA_SECRET` + `SOC_W3_PAM_BACKUP_CODE`, `SOC_W3_NOMFA_USERNAME/PASSWORD`, `SOC_W3_PAM_ACCOUNT_ID`, `SOC_W3_GATEWAY_AGENT_ID/SOC_W3_GATEWAY_HMAC_SECRET`, `SOC_W3_AGENT_ID/SOC_W3_AGENT_HMAC_SECRET`, opsional `SOC_W3_SUPERADMIN_NOMFA_*`, `SOC_W3_EXPIRED_TICKET`+`SOC_W3_EXPIRED_SESSION_ID`, `SOC_W3_VAULT_SECRET_CANARY`, `SOC_W3_ALLOW_LOCKOUT=1` (uji lockout — jalankan terakhir), kemudian:
  `cd osc_docs/test/rest_soc && python3 -m pytest -v` (semua) atau `python3 -m pytest test/wave3 -v -m "soc"` / `python3 -m pytest test/wave3 test/unit/test_w3_exploit_vectors.py -v`.
- Status verifikasi lokal (tanpa stack): `python3 -m pytest -q` → **74 passed, 172 skipped** (exit 0); khusus Wave 3 + unit vektor W3 → **47 passed, 74 skipped** (exit 0). Baseline sebelum Hari 19: 27 passed / 98 skipped.
- Catatan lingkungan: probe health `127.0.0.1:8000` menjawab `401` (bukan 200/503) → gate RoE meng-skip seluruh audit live deterministik; tidak ada vektor yang dikirim ke layanan yang bukan osc_rest.
- Simulasi step-up kedaluwarsa sengaja memakai **login backup-code** (step tersimpan 0 → usia verifikasi = now×30 s ≫ 15 menit, api-w3 §1.1) — deterministik tanpa menunggu 15 menit; kode cadangan yang dipakai hangus (perilaku kontrak W1) — sediakan khusus untuk QA.
- Vektor sengaja memakai UUID nol untuk FK — penolakan terjadi pada tenant-guard/validasi, bukan bencana data; sesi PAM DENIED/AUTHORIZED yang tercipta adalah audit trail sah milik tenant QA (tidak ada rekaman/alert palsu yang ter-persist karena seluruh vektor spoofing ditolak HMAC).
