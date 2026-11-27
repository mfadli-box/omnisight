---
code: MP-MN02-AG
module: MN02 (Synthetic Uptime & SSL Checker)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Local Network Synthetic Probe & Ping Worker in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/probe/pinger.go && echo "PROBE_OK" || echo "PROBE_MISSING"
```

## Objective & Scope
1. Eksekusi ICMP Ping, TCP Handshake (port 80/443/22/5432), dan HTTP GET healthcheck ke daftar IP target.
2. Ekstrak masa berlaku sertifikat SSL/TLS dari HTTPS target dan hitung sisa hari kedaluwarsa.
3. Laporkan latency (ms) dan status target (`UP` / `DOWN` / `SSL_WARN`) ke backend.

## Acceptance Criteria
- [ ] Pengujian konkurensi 100 target selesai < 3 detik menggunakan `goroutines`.
- [ ] Sertifikat SSL terdeteksi akurat dengan perhitungan tanggal kedaluwarsa yang tepat.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-MN02-AG.md`