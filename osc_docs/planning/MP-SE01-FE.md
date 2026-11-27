---
code: MP-SE01-FE
module: SE01 (Privileged Access / PAM)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Bastion Web SSH Terminal Component & PAM Credential Vault Form

## Fast Pre-Check
```bash
test -s osc_site/src/components/se/BastionTerminalModal.tsx && echo "SE01_EXISTS" || echo "SE01_MISSING"
```

## Objective & Scope
1. Implementasikan modal terminal Bastion SSH (`BastionTerminalModal.tsx`) berbasis `xterm.js`.
2. Sediakan form vault kredensial terenkripsi (`/se/pam-vault/page.tsx`) dengan sensor penyembunyian password/private key.

## Output Deliverables
- `osc_site/src/components/se/BastionTerminalModal.tsx` & `src/app/(dashboard)/se/pam-vault/page.tsx`
- Catatan kerja: `osc_site/notes/MP-SE01-FE.md`