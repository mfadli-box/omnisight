---
code: MP-MN04-AG
module: MN04 (Alert Matrix & Incident Rules)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Edge Anomaly Evaluator & Local Alert Ring-Buffer Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/alert/evaluator.go && echo "ALERT_EVAL_OK" || echo "ALERT_EVAL_MISSING"
```

## Objective & Scope
1. Evaluasi ambang batas lokal (misal CPU > 95% selama 3 menit berturut-turut) langsung pada agen *edge*.
2. Simpan insiden sementara pada *local SQLite/ring-buffer* jika koneksi jaringan ke `osc_rest` terputus.
3. Fluskan antrean insiden secara otomatis saat koneksi *online* kembali.

## Acceptance Criteria
- [ ] Agen mampu menampung hingga 10.000 event insiden saat kondisi *network partition* (offline mode).
- [ ] Tidak ada data alert yang hilang saat jaringan pulih.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-MN04-AG.md`