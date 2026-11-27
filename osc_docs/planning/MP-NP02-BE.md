---
code: MP-NP02-BE
module: NP02 (IPAM Source of Truth)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: IP Address Management (IPAM) REST Engine & Subnet Allocation Service

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/network/ipam_service.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan service kalkulator Subnet CIDR (`dat_ip_subnet`) dan alokasi IP (`trx_ip_allocation`).
2. Sediakan API pencarian IP bebas (*available IP*), pemetaan MAC Address, dan penetapan status IP.
3. Deteksi konflik alokasi IP ganda (*Rogue IP detection*) dan catat audit di `log_ipam_audit`.

## Acceptance Criteria
- [ ] Operasi jaringan PostgreSQL (`CIDR`, `INET`, `MACADDR`) berjalan presisi.
- [ ] Mencegah alokasi IP ganda pada subnet yang sama.
- [ ] Lolos pengujian `osc_docs/test_flows/NP02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-NP02-BE.md`