-- Enable RLS on baseline recruiting / onboarding template tables that lacked policies.

-- Job requisitions: admins and supervisors
alter table if exists public.job_requisitions enable row level security;

drop policy if exists orbis_job_requisitions_select on public.job_requisitions;
create policy orbis_job_requisitions_select
  on public.job_requisitions for select to authenticated
  using (public.orbis_is_admin() or public.orbis_is_supervisor());

drop policy if exists orbis_job_requisitions_write on public.job_requisitions;
create policy orbis_job_requisitions_write
  on public.job_requisitions for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

-- Candidate interviews / offers: same as candidates (admin/supervisor)
alter table if exists public.candidate_interviews enable row level security;
alter table if exists public.candidate_offers enable row level security;

drop policy if exists orbis_candidate_interviews_all on public.candidate_interviews;
create policy orbis_candidate_interviews_all
  on public.candidate_interviews for all to authenticated
  using (public.orbis_is_admin() or public.orbis_is_supervisor())
  with check (public.orbis_is_admin() or public.orbis_is_supervisor());

drop policy if exists orbis_candidate_offers_all on public.candidate_offers;
create policy orbis_candidate_offers_all
  on public.candidate_offers for all to authenticated
  using (public.orbis_is_admin() or public.orbis_is_supervisor())
  with check (public.orbis_is_admin() or public.orbis_is_supervisor());

-- Onboarding templates / checklists: admin only
alter table if exists public.onboarding_checklists enable row level security;
alter table if exists public.onboarding_templates enable row level security;
alter table if exists public.onboarding_checklist_items enable row level security;
alter table if exists public.onboarding_task_templates enable row level security;

drop policy if exists orbis_onboarding_checklists_all on public.onboarding_checklists;
create policy orbis_onboarding_checklists_all
  on public.onboarding_checklists for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_onboarding_templates_all on public.onboarding_templates;
create policy orbis_onboarding_templates_all
  on public.onboarding_templates for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_onboarding_checklist_items_all on public.onboarding_checklist_items;
create policy orbis_onboarding_checklist_items_all
  on public.onboarding_checklist_items for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_onboarding_task_templates_all on public.onboarding_task_templates;
create policy orbis_onboarding_task_templates_all
  on public.onboarding_task_templates for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

-- Separation log / iron shift / department: admin read/write; supervisors read
alter table if exists public.separation_log enable row level security;
alter table if exists public.iron_shift_awards enable row level security;
alter table if exists public.department enable row level security;

drop policy if exists orbis_separation_log_select on public.separation_log;
create policy orbis_separation_log_select
  on public.separation_log for select to authenticated
  using (public.orbis_is_admin() or public.orbis_is_supervisor());

drop policy if exists orbis_separation_log_write on public.separation_log;
create policy orbis_separation_log_write
  on public.separation_log for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_iron_shift_awards_select on public.iron_shift_awards;
create policy orbis_iron_shift_awards_select
  on public.iron_shift_awards for select to authenticated
  using (public.orbis_is_admin() or public.orbis_is_supervisor());

drop policy if exists orbis_iron_shift_awards_write on public.iron_shift_awards;
create policy orbis_iron_shift_awards_write
  on public.iron_shift_awards for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_department_select on public.department;
create policy orbis_department_select
  on public.department for select to authenticated
  using (true);

drop policy if exists orbis_department_write on public.department;
create policy orbis_department_write
  on public.department for all to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());
