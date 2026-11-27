---
code: MP-CT01-FE
module: CT01 (Docker Stack Engine)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Docker Compose Monaco YAML Editor & Container Status Card UI

## Fast Pre-Check
```bash
test -s osc_site/src/components/ct/MonacoComposeEditor.tsx && echo "EDITOR_EXISTS" || echo "EDITOR_MISSING"
```

## Objective & Scope
1. Integrasikan Monaco Editor (`MonacoComposeEditor.tsx`) untuk pengeditan berkas `docker-compose.yml` dengan validasi syntax YAML.
2. Tampilkan grid card status container (`RUNNING`, `STOPPED`, `DEGRADED`, `HEALTHY`) dilengkapi tombol Deploy, Restart, dan Stop.

## Output Deliverables
- `osc_site/src/components/ct/MonacoComposeEditor.tsx` & `StackStatusGrid.tsx`
- Catatan kerja: `osc_site/notes/MP-CT01-FE.md`