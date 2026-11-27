---
code: MP-SD01-BE
module: SD01 (Incident Ticketing)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Incident Ticket Management, Comment Thread & Attachment API in Rust

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/sd/ticket_service.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat handler REST API tiket insiden (`trx_ticket_issue`) dari tingkat `P1_CRITICAL` hingga `P4_LOW`.
2. Kelola status lifecycle tiket (`OPEN` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`) dan alur komentar (`trx_ticket_comment`).
3. Sanitasi masukan teks dari ancaman Stored XSS dan simpan lampiran foto/berkas ke Storage RustFS.

## Acceptance Criteria
- [ ] Transisi status tiket terekam otomatis pada audit history (`trx_ticket_history`).
- [ ] Deskripsi dan komentar tiket terbebas dari injection HTML/Script berbahaya.
- [ ] Lolos pengujian `osc_docs/test_flows/SD01-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-SD01-BE.md`