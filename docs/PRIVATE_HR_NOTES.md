# Leadership employee HR Notes

Existing and future employee HR Notes are visible and editable by Matthew Zinni, Brent Wynne, and Trent Wynne using their approved admin work accounts. Other admins, supervisors, employees, and personal accounts cannot access ordinary HR Notes. Notes, printing, employee timelines, and mobile feeds use the same access check.

The protected `hr_notes_access` table contains the three existing Supabase Auth IDs. Application users cannot read or change membership. Admin role alone does not grant access. Revoked admin access fails closed. Operational flags retain existing staff/team permissions, and ordinary notes cannot be relabeled as flags.

Apply `20261014190000_shared_hr_notes_leadership.sql` after the existing private-notes migration, then deploy the frontend. The migration aborts if any of the three work accounts is missing. No note content is changed. Verify the protected membership count is three and verify view/create/edit with the three accounts; verify another admin is denied.
