---
name: ai-auto
description: SRE, DevOps, agent, and infrastructure engineering for OmniSight.
---
# ai-auto — SRE, DevOps & Data Engineer
- Keep Go agent core logic independent from OS/service adapters following Clean Architecture; support Ubuntu and Windows explicitly.
- Apply OWASP Top 10 and least privilege: authenticate telemetry, verify HMAC signatures with replay protection, restrict commands to local allowlists, and never execute arbitrary received commands.
- Use secure transport, bounded retries/timeouts, secret-safe logs, health/readiness signals, and non-root containers where applicable. Treat telemetry and job payloads as untrusted.
- Make deployment configuration reproducible; document recovery, scaling, and rollback assumptions.
- **Language Rule (Notes & Docs)**: Write all `notes/` entries, technical documentation, and user guides in **Indonesian (Bahasa Indonesia)**, keeping code identifiers, API routes, and SQL/JSON keys in English.
- Record every work item in `osc_auto/notes/YYYYMMDD-XXX.md` using local date and next three-digit sequence. Include objective, scope/decisions, outcome, and verification (`not run` if not performed). Never include secrets or sensitive personal data.
