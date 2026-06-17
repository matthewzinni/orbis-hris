-- Week 2 security hardening: Care supervisor scope, signature requests, attendance RPCs, Janus approval gate.

-- ---------------------------------------------------------------------------
-- Care: supervisors only see direct-report employee rows (not company-wide).
-- ---------------------------------------------------------------------------

create or replace function public.orbis_care_confidential_record_visible(
  record_confidentiality text,
  care_employee_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(care_employee_id)
      and lower(trim(coalesce(record_confidentiality, 'hr_only'))) in ('standard', 'restricted')
    );
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'care_recognition',
    'care_follow_ups',
    'care_resources_shared',
    'care_wellness_check_ins'
  ]
  loop
    execute format('drop policy if exists orbis_%s_select on public.%I', tbl, tbl);
    execute format(
      $policy$
      create policy orbis_%1$s_select on public.%1$I
        for select
        to authenticated
        using (
          public.orbis_can_access_care_engagement()
          or (
            public.orbis_is_supervisor()
            and public.orbis_employee_child_accessible(employee_id)
          )
        )
      $policy$,
      tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Signature requests: supervisors scoped to direct reports.
-- ---------------------------------------------------------------------------

drop policy if exists signature_requests_select on public.signature_requests;
create policy signature_requests_select on public.signature_requests
  for select to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
    or (
      public.orbis_is_employee()
      and employee_id = public.orbis_linked_employee_id()
    )
  );

drop policy if exists signature_requests_insert on public.signature_requests;
create policy signature_requests_insert on public.signature_requests
  for insert to authenticated
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  );

drop policy if exists signature_requests_update on public.signature_requests;
create policy signature_requests_update on public.signature_requests
  for update to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  )
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Janus: require approved access for all read/write paths.
-- ---------------------------------------------------------------------------

create or replace function public.orbis_can_read_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and (
      public.orbis_is_admin()
      or public.orbis_access_role() in ('janus', 'janus_readonly')
      or public.orbis_has_janus_access()
    );
$$;

create or replace function public.orbis_can_write_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and (
      public.orbis_is_admin()
      or public.orbis_access_role() = 'janus'
      or public.orbis_has_janus_access()
    );
$$;

-- ---------------------------------------------------------------------------
-- Attendance snapshots: admin direct table access; supervisors via merge RPC.
-- ---------------------------------------------------------------------------

create or replace function public.orbis_attendance_person_employee_id(person jsonb)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      coalesce(person->>'employeeId', person->>'employee_id', person->>'id', person->>'employeeNumber')
    ),
    ''
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
  where public.orbis_is_admin()
    or public.orbis_employee_child_accessible(public.orbis_attendance_person_employee_id(elem));
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
      and not public.orbis_employee_child_accessible(public.orbis_attendance_person_employee_id(elem))
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
  where public.orbis_is_admin()
    or not public.orbis_employee_child_accessible(public.orbis_attendance_person_employee_id(elem));
$$;

create or replace function public.orbis_concat_attendance_people(base jsonb, extra jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(elem order by coalesce(elem->>'name', '')),
    '[]'::jsonb
  )
  from (
    select elem from jsonb_array_elements(coalesce(base, '[]'::jsonb)) as elem
    union all
    select elem from jsonb_array_elements(coalesce(extra, '[]'::jsonb)) as elem
  ) combined(elem);
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
    case when public.orbis_is_admin() then s.present else public.orbis_filter_attendance_people(s.present) end,
    case when public.orbis_is_admin() then s.absent else public.orbis_filter_attendance_people(s.absent) end,
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

  if public.orbis_is_supervisor() then
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

  if public.orbis_is_admin() then
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
    case when public.orbis_is_admin() then s.present else public.orbis_filter_attendance_people(s.present) end,
    case when public.orbis_is_admin() then s.absent else public.orbis_filter_attendance_people(s.absent) end
  from public.attendance_manual_snapshots s
  where s.attendance_date between p_from and p_to
  order by s.attendance_date desc;
end;
$$;

grant execute on function public.orbis_filter_attendance_people(jsonb) to authenticated;
grant execute on function public.orbis_get_attendance_snapshot(date) to authenticated;
grant execute on function public.orbis_save_attendance_snapshot(date, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.orbis_list_attendance_snapshots(date, date) to authenticated;

drop policy if exists attendance_manual_snapshots_select on public.attendance_manual_snapshots;
create policy attendance_manual_snapshots_select on public.attendance_manual_snapshots
  for select to authenticated
  using (public.orbis_is_admin());

drop policy if exists attendance_manual_snapshots_insert on public.attendance_manual_snapshots;
create policy attendance_manual_snapshots_insert on public.attendance_manual_snapshots
  for insert to authenticated
  with check (public.orbis_is_admin());

drop policy if exists attendance_manual_snapshots_update on public.attendance_manual_snapshots;
create policy attendance_manual_snapshots_update on public.attendance_manual_snapshots
  for update to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

notify pgrst, 'reload schema';
