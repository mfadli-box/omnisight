---
code: MP-SD01-FE
module: SD01 (Incident Ticketing)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Incident Ticket Kanban Board, Detail Drawer & Comment Attachment UI

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/sd/tickets/page.tsx && echo "SD01_EXISTS" || echo "SD01_MISSING"
```

## Objective & Scope
1. Implementasikan Kanban Board status tiket (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
2. Sediakan drawer detail tiket lengkap dengan timeline komentar dan widget upload foto/lampiran berkas.

## Output Deliverables
- `osc_site/src/app/(dashboard)/sd/tickets/page.tsx`
- Catatan kerja: `osc_site/notes/MP-SD01-FE.md`