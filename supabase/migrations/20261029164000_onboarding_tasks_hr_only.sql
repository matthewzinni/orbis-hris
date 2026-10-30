-- Fix: onboarding_tasks RLS used orbis_employee_child_accessible, whose self-view branch
-- grants the task's own employee full insert/update/delete -- not just the "toggle my own
-- completion checkbox" the UI intends. In practice the Onboarding tab (and its
-- toggleOnboardingTask/updateOnboardingTaskField writers) is only reachable from the
-- employee drawer, which requires admin/supervisor-level app access
-- (canAccessOrbisApp()) -- plain employee-portal users never see this tab or call these
-- functions for their own record. So, same as the stay_interviews fix, this closes unused
-- attack surface with no legitimate behavior change by requiring admin or the employee's
-- supervisor for every operation.

drop policy if exists orbis_onboarding_tasks_select on public.onboarding_tasks;
create policy orbis_onboarding_tasks_select on public.onboarding_tasks for select to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_onboarding_tasks_insert on public.onboarding_tasks;
create policy orbis_onboarding_tasks_insert on public.onboarding_tasks for insert to authenticated
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_onboarding_tasks_update on public.onboarding_tasks;
create policy orbis_onboarding_tasks_update on public.onboarding_tasks for update to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text))
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_onboarding_tasks_delete on public.onboarding_tasks;
create policy orbis_onboarding_tasks_delete on public.onboarding_tasks for delete to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));
