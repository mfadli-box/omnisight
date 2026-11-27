---
code: MP-AG02-BE
module: AG02 (Directus Work Log)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Directus Headless CMS Queue Worker & Markdown Report Parser Engine

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/ag/directus_sync.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat queue worker untuk memproses antrean sinkronisasi Directus (`trx_directus_sync_queue`).
2. Parse berkas laporan kerja Markdown di `osc_note/YYYYMMDD-XXX.md` dan ekstrak meta-header JSON.
3. Sinkronkan dokumen ke API Directus CMS menggunakan token terenkripsi (`static_token_enc`) dengan mekanisme *exponential backoff retry*.

## Acceptance Criteria
- [ ] Laporan kerja AI ter-parsing dan terunggah ke Directus CMS tanpa kehilangan format.
- [ ] Kegagalan koneksi CMS akan dicoba ulang secara otomatis oleh worker antrean.
- [ ] Lolos pengujian `osc_docs/test_flows/AG02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-AG02-BE.md`