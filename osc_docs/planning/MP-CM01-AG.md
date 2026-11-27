---
code: MP-CM01-AG
module: CM01 (Identity & HRIS Auth Sync)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Host Machine UUID Registration & System Fingerprint Collector in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/cmd/agent/fingerprint.go && echo "AGENT_FP_EXISTS" || echo "AGENT_FP_MISSING"
go check ./osc_auto/... > /dev/null 2>&1 && echo "GO_CHECK_PASSED" || echo "GO_CHECK_FAILED"
```
- **Jika `AGENT_FP_EXISTS` & `GO_CHECK_PASSED`**: Respon `"Agent Fingerprint Collector sudah aktif."` -> **FAST EXIT**.

## Objective & Scope
1. Dapatkan Motherboard UUID, MAC Address utama, CPU Serial, dan Hostname pada OS Linux & Windows.
2. Hasilkan Host Fingerprint unik dan daftarkan agen ke `osc_rest` via endpoint `POST /api/v1/agent/register`.
3. Simpan token identitas agen terenkripsi pada konfigurasi lokal (`/etc/omnisight/agent.json` atau `C:\ProgramData\OmniSightgent.json`).

## Acceptance Criteria
- [ ] Agent sukses mendaftarkan diri dan mendapatkan `agent_id` unik dari backend.
- [ ] File identitas lokal terenkripsi dengan AES-256.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-CM01-AG.md`