# Private employee HR Notes

Employee drawer Notes are restricted to Matthew's work account (`matthew.zinni@btwglobal.com`). Other Orbis admins, supervisors and employees cannot read or modify ordinary HR Notes through the database API. The tab, lazy loader, print action, employee timeline and mobile activity feed enforce the same visibility.

The migration seeds a protected singleton owner record from the existing Supabase Auth user ID. Client accounts cannot read or change this configuration; granting another account the admin role does not grant Notes access. The owner must also retain approved admin access. If that auth account is missing, the restriction fails closed. A replacement account needs an explicit database-operator update of `hr_notes_owner` after verifying the new identity.

Existing ordinary notes become private without changing their content. Four legacy operational note types (`At-Risk Flag`, `At-Risk Cleared`, `Impact Player Flag`, `Impact Player Cleared`) remain available under the existing staff/team permissions because they drive employee flags and dashboard counts. They do not appear in HR Notes/history/activity. A trigger prevents converting ordinary notes into shared flags or vice versa.

## Deployment

1. Sign in to the Supabase CLI and link the **BTW production** project (`fxljbnyarfwnqgheywgw`).
2. Review `supabase db push --dry-run`, then apply `20261014180000_private_hr_notes.sql`. Do not accidentally apply unrelated pending migrations.
3. In the trusted SQL editor, verify `select count(*) from public.hr_notes_owner;` is **1** and the row matches Matthew's existing work auth account. Do not publish the UUID or note contents.
4. Deploy the app change and hard refresh. Matthew should see Private HR Note; another admin should not see Notes or private note activity/history.
5. Verify API access using another admin's real session, without publishing tokens or note contents. The automated PGlite tests cover the same RLS read/write restrictions, owner-table protection, anonymous/employee/revoked access, scoped flag behavior and relabeling attacks.

Apply the database restriction before claiming the feature is private. Supabase database owners, service-role credentials and infrastructure backups remain privileged; this feature restricts normal Orbis users, including application admins. Previously printed/exported copies are not recalled.
