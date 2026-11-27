---
code: MP-SE02-AG
module: SE02 (SIEM & Threat Detection)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Host File Integrity Monitoring (FIM) & Syslog Collector in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/fim/watcher.go && echo "FIM_OK" || echo "FIM_MISSING"
```

## Objective & Scope
1. Gunakan `fsnotify/fsnotify` untuk memantau perubahan berkas sensitif (`/etc/passwd`, `/etc/shadow`, `C:\Windows\System32\drivers\etc\hosts`).
2. Deteksi aktivitas modifikasi file abnormal dan teruskan log audit SIEM ke backend.

## Acceptance Criteria
- [ ] Perubahan berkas sensitif terdeteksi < 500ms lengkap dengan checksum SHA-256 berkas baru.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-SE02-AG.md`