-- Leadership Academy enrollment administration and progress reset.

create or replace function public.leadership_recalculate_progress(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.leadership_enrollments%rowtype;
  v_course record;
  v_required int;
  v_completed int;
  v_percent numeric(5, 2);
  v_total_required int;
  v_total_completed int;
begin
  if not public.leadership_enrollment_is_writable(p_enrollment_id) then
    raise exception 'Not authorized to update this enrollment';
  end if;

  select * into v_enrollment
  from public.leadership_enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Leadership enrollment not found';
  end if;

  if v_enrollment.tier_id is not null then
    insert into public.leadership_course_assignments (
      enrollment_id, course_id, assigned_by_email, due_date
    )
    select
      v_enrollment.id,
      c.id,
      coalesce(v_enrollment.enrolled_by_email, public.orbis_auth_email()),
      case
        when c.due_rule_days is null then v_enrollment.due_date
        else (v_enrollment.assigned_at::date + c.due_rule_days)
      end
    from public.leadership_courses c
    where c.tier_id = v_enrollment.tier_id
      and c.status <> 'archived'
    on conflict (enrollment_id, course_id) do nothing;
  end if;

  for v_course in
    select ca.id assignment_id, ca.course_id
    from public.leadership_course_assignments ca
    where ca.enrollment_id = p_enrollment_id
      and ca.status not in ('paused', 'withdrawn')
  loop
    select
      count(*) filter (where m.is_required),
      count(*) filter (where m.is_required and mp.status = 'completed')
    into v_required, v_completed
    from public.leadership_modules m
    left join public.leadership_module_progress mp
      on mp.module_id = m.id
      and mp.enrollment_id = p_enrollment_id
    where m.course_id = v_course.course_id;

    v_percent := case
      when v_required = 0 then 0
      else round((v_completed::numeric / v_required::numeric) * 100, 2)
    end;

    update public.leadership_course_assignments
    set completion_percent = v_percent,
        status = case
          when v_percent = 100 then 'completed'
          when v_percent > 0 then 'in_progress'
          when due_date < current_date then 'overdue'
          else 'not_started'
        end,
        completed_at = case when v_percent = 100 then coalesce(completed_at, now()) else null end,
        updated_at = now()
    where id = v_course.assignment_id;
  end loop;

  select
    count(*) filter (where m.is_required),
    count(*) filter (where m.is_required and mp.status = 'completed')
  into v_total_required, v_total_completed
  from public.leadership_course_assignments ca
  join public.leadership_modules m on m.course_id = ca.course_id
  left join public.leadership_module_progress mp
    on mp.module_id = m.id
    and mp.enrollment_id = p_enrollment_id
  where ca.enrollment_id = p_enrollment_id
    and ca.status <> 'withdrawn';

  v_percent := case
    when v_total_required = 0 then 0
    else round((v_total_completed::numeric / v_total_required::numeric) * 100, 2)
  end;

  update public.leadership_enrollments
  set completion_percent = v_percent,
      status = case
        when v_percent = 100 then 'completed'
        when v_percent > 0 then 'in_progress'
        when due_date < current_date then 'overdue'
        else 'not_started'
      end,
      completed_at = case when v_percent = 100 then coalesce(completed_at, now()) else null end
  where id = p_enrollment_id;
end;
$$;

create or replace function public.create_leadership_enrollment(
  p_employee_id text,
  p_tier_id uuid default null,
  p_course_id uuid default null,
  p_due_date date default null,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
  v_course public.leadership_courses%rowtype;
begin
  if not public.orbis_can_manage_leadership_academy() then
    raise exception 'Only Leadership Academy administrators may enroll participants';
  end if;

  if nullif(btrim(coalesce(p_employee_id, '')), '') is null then
    raise exception 'Employee is required';
  end if;

  if (p_tier_id is null and p_course_id is null)
    or (p_tier_id is not null and p_course_id is not null) then
    raise exception 'Choose either one program tier or one individual course';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id::text = p_employee_id
      and lower(coalesce(e.status, 'active')) not in ('terminated', 'inactive')
  ) then
    raise exception 'Employee is not active or does not exist';
  end if;

  if p_tier_id is not null then
    if not exists (
      select 1 from public.leadership_program_tiers t
      where t.id = p_tier_id and t.status = 'active'
    ) then
      raise exception 'Program tier is not active';
    end if;

    if exists (
      select 1 from public.leadership_enrollments e
      where e.employee_id = p_employee_id
        and e.tier_id = p_tier_id
        and e.status <> 'withdrawn'
    ) then
      raise exception 'Employee is already enrolled in this program tier';
    end if;
  else
    select * into v_course
    from public.leadership_courses c
    where c.id = p_course_id and c.status <> 'archived';

    if not found then
      raise exception 'Course is unavailable';
    end if;

    if exists (
      select 1
      from public.leadership_enrollments e
      join public.leadership_course_assignments ca on ca.enrollment_id = e.id
      where e.employee_id = p_employee_id
        and ca.course_id = p_course_id
        and e.status <> 'withdrawn'
    ) then
      raise exception 'Employee is already assigned to this course';
    end if;
  end if;

  insert into public.leadership_enrollments (
    employee_id,
    tier_id,
    enrolled_by_email,
    due_date,
    notes
  )
  values (
    p_employee_id,
    p_tier_id,
    public.orbis_auth_email(),
    p_due_date,
    coalesce(p_notes, '')
  )
  returning id into v_enrollment_id;

  if p_course_id is not null then
    insert into public.leadership_course_assignments (
      enrollment_id,
      course_id,
      assigned_by_email,
      due_date
    )
    values (
      v_enrollment_id,
      p_course_id,
      public.orbis_auth_email(),
      coalesce(
        p_due_date,
        case
          when v_course.due_rule_days is null then null
          else current_date + v_course.due_rule_days
        end
      )
    );
  end if;

  perform public.leadership_recalculate_progress(v_enrollment_id);

  insert into public.leadership_audit_events (
    entity_type,
    entity_id,
    employee_id,
    action_type,
    new_value,
    note,
    actor_email
  )
  values (
    'enrollment',
    v_enrollment_id,
    p_employee_id,
    'created',
    case
      when p_tier_id is not null then 'tier:' || p_tier_id::text
      else 'course:' || p_course_id::text
    end,
    nullif(btrim(coalesce(p_notes, '')), ''),
    public.orbis_auth_email()
  );

  return v_enrollment_id;
end;
$$;

create or replace function public.reset_leadership_enrollment_progress(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id text;
begin
  if not public.orbis_can_manage_leadership_academy() then
    raise exception 'Only Leadership Academy administrators may reset progress';
  end if;

  select employee_id into v_employee_id
  from public.leadership_enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Leadership enrollment not found';
  end if;

  delete from public.leadership_quiz_attempts
  where enrollment_id = p_enrollment_id;

  delete from public.leadership_module_submissions
  where enrollment_id = p_enrollment_id;

  delete from public.leadership_module_progress
  where enrollment_id = p_enrollment_id;

  update public.leadership_course_assignments
  set status = 'not_started',
      completion_percent = 0,
      completed_at = null,
      updated_at = now()
  where enrollment_id = p_enrollment_id;

  update public.leadership_enrollments
  set status = case when due_date < current_date then 'overdue' else 'not_started' end,
      completion_percent = 0,
      completed_at = null
  where id = p_enrollment_id;

  insert into public.leadership_audit_events (
    entity_type,
    entity_id,
    employee_id,
    action_type,
    old_value,
    new_value,
    actor_email
  )
  values (
    'enrollment',
    p_enrollment_id,
    v_employee_id,
    'progress_reset',
    'existing participant progress',
    '0%',
    public.orbis_auth_email()
  );
end;
$$;

create or replace function public.update_leadership_enrollment_admin(
  p_enrollment_id uuid,
  p_status text,
  p_due_date date default null,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id text;
  v_old_status text;
begin
  if not public.orbis_can_manage_leadership_academy() then
    raise exception 'Only Leadership Academy administrators may update enrollments';
  end if;

  if p_status not in (
    'not_started', 'in_progress', 'completed', 'overdue', 'paused', 'withdrawn'
  ) then
    raise exception 'Invalid enrollment status';
  end if;

  select employee_id, status into v_employee_id, v_old_status
  from public.leadership_enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Leadership enrollment not found';
  end if;

  update public.leadership_enrollments
  set status = p_status,
      due_date = p_due_date,
      notes = coalesce(p_notes, ''),
      completed_at = case
        when p_status = 'completed' then coalesce(completed_at, now())
        else null
      end
  where id = p_enrollment_id;

  update public.leadership_course_assignments
  set due_date = coalesce(p_due_date, due_date),
      status = case
        when p_status in ('paused', 'withdrawn') then p_status
        when completion_percent = 100 then 'completed'
        when completion_percent > 0 then 'in_progress'
        when coalesce(p_due_date, due_date) < current_date then 'overdue'
        else 'not_started'
      end,
      updated_at = now()
  where enrollment_id = p_enrollment_id;

  if p_status not in ('paused', 'withdrawn') then
    perform public.leadership_recalculate_progress(p_enrollment_id);
  end if;

  insert into public.leadership_audit_events (
    entity_type,
    entity_id,
    employee_id,
    action_type,
    field_name,
    old_value,
    new_value,
    actor_email
  )
  values (
    'enrollment',
    p_enrollment_id,
    v_employee_id,
    'updated',
    'status',
    v_old_status,
    p_status,
    public.orbis_auth_email()
  );
end;
$$;

revoke all on function public.create_leadership_enrollment(text, uuid, uuid, date, text)
  from public, anon;
revoke all on function public.reset_leadership_enrollment_progress(uuid)
  from public, anon;
revoke all on function public.update_leadership_enrollment_admin(uuid, text, date, text)
  from public, anon;

grant execute on function public.create_leadership_enrollment(text, uuid, uuid, date, text)
  to authenticated;
grant execute on function public.reset_leadership_enrollment_progress(uuid)
  to authenticated;
grant execute on function public.update_leadership_enrollment_admin(uuid, text, date, text)
  to authenticated;
