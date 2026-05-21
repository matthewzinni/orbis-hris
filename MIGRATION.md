# Orbis JS → TypeScript migration

## Boot order (single path)

1. Vite module `src/main.ts` — styles, helpers, auth, Supabase, TS modules
2. `main.ts` calls `window.loadAllDashboardData` from `src/modules/dashboardBoot.ts` (employees + KPI fallbacks)

## Ownership

| Concern | Owner |
|--------|--------|
| Auth | `src/modules/auth.ts` |
| DOM helpers, toast, print | `src/utils/helpers.ts` |
| User access / roles | `src/services/access.ts` |
| Employee notes | `src/modules/notes.ts` |
| Employee save / delete / drawer tabs | `src/modules/drawer.ts` |
| Drawer open/close UI | `src/ui/drawerUi.ts` |
| Employee load + access scope | `src/modules/employees.ts` + `src/services/access.ts` |
| Dashboard boot + fallbacks | `src/modules/dashboardBoot.ts` |
| Onboarding tasks | `src/modules/onboarding.ts` |
| Drawer tab switch | `src/app/appShell.ts` |
| Department filter / summary | `src/ui/departmentSummary.ts` |
| Employee admin form / delete / terminate | `src/modules/employeeAdmin.ts` |
| Audit trail (localStorage) | `src/services/auditTrail.ts` |
| At-risk / impact badges | `src/ui/badges.ts` |
| Employee roster (render, filters, sort) | `src/ui/employeeRoster.ts` |
| Reviews, discipline, incidents, meetings, stay interviews, candidates | `src/modules/*.ts` |
| Documents | `src/modules/documents.ts` |
| Dashboard KPIs + turnover hover | `src/ui/kpis.ts` |
| History tab + recent activity UI | `src/ui/history.ts` |

## Legacy JavaScript removed

- No `<script src="/js/...">` tags in `index.html`
- `public/js/` deleted (empty `permissions.js` / `state.js` stubs)
- `js/` application folder deleted (helpers, history, badges, `app.js`, `legacy/` archive)

## Supabase (CLI)

Link the repo and push migrations (RLS, `candidate_notes`, etc.):

```bash
npm run db:login
npm run db:link      # paste Project Reference ID from Supabase dashboard
npm run db:push
```

See `supabase/README.md` for the full workflow and access model.

## Remaining config

- `vite.config.js` — Vite configuration (not app runtime)
