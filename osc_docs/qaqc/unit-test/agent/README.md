# Unit Test Agent

Status: Disetujui (0.6)

Agent adalah program Go yang berjalan di host atau jaringan klien. Unit test agent fokus pada logika yang tidak membutuhkan host nyata, perangkat, atau collector.

## 1. Cakupan

| Area | Contoh unit test |
|---|---|
| Konfigurasi | Validasi wajib, URL collector, interval, batas buffer |
| Enrollment | Parsing token, pembuatan CSR, validasi fingerprint |
| Payload | Serialisasi kanonik, urutan kunci stabil, signature Ed25519 |
| Anti-replay | Timestamp di luar jendela, nonce berulang, signature salah |
| Tugas | Allowlist jenis, expiry, `max_runtime`, `idempotency_key` |
| Buffer | Batas ukuran, enkripsi melalui interface, hapus data tertua, prioritas heartbeat |
| Scheduler | Backoff eksponensial, jitter, batas percobaan |
| Updater | Signature manifest, hash, versi, rollback |
| Metrik | Parser CPU/RAM/disk/container, pembulatan, label |

Yang tidak diuji sebagai unit test: pembacaan `/proc`, WMI, socket Docker/Podman nyata, koneksi RouterOS, dan filesystem host. Itu masuk integration test pada runner khusus.

## 2. Pola tes

- Table-driven test untuk parser, validator, dan matriks keputusan.
- `t.TempDir()` untuk file buffer dan konfigurasi.
- Fake clock dan fake random source agar signature/expiry deterministik.
- `httptest.Server` untuk collector palsu; tidak memakai jaringan eksternal.
- Golden file untuk payload kanonik dan manifest update.
- Build tag `//go:build linux` atau `//go:build windows` untuk kode platform.
- `go test -race` untuk mendeteksi race pada buffer dan scheduler.

## 3. Matriks kasus wajib

| Kasus | Harapan |
|---|---|
| Payload sama, urutan field berbeda | Signature sama |
| Nonce sama dikirim dua kali | Ditolak |
| Timestamp lebih dari 5 menit | Ditolak |
| Tugas kedaluwarsa | Tidak dieksekusi |
| Tugas di luar allowlist | Ditolak dan dicatat |
| Buffer penuh | Data tertua dihapus, heartbeat tetap |
| Collector offline | Backoff bertambah, tidak panic |
| Manifest update salah signature | Update dibatalkan |
| Health check gagal setelah update | Rollback ke versi sebelumnya |

## 4. Data uji

- Metrik sintetis dengan nama host `test-host-01`.
- Container `demo-api`, image digest palsu.
- Perangkat `router-test` dengan kredensial placeholder.
- Tidak memakai IP publik nyata atau data pelanggan.
- File konfigurasi hanya berisi nilai contoh.

## 5. Perintah

```bash
go test ./... -race -count=1
go test ./internal/... -coverprofile=coverage.out
go tool cover -func=coverage.out
```

Untuk kode platform:

```bash
GOOS=linux go test ./...
GOOS=windows go test ./...
```

Tes yang membutuhkan akses host dijalankan di CI runner yang sesuai, bukan di laptop developer.

## 6. Checklist

- [ ] Signature dan anti-replay diuji positif dan negatif.
- [ ] Allowlist tugas diuji.
- [ ] Buffer dan backoff diuji tanpa sleep nyata.
- [ ] Update dan rollback diuji.
- [ ] Tidak ada network atau host nyata.
- [ ] `-race` lulus.
- [ ] Tidak ada rahasia di fixture atau log tes.
- [ ] Kode platform memiliki build tag dan matriks CI.
