-- Canonical copy: supabase/migrations/20250520120002_orbis_rls_policies.sql
-- Apply via: npm run db:push
-- Requires: public.employees, user_access, profiles, and Orbis child tables.

-- ---------------------------------------------------------------------------
-- user_access
-- ---------------------------------------------------------------------------

alter table if exists public.user_access enable row level security;

drop policy if exists orbis_user_access_select on public.user_access;
create policy orbis_user_access_select
  on public.user_access
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or lower(trim(email)) = public.orbis_auth_email()
  );

grant select, insert, update, delete on table public.user_access to authenticated;

drop policy if exists orbis_user_access_write_admin on public.user_access;
drop policy if exists orbis_user_access_insert_admin on public.user_access;
drop policy if exists orbis_user_access_update_admin on public.user_access;
drop policy if exists orbis_user_access_delete_admin on public.user_access;

create policy orbis_user_access_insert_admin
  on public.user_access
  for insert
  to authenticated
  with check (public.orbis_is_admin());

create policy orbis_user_access_update_admin
  on public.user_access
  for update
  to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

create policy orbis_user_access_delete_admin
  on public.user_access
  for delete
  to authenticated
  using (public.orbis_is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table if exists public.profiles enable row level security;

drop policy if exists orbis_profiles_select on public.profiles;
create policy orbis_profiles_select
  on public.profiles
  for select
  to authenticated
  using (public.orbis_is_admin() or id = public.orbis_auth_uid());

drop policy if exists orbis_profiles_update on public.profiles;
create policy orbis_profiles_update
  on public.profiles
  for update
  to authenticated
  using (public.orbis_is_admin() or id = public.orbis_auth_uid())
  with check (public.orbis_is_admin() or id = public.orbis_auth_uid());

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------

alter table if exists public.employees enable row level security;

drop policy if exists orbis_employees_select on public.employees;
create policy orbis_employees_select
  on public.employees
  for select
  to authenticated
  using (public.orbis_employee_row_visible(employees));

drop policy if exists orbis_employees_insert_admin on public.employees;
create policy orbis_employees_insert_admin
  on public.employees
  for insert
  to authenticated
  with check (public.orbis_is_admin());

drop policy if exists orbis_employees_update_admin on public.employees;
create policy orbis_employees_update_admin
  on public.employees
  for update
  to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_employees_update_supervisor on public.employees;
create policy orbis_employees_update_supervisor
  on public.employees
  for update
  to authenticated
  using (
    public.orbis_is_supervisor()
    and public.orbis_supervisor_sees_employee(employees)
  )
  with check (
    public.orbis_is_supervisor()
    and public.orbis_supervisor_sees_employee(employees)
  );

drop policy if exists orbis_employees_delete_admin on public.employees;
create policy orbis_employees_delete_admin
  on public.employees
  for delete
  to authenticated
  using (public.orbis_is_admin());

-- ---------------------------------------------------------------------------
-- Employee child tables (scoped by employee_id)
-- ---------------------------------------------------------------------------

-- Macro-style: notes, meetings, discipline, incidents, stay interviews, onboarding, documents, audit

alter table if exists public.employee_notes enable row level security;
drop policy if exists orbis_employee_notes_select on public.employee_notes;
create policy orbis_employee_notes_select on public.employee_notes for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_notes_insert on public.employee_notes;
create policy orbis_employee_notes_insert on public.employee_notes for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_notes_update on public.employee_notes;
create policy orbis_employee_notes_update on public.employee_notes for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_notes_delete on public.employee_notes;
create policy orbis_employee_notes_delete on public.employee_notes for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.employee_meetings enable row level security;
drop policy if exists orbis_employee_meetings_select on public.employee_meetings;
create policy orbis_employee_meetings_select on public.employee_meetings for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_meetings_insert on public.employee_meetings;
create policy orbis_employee_meetings_insert on public.employee_meetings for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_meetings_update on public.employee_meetings;
create policy orbis_employee_meetings_update on public.employee_meetings for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_meetings_delete on public.employee_meetings;
create policy orbis_employee_meetings_delete on public.employee_meetings for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.discipline_reports enable row level security;
drop policy if exists orbis_discipline_reports_select on public.discipline_reports;
create policy orbis_discipline_reports_select on public.discipline_reports for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_discipline_reports_insert on public.discipline_reports;
create policy orbis_discipline_reports_insert on public.discipline_reports for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_discipline_reports_update on public.discipline_reports;
create policy orbis_discipline_reports_update on public.discipline_reports for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_discipline_reports_delete on public.discipline_reports;
create policy orbis_discipline_reports_delete on public.discipline_reports for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.incident_reports enable row level security;
drop policy if exists orbis_incident_reports_select on public.incident_reports;
create policy orbis_incident_reports_select on public.incident_reports for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_incident_reports_insert on public.incident_reports;
create policy orbis_incident_reports_insert on public.incident_reports for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_incident_reports_update on public.incident_reports;
create policy orbis_incident_reports_update on public.incident_reports for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_incident_reports_delete on public.incident_reports;
create policy orbis_incident_reports_delete on public.incident_reports for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.stay_interviews enable row level security;
drop policy if exists orbis_stay_interviews_select on public.stay_interviews;
create policy orbis_stay_interviews_select on public.stay_interviews for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_stay_interviews_insert on public.stay_interviews;
create policy orbis_stay_interviews_insert on public.stay_interviews for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_stay_interviews_update on public.stay_interviews;
create policy orbis_stay_interviews_update on public.stay_interviews for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_stay_interviews_delete on public.stay_interviews;
create policy orbis_stay_interviews_delete on public.stay_interviews for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.onboarding_tasks enable row level security;
drop policy if exists orbis_onboarding_tasks_select on public.onboarding_tasks;
create policy orbis_onboarding_tasks_select on public.onboarding_tasks for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_onboarding_tasks_insert on public.onboarding_tasks;
create policy orbis_onboarding_tasks_insert on public.onboarding_tasks for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_onboarding_tasks_update on public.onboarding_tasks;
create policy orbis_onboarding_tasks_update on public.onboarding_tasks for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_onboarding_tasks_delete on public.onboarding_tasks;
create policy orbis_onboarding_tasks_delete on public.onboarding_tasks for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.employee_documents enable row level security;
drop policy if exists orbis_employee_documents_select on public.employee_documents;
create policy orbis_employee_documents_select on public.employee_documents for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_documents_insert on public.employee_documents;
create policy orbis_employee_documents_insert on public.employee_documents for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_documents_update on public.employee_documents;
create policy orbis_employee_documents_update on public.employee_documents for update to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_documents_delete on public.employee_documents;
create policy orbis_employee_documents_delete on public.employee_documents for delete to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

alter table if exists public.employee_audit_logs enable row level security;
drop policy if exists orbis_employee_audit_logs_select on public.employee_audit_logs;
create policy orbis_employee_audit_logs_select on public.employee_audit_logs for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
drop policy if exists orbis_employee_audit_logs_insert on public.employee_audit_logs;
create policy orbis_employee_audit_logs_insert on public.employee_audit_logs for insert to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));

-- ---------------------------------------------------------------------------
-- Performance reviews (stricter than general child tables)
-- ---------------------------------------------------------------------------

alter table if exists public.employee_reviews enable row level security;

drop policy if exists orbis_employee_reviews_select on public.employee_reviews;
create policy orbis_employee_reviews_select
  on public.employee_reviews
  for select
  to authenticated
  using (public.orbis_performance_review_visible(employee_id::text));

drop policy if exists orbis_employee_reviews_insert on public.employee_reviews;
create policy orbis_employee_reviews_insert
  on public.employee_reviews
  for insert
  to authenticated
  with check (public.orbis_performance_review_visible(employee_id::text));

drop policy if exists orbis_employee_reviews_update on public.employee_reviews;
create policy orbis_employee_reviews_update
  on public.employee_reviews
  for update
  to authenticated
  using (public.orbis_performance_review_visible(employee_id::text))
  with check (public.orbis_performance_review_visible(employee_id::text));

drop policy if exists orbis_employee_reviews_delete on public.employee_reviews;
create policy orbis_employee_reviews_delete
  on public.employee_reviews
  for delete
  to authenticated
  using (public.orbis_performance_review_visible(employee_id::text));

-- ---------------------------------------------------------------------------
-- Candidates (admin: all; supervisor: department scope)
-- ---------------------------------------------------------------------------

alter table if exists public.candidates enable row level security;

drop policy if exists orbis_candidates_admin on public.candidates;

drop policy if exists orbis_candidates_select on public.candidates;
create policy orbis_candidates_select
  on public.candidates
  for select
  to authenticated
  using (public.orbis_candidate_row_visible(candidates));

drop policy if exists orbis_candidates_insert on public.candidates;
create policy orbis_candidates_insert
  on public.candidates
  for insert
  to authenticated
  with check (public.orbis_candidate_department_visible(department));

drop policy if exists orbis_candidates_update on public.candidates;
create policy orbis_candidates_update
  on public.candidates
  for update
  to authenticated
  using (public.orbis_candidate_row_visible(candidates))
  with check (public.orbis_candidate_department_visible(department));

drop policy if exists orbis_candidates_delete on public.candidates;
create policy orbis_candidates_delete
  on public.candidates
  for delete
  to authenticated
  using (public.orbis_candidate_row_visible(candidates));

alter table if exists public.candidate_notes enable row level security;

drop policy if exists orbis_candidate_notes_admin on public.candidate_notes;

drop policy if exists orbis_candidate_notes_select on public.candidate_notes;
create policy orbis_candidate_notes_select
  on public.candidate_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_notes_insert on public.candidate_notes;
create policy orbis_candidate_notes_insert
  on public.candidate_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_notes_update on public.candidate_notes;
create policy orbis_candidate_notes_update
  on public.candidate_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  )
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_notes_delete on public.candidate_notes;
create policy orbis_candidate_notes_delete
  on public.candidate_notes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_notes.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );
