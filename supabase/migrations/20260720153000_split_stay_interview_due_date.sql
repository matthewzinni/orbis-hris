-- Split stay-interview due dates from performance next_review_date.
-- Stay scheduling must not overwrite performance review due dates.

alter table public.employees
  add column if not exists next_stay_interview_date date;

comment on column public.employees.next_stay_interview_date is
  'Next stay interview due date (auto-synced from stay_interviews). Separate from performance next_review_date.';

-- Backfill from current next_review_date where employees have stay interviews.
update public.employees e
   set next_stay_interview_date = e.next_review_date
 where e.next_stay_interview_date is null
   and e.next_review_date is not null
   and exists (
     select 1
       from public.stay_interviews si
      where si.employee_id::text = e.id::text
   );

create or replace function public.orbis_sync_employee_next_stay_interview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_employee_id text;
  latest_interview date;
  next_due date;
begin
  if tg_op = 'DELETE' then
    target_employee_id := old.employee_id::text;
  else
    target_employee_id := new.employee_id::text;
  end if;

  if target_employee_id is null or btrim(target_employee_id) = '' then
    return coalesce(new, old);
  end if;

  select max(si.interview_date::date)
    into latest_interview
    from public.stay_interviews si
   where si.employee_id::text = target_employee_id
     and si.interview_date is not null;

  next_due := public.orbis_compute_next_stay_interview(latest_interview);

  update public.employees e
     set next_stay_interview_date = next_due
   where e.id::text = target_employee_id;

  return coalesce(new, old);
end;
$$;

comment on function public.orbis_sync_employee_next_stay_interview() is
  'Keeps employees.next_stay_interview_date in sync; does not touch next_review_date.';

drop trigger if exists orbis_stay_interviews_sync_next_review on public.stay_interviews;

create trigger orbis_stay_interviews_sync_next_stay
  after insert or update of employee_id, interview_date or delete
  on public.stay_interviews
  for each row
  execute function public.orbis_sync_employee_next_stay_interview();

-- Recompute for all employees that already have stay interviews.
do $$
declare
  emp record;
  latest_interview date;
  next_due date;
begin
  for emp in
    select distinct employee_id::text as employee_id
      from public.stay_interviews
     where employee_id is not null
  loop
    select max(si.interview_date::date)
      into latest_interview
      from public.stay_interviews si
     where si.employee_id::text = emp.employee_id
       and si.interview_date is not null;

    next_due := public.orbis_compute_next_stay_interview(latest_interview);

    update public.employees e
       set next_stay_interview_date = next_due
     where e.id::text = emp.employee_id;
  end loop;
end $$;
