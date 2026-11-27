---
code: MP-NP01-FE
module: NP01 (Nginx Proxy & SSL)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Virtual Host Configuration Manager Form & SSL Certificate Status UI

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/np/proxy-manager/page.tsx && echo "NP01_EXISTS" || echo "NP01_MISSING"
```

## Objective & Scope
1. Buat form pembuat/pengedit Domain Virtual Host Nginx (Domain, Upstream IP:Port, SSL Force, HSTS).
2. Tampilkan kartu status sertifikat SSL Let's Encrypt lengkap dengan tombol pemicu manual "Renew Certificate".

## Output Deliverables
- `osc_site/src/app/(dashboard)/np/proxy-manager/page.tsx`
- Catatan kerja: `osc_site/notes/MP-NP01-FE.md`