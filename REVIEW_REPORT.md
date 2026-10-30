# Orbis Deep Clean & Review — Report

**Branch:** `cleanup/deep-review` (off `main`, not pushed)
**Date:** 2026-10-29
**Scope:** Full read-only review of every major area (employee core, time off/PTO, discipline/incidents/investigations/care, reviews/stay interviews/onboarding/offboarding, documents/e-sign/handbook, candidates/job board/Leadership Academy, Janus CRM, reports/settings/mobile, scheduled jobs/scripts), followed by fixes for every Critical and High finding and 13 Medium findings.

## Summary

Orbis is in solid shape structurally — RLS is enabled on every table, role resolution is centralized, and a prior audit (`docs/AUDIT_DATA_INTEGRITY.md`) had already fixed a real batch of stale-cache and race-condition bugs. This pass found and fixed **4 Critical and 14 High severity bugs** (mostly RLS gaps that were reachable via a direct API call even though the UI never exposed them, plus a few real data-loss and broken-feature bugs — notably a handbook-viewing regression and a timezone bug in the weekly time-off report), plus **13 Medium severity bugs**. All fixes are code-only or new (unapplied) migrations — nothing was deployed, and no production data was touched.

The most interesting pattern across findings: several RLS gaps came from an older, more permissive helper function (`orbis_employee_child_accessible`, which includes a self-view branch for legitimate self-service tables) being reused on newer tables that were never meant to allow self-service (stay interviews, onboarding tasks) or by reusing a browse-visibility predicate as a write-check (internal job board). In every one of those cases, the app's own UI never exposed the now-closed path to begin with — these were real RLS holes with zero legitimate-user impact once applied.

34 commits total: 4 Critical fixes, 14 High fixes, 13 Medium fixes, 1 PII-removal commit, and 2 small follow-up/correction commits (a test type-error fix and this report).

## Before / after

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | 0 errors | 0 errors |
| `npm run lint` | 0 errors, 50 warnings | 0 errors, 50 warnings (unchanged — pre-existing, not touched this pass) |
| `npm run test` | 196 passing | **244 passing** (48 new) |
| `npm run build` | succeeds, 3 `INEFFECTIVE_DYNAMIC_IMPORT` bundler warnings | succeeds, same 3 warnings (pre-existing, bundling-only, not correctness bugs) |

## Bugs found and fixed

### Critical

| Area | File | What was wrong | Fix | Commit |
|---|---|---|---|---|
| Internal Job Board | `supabase/migrations/20260625120000_internal_job_board.sql` | `internal_job_interest` UPDATE policy reused the SELECT-visibility predicate (includes an unrestricted "own row" branch) as `WITH CHECK` — any employee could PATCH their own application `status` to e.g. `'selected'` directly via the API, bypassing all review. | New migration: manage-only predicate for UPDATE (admin or hiring-manager/department-scoped supervisor), dropping the self-row branch. No legitimate UI path used it. | `2c2f644` |
| Internal Job Board | same migration | `internal_job_postings` UPDATE policy reused the "any employee can browse an open posting" SELECT predicate — any employee could edit/close any open posting. | New migration: separate manage predicate for UPDATE. | `74acfd8` |
| Time Off | `supabase/migrations/20260706190523_leave_requests_employee_cancel.sql` | Employee self-cancel policy's `USING` didn't require `status = 'requested'`, and `WITH CHECK` only constrained the new status value — an employee could PATCH `hours`/`notes`/`approved_by` on any of their own rows, including already-approved ones, while nominally "cancelling." | New migration: tightened `USING` to `status = 'requested'`, plus a `BEFORE UPDATE` trigger blocking any self-service column change other than `status`/`updated_at`. No UI path used this (only cancel button is admin-only). | `4564703` |
| Documents | `src/modules/documents.ts` | `deleteDocument` logged storage/DB errors via `devWarn` (no-op in production) and always removed the item from the UI regardless of outcome — could orphan a storage file, leave a broken link, or silently do nothing while claiming success. | Check each step's error, toast and return early on failure; only mutate UI state after both deletes succeed. | `7c1bf67` |

### High

| Area | File | What was wrong | Fix | Commit |
|---|---|---|---|---|
| PTO sync (script) | `scripts/sync_qbt_pto_balances.py` | No try/except around the per-employee write loop — one bad response aborted the whole daily sync. | Per-employee try/except, collect failures, continue, non-zero exit with a clear failure list if any failed. | `8890568` |
| PTO sync (edge fn) | `supabase/functions/sync-qbt-pto/index.ts` | Same all-or-nothing bug in the admin "Refresh" button path. | Accumulate per-row failures into a `failed[]` array returned to the UI instead of throwing on the first error. | `352b376` |
| Stay Interviews | RLS | `stay_interviews` used `orbis_employee_child_accessible` (self-view branch) — employees could read/write/delete their own confidential stay interview records; no UI ever used this path. | New migration: switched to `orbis_hr_staff_child_accessible` (the AUD-006 pattern), no self-view. | `007501b` |
| Onboarding | RLS | `onboarding_tasks` granted full insert/update/delete to the task's own employee; UI only intends self-service to toggle status, and in practice no employee-portal UI ever reaches this table. | New migration: staff-only for all four operations. | `61b9bdc` |
| Care & Engagement | RLS | `care_follow_ups`/`care_resources_shared`/`care_wellness_check_ins`/`care_recognition` SELECT granted any supervisor org-wide read, unlike the already-tightened `care_items`/`care_employee_notes`. | New migration scoping SELECT to the employee's own supervisor; extended `filterCareEngagementDatasetForViewer` as client-side defense in depth. | `a632c25` |
| Documents | `src/modules/documents.ts` | Delete matched by `file_name`+`title`, not `id` — could delete the wrong document on a collision. | Filter by `id`. | `b832197` |
| Handbook | `src/services/employeeHandbook.ts` | `getStorageTarget` didn't recognize the `bucket/path` storage-ref format the current upload flow writes, falling back to a wrong bucket/path guess — **handbook docs uploaded via the current admin flow were broken for employees**. | Added the ref-format recognition `documents.ts` already uses. | `f298ee0` |
| Reports | `src/services/timeOffReport.ts` | `mondayOfWeek` computed the date from the browser's local time, bypassing the edge function's otherwise-correct America/New_York fallback — non-ET admins could send a mislabeled, stale week's report. | Compute via `Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'})`, matching the edge function. | `72ad162` |
| Employee drawer | `src/modules/employeeDocuments.ts`, `employeeDrawerTabLoads.ts` | Fast employee-switch mid-fetch could render the previous employee's documents into the new drawer — the AUD-010 guard only covers the identity header, not tab loaders. | Added `isCurrentDrawerEmployee()` guard, applied to the documents tab loader (pattern not yet extended to the other ~12 tab loaders — see follow-ups). | `14caa67` |
| Candidates | `src/modules/candidates.ts` | Hiring into an **existing** employee record (name/email match) silently dropped phone/position/department/email — only the `linked_employee_id` branch applied these. The "preserve phone" fix for this was never merged to `main`. | Applied the same updates-diff logic the `linked_employee_id` branch already has. | `b430411` |
| Candidates | RLS | `candidate_offers`/`candidate_interviews` not department-scoped (bare admin-or-supervisor); currently dead code paths. | New migration applying the same `orbis_candidate_row_visible()` pattern as `candidate_notes`. | `8e1ccca` |
| Candidates | Storage RLS | `candidate-resumes` bucket not department-scoped — **live gap**, since resumes are actively used. | New migration scoping storage access via the leading path segment back to the candidate row. | `560e741` |
| Internal Job Board | RLS | `internal_job_posting_events` INSERT had no check tying `actor_email` to the real caller — forgeable audit log. | New migration requiring `actor_email` to equal the caller's own JWT email. | `acb2c45` |
| Weekly HR report | `scripts/weekly_orbis_report_email.py` | `employees` fetch had no error handling (unlike every other query in the function) — a transient failure crashed the whole report with a raw traceback. | Wrapped in try/except with a clear `die()` message. | `4efa5f6` |

### Medium (fixed, code-only)

| Area | What was wrong | Fix | Commit |
|---|---|---|---|
| PTO sync matching | Generic prefix fallback (`"Mar" ~ "Martin"/"Marcus"`) could silently attach the wrong employee's balance with no second candidate to trip the ambiguity guard. | Removed generic prefix fallback in both script and edge function; exact/nickname-table only. | `b082f96` |
| Manual PTO adjust | "Blocked if QBT-sourced" check used a flag captured at drawer-load time — stale if a sync ran while the drawer was open. | Re-fetch live `pto_balance_source` immediately before applying any adjustment. | `eeb746c` |
| Incidents | No duplicate-submit guard (sibling to the already-fixed AUD-008 discipline bug). | Added `isIncidentSaveInProgress` guard. | `0c983b9` |
| Investigations | Subject sync deleted-then-inserted — a failed insert after a successful delete left zero subjects. | Insert new rows first, delete only the previously-existing ones (captured by id) after. | `b77a7e8` |
| Supervisor scope | `employeeMatchesSupervisorAccess` only read `supervisor_name`, unlike its siblings which also fall back to `display_name`. | Added the same fallback. | `c61f0aa` |
| Employee delete/rename | Cascade lists missing `investigation_subjects`, `internal_job_interest`, `handbook_acknowledgment_forms`, leadership academy tables. | Added the missing tables (plus a separate call for `leadership_coaching_sessions`, which uses a different column name). | `3c8242e` |
| Employee terminate/delete | No double-submit guard. | Added shared `isEmployeeLifecycleActionInProgress` guard. | `24d6261` |
| Janus | Account delete left uploaded files orphaned in storage. | List and remove files under the account's storage prefix before deleting the account row. | `0b8e0a8` |
| Candidates | Resume replace deleted the old file before the new upload was confirmed — permanent loss on a failed replace. | Reordered to upload-then-delete. | `d697bc0` |
| Internal Job Board | Hiring-manager scope matching used a bespoke substring check that over-granted on short collisions (e.g. "Lee" vs "Ashley Lee"). | Reused the already-tightened `supervisorNameMatches`. | `0c3fc05` |
| Candidates | Moving to "Hired" triggered irreversible hire-conversion immediately, no confirmation. | Added a confirmation dialog on that specific transition. | `1d4a9f5` |
| Scheduled jobs | Weekly HR report cron relied on a human manually editing it twice a year for DST (unlike its two sibling workflows). | Adopted the same dual-cron-slot + script-side ET-hour-check pattern. | `e21a149` |
| Scheduled jobs | `import_pto_balances.py`'s per-row PATCH loop aborted entirely on first failure. | Same collect-and-continue fix as the daily sync. | `46da46c` |

## Security findings

All of the RLS findings above are summarized here for convenience, since they're the core security content of this pass:

1. **Internal job board self-promotion / vandalism** (Critical) — any employee could escalate their own job application or alter any open posting via direct API calls that bypassed the UI entirely.
2. **Leave request tampering** (Critical) — an employee could rewrite fields on an approved PTO request while nominally cancelling it.
3. **Confidential HR data over-exposure** (High) — stay interviews and onboarding tasks were self-accessible by the employee they're about; care engagement wellness/follow-up data was readable org-wide by any supervisor instead of being scoped to their own team.
4. **Candidate data exposure** (High) — resume storage access wasn't department-scoped (live), and offer/interview RLS had the same gap (currently unused, so latent).
5. **Audit log forgery** (High) — the internal job board's audit trail could be written with a fake actor identity.

In every case above, the application's own UI never used the now-closed path — these were pure RLS-layer gaps reachable only via a direct Supabase client call (e.g. browser devtools), not something a normal user would stumble into, but real holes nonetheless for anyone who tried.

No secrets were found exposed to the browser, no service-role key is used client-side, and all QuickBooks Time API calls (across every script and edge function) are confirmed GET-only.

## Found but not fixed, and why

### Medium items needing a migration not written this pass (listed per your instruction, not fixed)

| Finding | Why deferred |
|---|---|
| `next_investigation_case_number()` race condition (`MAX()+1` with no locking) — concurrent case creation can produce a duplicate-key error. | Needs a DB-level sequence or row-lock change. |
| Onboarding/offboarding task duplication on concurrent drawer loads (no unique constraint + no upsert). | Needs a unique constraint + `on conflict` change. |
| Leadership Academy learners can bypass quiz-scoring RPCs via direct writes to `leadership_quiz_attempts`/`leadership_module_progress`. | Needs an RLS policy change restricting those tables to admin/RPC-only writes. |
| Leadership quiz attempt race (no unique constraint on `attempt_number`). | Needs a unique constraint + retry logic. |
| `internal_job_postings` INSERT not department-scoped (a supervisor can create a posting for a department they don't manage). | Needs a `WITH CHECK` change — cheap to bundle into the Critical #2 migration above as a follow-up, but not done this pass to keep that migration's diff minimal and reviewable. |

### Explicitly left alone per your instruction

- **Dead `job_requisitions` table** — has RLS, zero application code reads or writes it. Candidate for removal.
- **Legacy `onboarding_checklists`/`onboarding_checklist_items`/`onboarding_templates`** — superseded by `onboarding_tasks`, confirmed unused by any current code path, but left in place as requested.
- **Git history for the removed PII CSV** (`scripts/examples/pto_balances_2026-06-03.csv`) — the file is deleted from the working tree, but the real employee data remains in prior commits. You said the repo is going private and you'll decide separately about a history scrub (`git filter-repo` or BFG, then a forced push and a heads-up to anyone else with a clone).

### Low/cosmetic findings not actioned (full detail was in the earlier findings summary; grouped here)

- **~50 pre-existing lint warnings** (unused vars, mostly from completed refactors leaving exports/locals behind) — not touched this pass; safe to clean up in a dedicated pass since none affect behavior.
- **Prior-audit housekeeping**: a stray static RLS reference file (`supabase/orbis_rls_helpers.sql`) has drifted out of sync with applied migrations and could reintroduce the old loose supervisor-name matcher if someone pastes it into the SQL editor "for quick reference" as the README suggests; the "Search/org/directory" item marked "Partial" in `docs/AUDIT_DATA_INTEGRITY.md` was re-verified and appears fully resolved — the audit table should be updated to reflect that.
- **Naming drift**: `employees.next_review_date` is now used exclusively for stay-interview due dates (since AUD-004), but the name itself invites a future developer to reuse it for performance reviews and recreate the original bug.
- **Janus**: Copper CSV re-import inflates "created" counts on records that were actually updated; `copper_id` has no uniqueness constraint (a race could create duplicate accounts); a misleading "saved" toast on the AI meeting-summary fallback (nothing is saved until the user clicks Save); `janus_signing_documents`/`janus_document_signing_links` tables are named after a feature that's since been decoupled from Janus entirely, which will likely confuse a future reviewer.
- **Reports/Settings**: `user_access` relies on RLS alone for admin-only writes with no second-layer guard trigger (unlike `profiles.hr_role`'s `orbis_profiles_guard_hr_role`) — not currently exploitable, but no defense-in-depth if a future migration loosens the RLS; supervisor team-access sync failures are logged via `console.warn` only, with no toast.
- **Candidates**: new-employee ID generation on hire doesn't retry on a duplicate-key race (only on missing-column errors, unlike the main "add employee" flow); `resume_url` isn't carried over to the new employee record on hire, so the original resume becomes unreachable; the create-candidate duplicate check is a DOM scan of currently-rendered rows, missing out-of-view candidates; the fallback resume-storage bucket requires admin access, so a supervisor's upload fallback fails with a confusing error instead of a clear one; `application/octet-stream` in the resume MIME allowlist effectively accepts any file type for files with an unrecognized extension; a failed payroll handoff on hire is silently swallowed (toast still shows success).
- **AI integrations**: investigation/stay-interview/Janus-meeting data sent to OpenAI is a legitimate third-party data flow for sensitive text (not a code bug) — worth a data-processing-agreement/retention review, not a fix.
- **Leadership Academy**: no sequential module-gating exists at any layer (a learner can jump straight to the final quiz) — flagged because the task asked to check, but no stated product requirement for linear gating, so not treated as a bug.
- **Stale git branches**: 7 remote branches (`codex/fix-new-employee-admin`, `codex/private-hr-notes`, `cursor/guard-stale-employee-drawer-renders`, `fix/candidate-hiring-phone`, `fix/disable-annual-review-due-dates`, `fix/part-time-fte-count`, `fix/review-reminder-date-counts`) are confirmed already superseded by equivalent commits on `main` — safe to prune, not touched this pass.

## Suggested follow-ups

1. **Extend the drawer-staleness guard** (`isCurrentDrawerEmployee`, added this pass) to the remaining tab loaders: discipline, incidents, meetings, stay-interviews, reviews, emergency contacts, onboarding, offboarding, time-off, history, care-support. The pattern is now established and mechanical — a quick, low-risk follow-up pass.
2. **Bundle the deferred `internal_job_postings` INSERT department-scope fix** into a small follow-up migration alongside the five other deferred Medium items above.
3. **Rename `employees.next_review_date` → `next_stay_interview_date`** everywhere (requires a data migration + find/replace) to fully retire the ambiguous legacy name.
4. **Retire or regenerate** `supabase/orbis_rls_helpers.sql`/`orbis_rls_policies.sql` as stale reference snapshots, or update `supabase/README.md` to stop suggesting they're safe to paste into the SQL editor.
5. **Drop the dead `job_requisitions` and legacy `onboarding_checklists`/`onboarding_checklist_items`/`onboarding_templates` tables** (needs a migration — your call on timing).
6. **Add a column-level guard trigger on `user_access`** mirroring `orbis_profiles_guard_hr_role`, as defense-in-depth against a future RLS regression.
7. **Add magic-byte validation** to `supabase/functions/form-signature/signatureValidation.ts`, matching `document-signature/index.ts`'s existing check.
8. **Clean up the ~50 pre-existing lint warnings** (unused vars/exports) in a dedicated pass — all safe, none behavior-affecting.
9. **Prune the 7 stale, already-merged remote branches** listed above.
10. **Decide on a git-history scrub** for the removed PTO balances CSV, now that the repo is going private.
11. Smaller Janus polish: fix Copper import created/updated counters, add a `copper_id` unique constraint, fix the misleading AI-summary "saved" toast, rename the no-longer-Janus-specific signing tables.

None of these are urgent; none change product behavior on their own.

## Migrations — apply in this exact order

All nine are written under `supabase/migrations/` but **not applied**. Apply with `npx supabase db push` once you've reviewed them — Supabase applies by filename timestamp, so running them in one `db push` will naturally apply in this order:

| # | File | What it changes | Lock-out risk |
|---|---|---|---|
| 1 | `20261029160000_internal_job_interest_staff_only_update.sql` | `internal_job_interest` UPDATE → staff-only | None — no UI path used the closed self-row branch. |
| 2 | `20261029161000_internal_job_postings_manage_predicate.sql` | `internal_job_postings` UPDATE → manage-only predicate | None — UI already restricts editing the same way. |
| 3 | `20261029162000_leave_requests_cancel_guard.sql` | Employee self-cancel requires `status='requested'`; trigger blocks other column changes | None — no UI path lets an employee self-cancel today; if you build that feature later, it must cancel a still-`requested` row. |
| 4 | `20261029163000_stay_interviews_hr_only.sql` | `stay_interviews` → HR-staff-only (admin/supervisor), no self-view | None — confirmed no employee-portal UI references this table. |
| 5 | `20261029164000_onboarding_tasks_hr_only.sql` | `onboarding_tasks` → HR-staff-only for all operations | None — confirmed the Onboarding tab and its writers require admin/supervisor app access already. |
| 6 | `20261029165000_care_engagement_supervisor_scope.sql` | 4 care tables' SELECT scoped to the employee's own supervisor | **Behavior change, intended**: a supervisor will no longer see wellness/follow-up/resource/recognition data for employees outside their own team. This is the fix — confirm it matches your intended access model before applying. |
| 7 | `20261029166000_candidate_offers_interviews_department_scope.sql` | `candidate_offers`/`candidate_interviews` → department-scoped | None — tables are unused by current app code. |
| 8 | `20261029167000_candidate_resumes_storage_department_scope.sql` | Resume storage → department-scoped | **Behavior change, intended**: a supervisor can no longer fetch another department's candidate resume. Matches the `candidates` table's own existing scoping. |
| 9 | `20261029168000_internal_job_posting_events_actor_guard.sql` | Audit-log INSERT requires `actor_email` = caller's own JWT email | None — the app already only ever sends the caller's own email. |

After applying, redeploy the one edge function that changed:

```bash
npx supabase functions deploy sync-qbt-pto
```

No other edge functions were modified this pass.

## Exact commands

**Review the branch locally:**
```bash
git fetch origin
git log --oneline main..cleanup/deep-review   # see all 34 commits
git diff main...cleanup/deep-review           # full diff
```

**Push the branch (does not touch main):**
```bash
git push -u origin cleanup/deep-review
```

**When you're ready to ship (in this order):**
```bash
# 1. Apply the 9 new migrations (review them first!)
npx supabase db push

# 2. Deploy the one changed edge function
npx supabase functions deploy sync-qbt-pto

# 3. Merge/push to main — Vercel auto-deploys the frontend on push
#    (open a PR from cleanup/deep-review, or merge locally and push main)
git checkout main
git merge cleanup/deep-review
git push origin main
```

## Phase 4 — verification status

Ran the full Playwright suite locally (installed Chromium for this sandbox): **19 of 25 tests pass** with no backend configured at all. These cover bundle/startup integrity, the pre-auth login shell, mobile responsive layout (login + drawer chrome at several viewport widths), an Excel export using mocked in-memory employee data, and 4 of 6 publisher-document-signing flows that mock the network layer directly.

The **6 failing tests all require a real authenticated session against a live Supabase project** — exactly the ones gated on real backend data, which is expected without credentials:
- `handbook-group-signing.spec.ts` (2 tests) — need a real group-signing link
- `handbook-signing.spec.ts` (3 tests) — need a real signing token / backend-configured Supabase URL
- `publisher-document-signing.spec.ts` (1 test) — needs a real admin sign-in (`window.signIn`)

**Role-based click-through (admin/supervisor/employee main flows) has not been done.** That needs training-project credentials (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` for the Northline demo Supabase project, dropped into `.env.training`) so I can run `npm run dev:training` and either drive it myself or hand you a checklist. Send those when you're ready, or let me know if you'd rather do that pass yourself using the DEPLOY.md "Smoke test" list plus the lifecycle checklist in `docs/AUDIT_DATA_INTEGRITY.md`.
