---
code: MP-AG02-AG
module: AG02 (Directus Work Log)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: low
token_optimization: true
---
# Task: Local Markdown Work Log Collector & Directus Sync Helper

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/worklog/collector.go && echo "WORKLOG_OK" || echo "WORKLOG_MISSING"
```

## Objective & Scope
1. Pindai folder `osc_note/` lokal untuk menemukan laporan kerja AI baru (`YYYYMMDD-XXX.md`).
2. Kirimkan metadata laporan dan checksum berkas ke backend `osc_rest` untuk disinkronkan ke Directus Headless CMS.

## Acceptance Criteria
- [ ] Berkas markdown laporan kerja AI terdeteksi dan tersinkronkan otomatis < 10 detik setelah dibuat.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-AG02-AG.md`