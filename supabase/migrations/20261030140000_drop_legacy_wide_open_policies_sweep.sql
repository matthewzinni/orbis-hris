-- Full-schema follow-up to 20261030130000 (which fixed stay_interviews and onboarding_tasks).
-- A broader sweep found the exact same pattern on 13 more tables plus storage.objects: old,
-- untracked permissive policies -- many literally `using (true)` / `with check (true)`, two of
-- them granted to the anon role -- stacked alongside properly-scoped orbis_* (or otherwise
-- legitimately scoped) policies for the same command. Postgres ORs permissive policies
-- together, so these wide-open legacy policies currently win regardless of how tight the
-- scoped policy is. None of these exist in any migration file in this repo -- all created
-- out-of-band, almost certainly via the Supabase dashboard, over the life of the project.
--
-- Confirmed via pg_policies on production before writing this migration, including the exact
-- policy bodies (qual/with_check), to tell real holes apart from harmless redundant-but-narrow
-- policies, which this migration deliberately leaves alone:
--   - "Only Matthew can delete <table>" (exact-email check) -- redundant with admin access,
--     not a hole.
--   - "Scoped <cmd> <table>" (uses can_access_employee(employee_id): admin or the employee's
--     own supervisor) -- a real, correctly-scoped grant, not a hole.
--   - profiles "Users can read own profile" / user_access "Users can read own access row"
--     (self-row only via auth.uid()/auth.email()) -- legitimate self-service, not touched.
--   - employees "Admins can view all employees", "Supervisors can view assigned employees",
--     "Supervisors can view only their employees", "Supervisors can update their employees"
--     -- correctly scoped, not touched.
--
-- Most severe findings, both now fixed by this migration:
--   - employees: "Allow all select" and read_employees_anon granted the ANON role (no login
--     required at all) full read access to the entire employee table.
--   - candidates: "Allow all select" granted the same anonymous read access to every
--     candidate record.
--   - employee_audit_logs: insert/select granted to role `public` with no auth check at all.
--   - employees: "Delete" (any authenticated user, no admin check) allowed deleting any
--     employee row outright.

drop policy if exists "Allow delete for authenticated users" on public.candidates;
drop policy if exists "Allow insert for authenticated users" on public.candidates;
drop policy if exists "Allow all select" on public.candidates;
drop policy if exists "Allow select for authenticated users" on public.candidates;
drop policy if exists "Allow update for authenticated users" on public.candidates;

drop policy if exists "Allow authenticated users to delete discipline reports" on public.discipline_reports;
drop policy if exists "Authenticated users can delete discipline reports" on public.discipline_reports;
drop policy if exists "Allow authenticated users to insert discipline reports" on public.discipline_reports;
drop policy if exists "Authenticated users can insert discipline reports" on public.discipline_reports;
drop policy if exists discipline_insert on public.discipline_reports;
drop policy if exists discipline_reports_insert_authenticated on public.discipline_reports;
drop policy if exists "Allow authenticated users to select discipline reports" on public.discipline_reports;
drop policy if exists "Authenticated users can read discipline reports" on public.discipline_reports;
drop policy if exists discipline_reports_select_authenticated on public.discipline_reports;
drop policy if exists discipline_select on public.discipline_reports;
drop policy if exists "Allow authenticated users to update discipline reports" on public.discipline_reports;
drop policy if exists "Authenticated users can update discipline reports" on public.discipline_reports;
drop policy if exists discipline_reports_update_authenticated on public.discipline_reports;
drop policy if exists discipline_update on public.discipline_reports;

drop policy if exists "Allow authenticated document deletes" on public.document_library;
drop policy if exists "Allow authenticated document inserts" on public.document_library;
drop policy if exists "Allow authenticated document reads" on public.document_library;
drop policy if exists "Allow authenticated document updates" on public.document_library;

drop policy if exists "Allow insert emergency contacts" on public.emergency_contacts;
drop policy if exists "Allow read emergency contacts" on public.emergency_contacts;
drop policy if exists "Allow update emergency contacts" on public.emergency_contacts;

drop policy if exists "Allow audit log inserts" on public.employee_audit_logs;
drop policy if exists "Allow inserts" on public.employee_audit_logs;
drop policy if exists "Allow audit log select" on public.employee_audit_logs;

drop policy if exists "Allow authenticated users to delete employee documents" on public.employee_documents;
drop policy if exists "Allow_Delete_Documents" on public.employee_documents;
drop policy if exists "Allow authenticated users to insert employee documents" on public.employee_documents;
drop policy if exists "Allow_Insert_Documents" on public.employee_documents;
drop policy if exists "Allow authenticated users to select employee documents" on public.employee_documents;
drop policy if exists "Allow_Select_Documents" on public.employee_documents;
drop policy if exists "Allow authenticated users to update employee documents" on public.employee_documents;

drop policy if exists "Allow authenticated users to delete employee meetings" on public.employee_meetings;
drop policy if exists "Authenticated users can delete employee meetings" on public.employee_meetings;
drop policy if exists "Allow authenticated users to insert employee meetings" on public.employee_meetings;
drop policy if exists "Authenticated users can insert employee meetings" on public.employee_meetings;
drop policy if exists employee_meetings_insert_authenticated on public.employee_meetings;
drop policy if exists "Allow authenticated users to select employee meetings" on public.employee_meetings;
drop policy if exists "Authenticated users can read employee meetings" on public.employee_meetings;
drop policy if exists employee_meetings_select_authenticated on public.employee_meetings;
drop policy if exists "Allow authenticated users to update employee meetings" on public.employee_meetings;
drop policy if exists "Authenticated users can update employee meetings" on public.employee_meetings;
drop policy if exists employee_meetings_update_authenticated on public.employee_meetings;

drop policy if exists "Allow authenticated users to delete employee notes" on public.employee_notes;
drop policy if exists "Allow authenticated users to insert employee notes" on public.employee_notes;
drop policy if exists "Authenticated users can insert employee notes" on public.employee_notes;
drop policy if exists employee_notes_insert_authenticated on public.employee_notes;
drop policy if exists "Allow authenticated users to select employee notes" on public.employee_notes;
drop policy if exists "Authenticated users can read employee notes" on public.employee_notes;
drop policy if exists employee_notes_select_authenticated on public.employee_notes;
drop policy if exists "Allow authenticated users to update employee notes" on public.employee_notes;
drop policy if exists "Authenticated users can update employee notes" on public.employee_notes;
drop policy if exists employee_notes_update_authenticated on public.employee_notes;

drop policy if exists "Allow authenticated users to delete employee reviews" on public.employee_reviews;
drop policy if exists "authenticated can delete employee_reviews" on public.employee_reviews;
drop policy if exists "Allow authenticated users to insert employee reviews" on public.employee_reviews;
drop policy if exists "authenticated can insert employee_reviews" on public.employee_reviews;
drop policy if exists "Allow authenticated users to select employee reviews" on public.employee_reviews;
drop policy if exists "authenticated can select employee_reviews" on public.employee_reviews;
drop policy if exists "Allow authenticated users to update employee reviews" on public.employee_reviews;
drop policy if exists "authenticated can update employee_reviews" on public.employee_reviews;

drop policy if exists "Delete" on public.employees;
drop policy if exists "Allow authenticated insert" on public.employees;
drop policy if exists employees_insert_authenticated on public.employees;
drop policy if exists "Allow all select" on public.employees;
drop policy if exists "Allow authenticated read" on public.employees;
drop policy if exists "Authenticated users can read employees" on public.employees;
drop policy if exists "authenticated can read employees" on public.employees;
drop policy if exists employees_select_authenticated on public.employees;
drop policy if exists read_employees_anon on public.employees;
drop policy if exists read_employees_authenticated on public.employees;
drop policy if exists "Allow authenticated update" on public.employees;
drop policy if exists employees_update_authenticated on public.employees;

drop policy if exists "auth access onboarding checklist items" on public.onboarding_checklist_items;
drop policy if exists "auth write onboarding" on public.onboarding_checklists;
drop policy if exists "Allow all" on public.onboarding_task_templates;

drop policy if exists "Allow authenticated deletes" on storage.objects;
drop policy if exists "Allow_Delete_Documents 75ydll_0" on storage.objects;
drop policy if exists "Allow authenticated document uploads" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow_Upload_Documents 75ydll_0" on storage.objects;
drop policy if exists "Allow authenticated document reads" on storage.objects;
drop policy if exists "Allow authenticated reads" on storage.objects;
drop policy if exists "Allow_Read_Documents 75ydll_0" on storage.objects;
drop policy if exists "Allow authenticated document updates" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
