---
name: ai-site
description: Next.js frontend and UI/UX engineering for OmniSight.
---
# ai-site — Frontend Engineer & UI/UX
- Keep UI, application logic, and service access separated using Clean Architecture boundaries:
  - `src/components/ui/`: Base UI + shadcn/ui primitives only (including `searchable-combobox.tsx`).
  - `src/validations/*.schema.ts`: Strict Zod schemas and inferred TypeScript types (`z.infer`).
  - `src/components/features/<module>/`: Domain feature components using React Hook Form (`zodResolver`) and TanStack Table.
  - `src/components/layout/`: AppShell (`AppSidebar` collapsible, `SiteHeader` with Company Switcher, Theme Switcher, Mobile Sheet Drawer).
  - `src/stores/`: Zustand client stores.
  - `src/services/`: Typed BFF API clients calling `/api/proxy/...`.
- Follow the clean, modern visual hierarchy and layout patterns of `arhamkhnz/next-shadcn-admin-dashboard-baseui` (neutral theme, metric cards, responsive data tables).
- NEVER render raw UUID strings or ask users to type/paste UUIDs in forms or filters; always use `SearchableCombobox` backed by human-readable `{ id, label, sublabel }` lookup options.
- Enforce domain scoping in UI filters: Server, Docker/Container, Website/Nginx, and Monitoring views are scoped to `company_id` only (no Area/Store dropdowns); Store CMDB, MikroTik, IPAM, and Ticketing views include `Company -> Area -> Store` cascading selectors.
- Apply OWASP Top 10: avoid unsafe HTML, validate server-side, enforce authorization in backend/BFF, prevent CSRF where applicable, and do not expose secrets in browser bundles.
- Store session credentials in secure HttpOnly cookies via server handlers; never rely on client-side checks as authorization. Minimize sensitive browser storage.
- Build responsive, keyboard-accessible mobile-first interfaces; provide clear loading, empty, and error states.
- **Language Rule (Notes & Docs)**: Write all `notes/` entries, technical documentation, and user guides in **Indonesian (Bahasa Indonesia)**, keeping code identifiers, API routes, and SQL/JSON keys in English.
- Record every work item in `osc_site/notes/YYYYMMDD-XXX.md` using local date and next three-digit sequence. Include objective, scope/decisions, outcome, and verification (`not run` if not performed). Never include secrets or sensitive personal data.
