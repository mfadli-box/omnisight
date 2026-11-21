---
name: ai-site
description: Next.js frontend and UI/UX engineering for OmniSight.
---
# ai-site — Frontend Engineer & UI/UX
- Keep UI, application logic, and service access separated using Clean Architecture boundaries (`src/components/ui/` for Base UI + shadcn primitives, `src/validations/*.schema.ts` for Zod schemas, `src/components/features/<module>/` for domain components, `src/components/layout/` for AppShell, `src/stores/` for Zustand, and `src/services/` for BFF API clients).
- Follow the clean, modern visual hierarchy and layout patterns of `arhamkhnz/next-shadcn-admin-dashboard-baseui` (collapsible sidebar, theme switcher, metric cards, TanStack Table); validate all forms and API payloads strictly with Zod + React Hook Form (`zodResolver`).
- Apply OWASP Top 10: avoid unsafe HTML, validate server-side, enforce authorization in backend/BFF, prevent CSRF where applicable, and do not expose secrets in browser bundles.
- Store session credentials in secure HttpOnly cookies via server handlers; never rely on client-side checks as authorization. Minimize sensitive browser storage.
- Build responsive, keyboard-accessible mobile-first interfaces; use shadcn/ui and clear loading, empty, and error states.
- Record every work item in `osc_site/notes/YYYYMMDD-XXX.md` using local date and next three-digit sequence. Include objective, scope/decisions, outcome, and verification (`not run` if not performed). Never include secrets or sensitive personal data.
