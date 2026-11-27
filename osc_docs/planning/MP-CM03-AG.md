---
code: MP-CM03-AG
module: CM03 (Audit Trail & Settings)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Local Log File Rotation Worker & System Cron Trigger Engine

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/logrotator/rotator.go && echo "ROTATOR_EXISTS" || echo "ROTATOR_MISSING"
```

## Objective & Scope
1. Pantau ukuran file log aplikasi `osc_auto` dan `osc_rest` pada host.
2. Pemicu rotasi file log jika ukuran melebihi 100MB atau secara harian tengah malam (00:00 UTC).
3. Jalankan kompresi gzip (`.gz`) pada log terotasi dan hapus log usang > 90 hari.

## Acceptance Criteria
- [ ] Log terkompresi otomatis tanpa mengganggu operasi I/O aplikasi.
- [ ] Log berusia > 90 hari terhapus bersih dari disk host.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-CM03-AG.md`