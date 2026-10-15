# Audit Keamanan OmniSight

Dokumen ini merangkum hasil audit keamanan stack OmniSight (backend `osc_rest`
Go/Gin, frontend `osc_site` Next.js 16, database `osc_base` PostgreSQL, agen,
dan `docker-compose.yml`), khususnya untuk skenario **diekspos ke internet
dengan domain publik**.

Tujuan: memastikan stack tidak dapat dieksploitasi setelah diberi domain, dan
mendokumentasikan perbaikan yang sudah dilakukan beserta sisa risikonya.

## Ringkasan

Sebelum perbaikan, stack **belum aman** untuk dipublikasikan: ada kunci
enkripsi default yang dapat diprediksi, endpoint file tanpa autentikasi,
token sesi terekspos ke JavaScript, 2FA tidak ditegakkan, WebSocket tanpa
proteksi origin, path traversal pada unggahan, SSRF pada login HRIS, dan
port database terekspos.

## Temuan & Status

### Kritis (sudah diperbaiki)

| # | Temuan | Lokasi | Perbaikan |
| --- | --- | --- | --- |
| 1 | Kunci AES default hardcoded & `RE_SECRET` kosong | `osc_rest/mechanic/crypto.go` | `InitCrypto()` fail-closed; wajib `RE_SECRET` ≥32 byte; kunci default dihapus |
| 2 | Route file tanpa autentikasi + cek prefix cacat + cache publik | `osc_site/src/app/files/[...path]/route.ts` | Wajib sesi; boundary path ketat; `private, no-store`, `nosniff`, `attachment` untuk non-gambar |
| 3 | 2FA/TOTP disimpan tetapi tidak diverifikasi | `osc_rest/skeleton/pub/pub00_usecase.go` | Verifikasi TOTP wajib saat `is_totp_enabled`; klien meminta kode 2FA |
| 4 | Token sesi di localStorage + cookie tanpa `HttpOnly`/`Secure`/`SameSite` | `osc_site/src/lib/utility.ts`, `proxy/guest`, `proxy/pages` | Token pindah ke cookie `HttpOnly; Secure; SameSite=Lax` (server-set); JS hanya menyimpan profil |
| 5 | `CheckOrigin` selalu `true` → CSWSH; tanpa deadline | `osc_rest/mechanic/sshproxy.go` | Allowlist origin (`WS_ALLOWED_ORIGINS`/same-host); ping/pong + deadline; batas pesan |
| 6 | Path traversal via `entityID` pada unggahan | `osc_rest/backbone/upload.go` | Validasi UUID + cek `filepath.Rel` di dalam `UploadBase` |
| 7 | SSRF + kredensial di URL pada login HRIS | `osc_rest/skeleton/pub/pub00_usecase.go` | URL-encode; batasi skema; allowlist `HRIS_ALLOWED_HOSTS`; tolak redirect |
| 8 | Port DB & backend terekspos; `sslmode=disable`; password default | `docker-compose.yml`, `main.go`, `database.go` | DB di-bind `127.0.0.1:37771`; password wajib (`${PG_PASS:?...}`); backend `LISTEN_ADDR` default `127.0.0.1`; `PG_SSLMODE` |

### Tinggi (sudah diperbaiki)

- **TLS + header keamanan**: contoh reverse proxy di `deploy/` (`Caddyfile`,
  `nginx.conf`); `next.config.ts` mengirim CSP, HSTS, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Rate limiting**: middleware in-memory `mechanic.RateLimit` pada grup
  `/rest/guest` (login) — 10 req/menit/IP; `Retry-After` + 429.
- **Timeout server**: `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`,
  `IdleTimeout`, `MaxHeaderBytes` pada `http.Server`.
- **Cleanup periodik**: sesi idle & token kedaluwarsa dibersihkan berkala
  (`osc_rest/backbone/cleanup.go`).
- **CORS/Trusted proxy** dapat dikonfigurasi via `CORS_ALLOWED_ORIGINS` dan
  `TRUSTED_PROXIES`.
- **Perbandingan token agen** memakai `subtle.ConstantTimeCompare`.
- **`USRole`** mengembalikan 403 (bukan 401) saat privilege kurang.
- **Hash token sesi**: token login disimpan sebagai SHA-256 (`mechanic.HashToken`)
  di `app_user_token.token`; lookup sesi & logout mencocokkan hash, bukan token
  mentah (`memory.go`, `app00_handler.go`, `pub00_usecase.go`).
- **Container non-root**: backend `osc_rest` berjalan sebagai user `omni`
  (uid 10001) dan `no-new-privileges`; agen (`osc_auto`) non-root, read-only,
  `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`.

### Sisa risiko / rekomendasi lanjutan

- **Mint token via APP05 masih menyimpan plaintext.** `app_user_token.token`/
  `refresh_token` diisi apa adanya oleh `app05_repository.go` (`tokenCreate`)
  dan ditampilkan `tokenList`/`tokenGet`. Login (PUB00) sudah hashing; samakan
  APP05 (hash saat simpan, tampilkan sekali saja) atau pisahkan sebagai token
  API dengan penyimpanan hash.
- **`bot_agent.token` plaintext dengan default `uuid()`.** Token agen disimpan
  mentah dan punya default yang dapat diprediksi bila tidak di-override.
  Sebaiknya isi eksplisit acak (≥32 byte) dan/atau simpan hash; `CR_KEYS`
  tetap dipakai untuk autentikasi grup `/rest/agent`.
- **Captcha login masih di sisi klien** (`osc_site/src/app/login/page.tsx`) —
  hanya kosmetik. Proteksi brute-force nyata ada di rate-limit server.
- **Lockout per-user** dapat dipakai untuk *account-lockout DoS*; pertimbangkan
  kombinasi per-IP + backoff eksponensial.
- **Agen (scaffold) belum menerapkan mTLS.** Blueprint menyebut agen memakai
  mTLS + token `bot_agent`; saat ini autentikasi agen hanya token (`CR_KEYS`).
  Tambahkan mTLS sebelum agen operasional.
- **CSP** masih mengizinkan `'unsafe-inline'` untuk script (kebutuhan Next).
  Dapat diperketat dengan nonce via `proxy.ts`.
- **Tidak ada WAF/IDS** — direncanakan lewat modul `SEC`/`WEB`.
- **Pemindaian dependensi** (Trivy) belum dijalankan rutin.
- **`dangerouslySetInnerHTML`** pada `metas.tsx` (statis, risiko rendah) dan
  `chart.tsx` — pastikan data tidak berasal dari input pengguna.

## Verifikasi

- Backend: `go build ./...` dan `go vet ./...` bersih.
- Frontend: `npx tsc --noEmit`, `npx eslint`, dan `npm run build` bersih.

## Checklist go-live

- [ ] `RE_SECRET` acak ≥32 byte di-set (dan disimpan aman).
- [ ] `PG_PASS` kuat; port `37771` hanya localhost.
- [ ] Hanya 80/443 terbuka (firewall).
- [ ] Reverse proxy TLS aktif + HSTS.
- [ ] `CORS_ALLOWED_ORIGINS`, `TRUSTED_PROXIES`, `WS_ALLOWED_ORIGINS`,
      `HRIS_ALLOWED_HOSTS` disesuaikan untuk domain produksi.
- [ ] Backup database terjadwal & teruji restore.
- [ ] Monitoring/log (modul OBS/SEC) aktif.
