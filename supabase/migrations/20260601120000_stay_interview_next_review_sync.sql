-- When stay interviews change, set employees.next_review_date to 6 months after the
-- latest interview_date (Saturday → Friday, Sunday → Monday).

create or replace function public.orbis_compute_next_stay_interview(last_interview date)
returns date
language sql
immutable
as $$
  select case
    when last_interview is null then null
    else (
      with raw as (
        select (last_interview + interval '6 months')::date as d
      ),
      adjusted as (
        select
          case extract(dow from d)::int
            when 6 then d - 1
            when 0 then d + 1
            else d
          end as d
        from raw
      )
      select d from adjusted
    )
  end;
$$;

comment on function public.orbis_compute_next_stay_interview(date) is
  'Next stay interview due date: +6 calendar months; Sat→Fri, Sun→Mon.';

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

drop trigger if exists orbis_stay_interviews_sync_next_review on public.stay_interviews;

create trigger orbis_stay_interviews_sync_next_review
  after insert or update of employee_id, interview_date or delete
  on public.stay_interviews
  for each row
  execute function public.orbis_sync_employee_next_stay_interview();
