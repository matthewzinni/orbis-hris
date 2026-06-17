-- Attendance: org-wide for HR leadership only; filtered admins see direct reports (like supervisors).
-- btw-instance-config: leadership emails in orbis_has_org_wide_attendance_access; externalize via orbis_instance_settings (future).

create or replace function public.orbis_has_org_wide_attendance_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(public.orbis_auth_email())) in (
    'matthew.zinni@btwglobal.com',
    'trent.wynne@btwglobal.com',
    'brent.wynne@btwglobal.com'
  );
$$;

-- Team-scoped attendance save/read (supervisors + admins who are not org-wide leaders).
create or replace function public.orbis_uses_team_scoped_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.orbis_is_supervisor() or public.orbis_is_admin())
    and not public.orbis_has_org_wide_attendance_access();
$$;

create or replace function public.orbis_attendance_employee_accessible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.id::text = emp_key
      and (
        public.orbis_has_org_wide_attendance_access()
        or public.orbis_supervisor_sees_employee(e)
      )
  );
$$;

create or replace function public.orbis_filter_attendance_people(people jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(elem order by coalesce(elem->>'name', '')),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(people, '[]'::jsonb)) as elem
  where public.orbis_has_org_wide_attendance_access()
    or public.orbis_attendance_employee_accessible(public.orbis_attendance_person_employee_id(elem));
$$;

create or replace function public.orbis_attendance_people_allowed(people jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from jsonb_array_elements(coalesce(people, '[]'::jsonb)) as elem
    where public.orbis_attendance_person_employee_id(elem) is not null
      and not public.orbis_attendance_employee_accessible(public.orbis_attendance_person_employee_id(elem))
  );
$$;

create or replace function public.orbis_strip_supervisor_team_from_attendance(people jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(elem order by coalesce(elem->>'name', '')),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(people, '[]'::jsonb)) as elem
  where public.orbis_has_org_wide_attendance_access()
    or not public.orbis_attendance_employee_accessible(public.orbis_attendance_person_employee_id(elem));
$$;

create or replace function public.orbis_get_attendance_snapshot(p_date date)
returns table (
  attendance_date date,
  present jsonb,
  absent jsonb,
  timezone text,
  source text,
  updated_by text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.orbis_is_admin() or public.orbis_is_supervisor()) then
    return;
  end if;

  return query
  select
    s.attendance_date,
    case
      when public.orbis_has_org_wide_attendance_access() then s.present
      else public.orbis_filter_attendance_people(s.present)
    end,
    case
      when public.orbis_has_org_wide_attendance_access() then s.absent
      else public.orbis_filter_attendance_people(s.absent)
    end,
    s.timezone,
    s.source,
    s.updated_by,
    s.updated_at
  from public.attendance_manual_snapshots s
  where s.attendance_date = p_date;
end;
$$;

create or replace function public.orbis_save_attendance_snapshot(
  p_date date,
  p_present jsonb,
  p_absent jsonb,
  p_timezone text default null,
  p_source text default 'Manual'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.attendance_manual_snapshots%rowtype;
  merged_present jsonb;
  merged_absent jsonb;
  actor text;
begin
  if not (public.orbis_is_admin() or public.orbis_is_supervisor()) then
    raise exception 'Forbidden';
  end if;

  if public.orbis_uses_team_scoped_attendance() then
    if not public.orbis_attendance_people_allowed(p_present)
       or not public.orbis_attendance_people_allowed(p_absent) then
      raise exception 'Attendance save includes employees outside your team';
    end if;
  end if;

  select *
  into existing
  from public.attendance_manual_snapshots
  where attendance_date = p_date;

  actor := coalesce(
    nullif(trim(public.orbis_auth_email()), ''),
    nullif(trim(auth.jwt() ->> 'email'), ''),
    auth.uid()::text
  );

  if public.orbis_has_org_wide_attendance_access() then
    merged_present := coalesce(p_present, '[]'::jsonb);
    merged_absent := coalesce(p_absent, '[]'::jsonb);
  else
    merged_present := public.orbis_concat_attendance_people(
      public.orbis_strip_supervisor_team_from_attendance(coalesce(existing.present, '[]'::jsonb)),
      coalesce(p_present, '[]'::jsonb)
    );
    merged_absent := public.orbis_concat_attendance_people(
      public.orbis_strip_supervisor_team_from_attendance(coalesce(existing.absent, '[]'::jsonb)),
      coalesce(p_absent, '[]'::jsonb)
    );
  end if;

  insert into public.attendance_manual_snapshots (
    attendance_date,
    present,
    absent,
    timezone,
    source,
    updated_by,
    updated_at
  )
  values (
    p_date,
    merged_present,
    merged_absent,
    p_timezone,
    coalesce(nullif(trim(p_source), ''), 'Manual'),
    actor,
    now()
  )
  on conflict (attendance_date) do update
  set
    present = excluded.present,
    absent = excluded.absent,
    timezone = excluded.timezone,
    source = excluded.source,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.orbis_list_attendance_snapshots(
  p_from date,
  p_to date
)
returns table (
  attendance_date date,
  present jsonb,
  absent jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.orbis_is_admin() or public.orbis_is_supervisor()) then
    return;
  end if;

  return query
  select
    s.attendance_date,
    case
      when public.orbis_has_org_wide_attendance_access() then s.present
      else public.orbis_filter_attendance_people(s.present)
    end,
    case
      when public.orbis_has_org_wide_attendance_access() then s.absent
      else public.orbis_filter_attendance_people(s.absent)
    end
  from public.attendance_manual_snapshots s
  where s.attendance_date between p_from and p_to
  order by s.attendance_date desc;
end;
$$;

grant execute on function public.orbis_has_org_wide_attendance_access() to authenticated;
grant execute on function public.orbis_uses_team_scoped_attendance() to authenticated;
grant execute on function public.orbis_attendance_employee_accessible(text) to authenticated;
