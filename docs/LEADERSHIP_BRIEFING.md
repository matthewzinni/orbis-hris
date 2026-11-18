# Weekly leadership briefing

Reports contains an admin-only seven-day briefing editor. The default period is
the last completed Monday–Sunday week. Generation performs read-only queries;
it does not sync workflows, modify employees, send email, or call AI services.

## Installation

Deploy the application through the existing Orbis release process and apply
`20261118120000_leadership_briefings.sql` through the established Supabase
migration process. Review pending migrations before applying anything. This
change does not apply migrations automatically.

Without the migration, generation, text download, and print remain available;
save and saved-version listing explain that storage is unavailable. There is no
browser-storage fallback that could be confused with an Orbis save.

## Data and limitations

- Explicit field lists exclude investigation/care data, performance narratives,
  scores, signatures, and reasons for departure.
- Queries paginate at 500 rows and use existing RLS policies. Counts are of
  accessible records, not guaranteed organization-wide totals.
- Hire/departure dates are recorded dates, not a historical employment ledger.
- Reviews are counted as recorded, not assumed signed or acknowledged.
- Onboarding/training completion requires completed status and a completion date.
- Current overdue items are labeled as current even for past reporting periods.
- Attendance reads daily snapshots for the reporting week and preceding week.
  Missing days are not zeros. Counts represent employee-days, not an absence rate.
- Supporting records are embedded with each metric and saved with the snapshot.
- Every save inserts an immutable new version; only approved admins can select
  or insert. Update/delete are intentionally not granted to application users.
- Saved versions retain the original data and generation time when reopened.
- No automatic distribution is implemented. Users must review free-text edits
  for sensitive information before downloading or printing.

## Verification

Focused tests cover dates, boundaries, missing data, overdue status, source
pagination, field allowlists, authorization, and failed saves. Before production
release, use isolated fixtures to verify admin generation, save/reopen, printing,
non-admin denial, and migration RLS behavior. Never mutate production HR records
for testing.
