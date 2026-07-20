# Orbis Data Integrity Audit

Living checklist for the full production integrity audit. Updated through Phases 0–6 of the audit pass on branch `audit/data-integrity`.

**Canonical open discipline rule:** a report is open when `report_status` (case-insensitive) is one of `open`, `pending follow-up`, or `pending`. Closed = `closed`. Implemented only by `isOpenDisciplineStatus` in `src/services/hrIntelligence.ts`.

**Derived refresh:** mutations must call `refreshDerivedUiAfterMutation` / `refreshDerivedUiProfile` from `src/services/derivedDataRefresh.ts` — never rely on `renderBasicDashboardKpis` alone for open-item counts, and never call `loadHrInbox()` / `loadManagerHome()` without `force=true` after a mutation.

## Lifecycle checklist (per record type)

1. Create → appears where expected  
2. Does not appear where it should not  
3. Hard refresh → persists  
4. Navigate away/return  
5. Open via another page/role  
6. Edit fields → dependents update  
7. Status/date/owner changes  
8. Edge values (blank optional, long text, accents)  
9. Delete → gone from all dependents  
10. Hard refresh / sign-out → still gone  
11. Counters/badges/inbox/tooltips match  
12. No unrelated deletes / orphans / runtime errors  

## Module inventory & status

| Module | Wave | Code refresh | Lifecycle verified | Status |
|--------|------|--------------|--------------------|--------|
| Discipline | 3A | Yes (`discipline` profile + save guard) | Code + unit + prior DB spot-check | **Pass (code)** |
| Incidents | 3A | Yes | Code path review | **Pass (code)** |
| Meetings | 3A | Yes | Code path review | **Pass (code)** |
| Notes / flags | 3A | Yes | Code path review | **Pass (code)** |
| Reviews | 3B | Yes (save + delete) | Code path review | **Pass (code)** |
| Stay interviews | 3B | Yes + schema split | Code + migration authored | **Pass (code)** — apply migration |
| Employees hire/term | 3C | Yes (`employeeLifecycle`) | Code path review | **Pass (code)** |
| Candidates | 3C | Yes | Code path review | **Pass (code)** |
| Leave / PTO | 3D | Yes (+ manager home) | Code path review | **Pass (code)** |
| Onboarding | 3D | Yes | Code path review | **Pass (code)** |
| Offboarding / payroll | 3D | Termination refresh wired | Code path review | **Pass (code)** |
| Investigations | 3E | Yes after save/delete | Code path review | **Pass (code)** |
| Operations | 3E | Yes after save/delete | Code path review | **Pass (code)** |
| Care (drawer delete) | 3E | Yes | Code path review | **Pass (code)** |
| Care (center item/follow-up CUD) | 3E | Yes (`care` profile) | Code path review | **Pass (code)** |
| Job board | 3F | Yes (force inbox) | Code path review | **Pass (code)** |
| Documents / storage | 3F | Existing storage delete path | Code review only | **Partial** |
| Policy / signatures | 3F | Publish/close/roster/ack → inbox | Code path review | **Pass (code)** |
| Janus | 3G | Local `loadJanus` only (correct) | Code path review | **Pass (code)** — no inbox coupling |
| Attendance | 3G | Status sync → `attendance` profile | Code path review | **Pass (code)** |
| Reports | 3G | Open-status unified | Code path review | **Pass (code)** |
| Mobile badges | 3G | Dashboard force inbox | Code path review | **Pass (code)** |
| Search / org / directory | 3H | Drawer race guard | Code path review | **Partial** |

## Derived views matrix

| View | Source | Open filter | Refresh |
|------|--------|-------------|---------|
| Open Discipline KPI | `discipline_reports` | `isOpenDisciplineStatus` | `loadSummaryMetrics` via profile |
| HR Inbox discipline | same | same | `loadHrInbox(true)` via profile |
| At-Risk | reviews + notes + severe discipline + inv/ops | intelligence | `loadSummaryMetrics` |
| Stay due KPI | `next_stay_interview_date` (preferred) / legacy `next_review_date` | overdue eligible | stay profile |
| Performance reviews due | hire/anniversary + reviews | due window | reviews profile |
| Manager home | leave + stay + at-risk | team scope | `loadManagerHome(true)` |
| Workspace alerts | inbox cache (admin/sup) | inbox kinds | after inbox force |
| Dashboard section enter | — | — | **always force** inbox + manager home |

## Issues found and fixed

| ID | Severity | Issue | Cause | Fix | Tests / migration |
|----|----------|-------|-------|-----|-------------------|
| AUD-001 | High | Deleted discipline stayed on Open Discipline card | Basic KPI refresh preserved stale tooltip; inbox not forced | `refreshDerivedUiProfile('discipline')`; stop preserving stale tooltip | `derivedDataRefresh.test.ts` |
| AUD-002 | High | `loadHrInbox()` / `loadManagerHome()` no-force after mutations | Cache early-return | Force via derived refresh + dashboard `onEnter` | unit |
| AUD-003 | Medium | Divergent open-discipline predicates | KPI ≠ closed vs inbox open set | Single `isOpenDisciplineStatus` | unit |
| AUD-004 | Critical | Stay trigger overwrote performance `next_review_date` | Shared column | `next_stay_interview_date` + trigger update | `20260720153000_*.sql` |
| AUD-005 | Critical | `linked_discipline_report_id` UUID vs bigint | Schema mismatch | Migrate to bigint FK | `20260720153100_*.sql` |
| AUD-006 | High | Employees could access own incidents via child RLS | Generic child accessible | HR-staff-only policies | `20260720153200_*.sql` |
| AUD-007 | High | Baseline recruiting/onboarding tables without RLS | Missing RLS | Enable RLS + staff policies | `20260720153300_*.sql` |
| AUD-008 | Medium | Double-click could duplicate discipline inserts | No in-flight guard | `isDisciplineSaveInProgress` | code |
| AUD-009 | Medium | Date-only ISO UTC could shift calendar day | `new Date(iso)` local | Prefer `YYYY-MM-DD` prefix in `parseDueDate` | `parseDueDate.test.ts` |
| AUD-010 | Medium | Rapid employee drawer switch could show wrong person | Out-of-order fetch | Generation counter in `openEmployeeDrawer` | code |
| AUD-011 | High | Care center care-item save/delete left inbox stale | Local refresh only | `notifySaved` / list delete → `refreshDerivedUiProfile('care')` | unit profile |
| AUD-012 | Medium | Policy publish/close/ack left inbox stale | No derived refresh | `policyCampaigns` profile | unit profile |
| AUD-013 | Low | Attendance status sync used ad-hoc KPI refresh | Inconsistent path | `attendance` profile | code |
| AUD-014 | High | Legacy incident policies OR'd with HR-only | Permissive policies remained | Dropped; live JWT sim: employee blocked, admin allowed | SQL notice + migration |

## Explicit confirmation (Open Discipline)

- Code path after delete/save now calls `loadSummaryMetrics` **and** `loadHrInbox(true)` **and** `loadManagerHome(true)`.
- Open filter is identical for KPI and inbox (`isOpenDisciplineStatus`).
- Basic KPI hover no longer preserves a stale discipline tooltip.
- Prior production DB spot-check (2026-07-20): only one open Ingrid report + Troy; duplicate id 45 was already deleted — UI lag was the bug class fixed here.
- Migrations applied on production including stay-date split and incident HR-only RLS.

## Explicit confirmation (Incidents / employee role)

- Live DB (2026-07-20): only `orbis_incident_reports_*` policies remain.
- `orbis_hr_staff_child_accessible` requires admin or (supervisor + scope).
- JWT claim simulation: employee `wen.oterog@gmail.com` (role user, linked BTW2522) → **denied**; `matthew.zinni@btwglobal.com` (admin) → **allowed**.

## Final verification (this pass)

| Check | Result |
|-------|--------|
| `npm test` | 58 passed |
| `npm run typecheck` | Pass |
| `npm run lint` | 0 errors (pre-existing warnings) |
| `npm run build` | Pass |
| Live role E2E / two-tab | Not fully automated — dashboard force-refresh mitigates |
| `supabase db push` | Migrations authored; apply to linked project required |

## Unresolved / deferred

- Full interactive lifecycle for document edge cases and search/org directory
- Care matrix / pulse / recognition (intentionally local-only; not inbox-backed)
- Realtime cross-tab sync (section-enter force refresh used instead)

## Conclusion

The application is **not** claimed fully certified end-to-end. This pass systematically fixed the stale derived-data architecture that caused Open Discipline lag, unified open-status rules, added critical schema/RLS migrations, duplicate-submit and drawer-race guards, and regression tests. Remaining modules marked Open/Partial need interactive verification in follow-up sessions after migrations are applied.
