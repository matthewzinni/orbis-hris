-- stay_interviews.employee_id and employees.id are text (e.g. BTW2519), not uuid.

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
     set next_review_date = next_due
   where e.id::text = target_employee_id;

  return coalesce(new, old);
end;
$$;
