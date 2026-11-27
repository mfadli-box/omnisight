---
code: MP-CT02-FE
module: CT02 (Container Terminal & Images)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: xterm.js Web TTY Terminal, Live ANSI Log Viewer & Image Prune Dashboard

## Fast Pre-Check
```bash
test -s osc_site/src/components/ct/ContainerTerminalModal.tsx && echo "TTY_EXISTS" || echo "TTY_MISSING"
```

## Objective & Scope
1. Buat terminal modal `ContainerTerminalModal.tsx` menggunakan `xterm.js` terhubung via WebSocket `/ws/v1/containers/:id/exec`.
2. Sediakan halaman manajemen Docker Image (`/ct/images/page.tsx`) dengan tombol aksi "Prune System Storage".

## Output Deliverables
- `osc_site/src/components/ct/ContainerTerminalModal.tsx` & `src/app/(dashboard)/ct/images/page.tsx`
- Catatan kerja: `osc_site/notes/MP-CT02-FE.md`