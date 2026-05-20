# Orbis JS → TypeScript migration

## Boot order (single path)

1. Legacy script tags: helpers, permissions, state, history
2. `src/main.ts` (Vite module) — auth, Supabase, TS modules, `registerLegacyBridges()`
3. `main.ts` calls `window.loadAllDashboardData` from `src/modules/dashboardBoot.ts` (employees + KPI fallbacks)
4. `js/app.js` removed — boot and bridges live in `src/main.ts` + typed modules

## Ownership

| Concern | Owner |
|--------|--------|
| Auth | `src/modules/auth.ts` |
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

## Loaded from TS (Vite module)

- `src/ui/employeeRoster.ts` — roster, drawer open by ID, filters, audit hooks
- `src/ui/kpis.ts` — dashboard KPIs, turnover metrics, hover tooltips
- `src/ui/drawerUi.ts` — drawer chrome (identity header, profile grid, tab events)
- `src/ui/history.ts` — history list rendering helpers
- `src/modules/stayInterviews.ts` — stay interview CRUD + history
- `src/modules/employees.ts` — scoped employee load, `EMPLOYEES` / `ALL_EMPLOYEES`
- `src/modules/dashboardBoot.ts` — `loadAllDashboardData`, review/risk/impact fallbacks
- `src/modules/onboarding.ts` — onboarding checklist tab
- `src/services/access.ts` — roles, supervisor scoping, drawer permission locks
- `src/app/appShell.ts` — `switchTab`, `initAppShell`, auth/app view toggle, roster sort headers
- `src/modules/drawerForms.ts` — `resetDrawerForms`
- `src/modules/candidates.ts` — candidate drawer (`openCandidateDrawer`, `openNewCandidateForm`)
- `src/ui/employeeForm.ts` — `populateEmployeeForm`, `resetEmployeeForm`, `saveEmployeeForm` bridge
- `src/services/employeeIds.ts` — `generateAvailableEmployeeId` for new employees

## Legacy script tags still in `index.html`

- `js/utils/helpers.js` — DOM helpers, toast, print
- `js/core/permissions.js`, `js/core/state.js`
- `js/ui/history.js` — employee audit trail load (TS `src/ui/history.ts` also loaded)

## Next migration steps

1. Port `js/ui/history.js` fully or merge with `src/ui/history.ts`
2. Port remaining `js/core/permissions.js` and `js/core/state.js`
4. Delete obsolete `js/main.js` / legacy `js/legacy/` when confirmed unused
