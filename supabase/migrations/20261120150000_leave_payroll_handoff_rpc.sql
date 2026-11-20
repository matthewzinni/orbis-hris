-- Log the payroll handoff for an approved leave request server-side, so supervisors can do it.
--
-- payroll_handoffs is admin-only under RLS, so when a supervisor approved a direct report's
-- leave, the browser insert failed after the approval had already saved and payroll was never
-- told. These functions let anyone who may approve a leave request (the same rule as the
-- leave_requests update policy: an admin, or a supervisor who can see the employee) log that
-- request's handoff -- and nothing else. payroll_handoffs RLS stays admin-only.
--
-- The client calls orbis_log_leave_payroll_handoff after approving, then asks the
-- notify-payroll-change Edge Function to email payroll. That function lets a non-admin caller
-- through only for a leave handoff they can approve (orbis_can_approve_leave_request).

create or replace function public.orbis_can_approve_leave_request(p_leave_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leave_requests lr
    where lr.id = p_leave_request_id
      and (
        public.orbis_is_admin()
        or (
          public.orbis_is_supervisor()
          and public.orbis_employee_child_accessible(lr.employee_id::text)
        )
      )
  );
$$;

-- Returns the new handoff's id, or null when this leave request was already logged for payroll
-- (so the caller never asks for a second email). Safe to call twice: the leave row is locked and
-- payroll_notified is set in the same transaction as the insert.
create or replace function public.orbis_log_leave_payroll_handoff(p_leave_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leave public.leave_requests%rowtype;
  v_existing uuid;
  v_handoff_id uuid;
  v_name text;
  v_type_label text;
  v_dates text;
begin
  if not public.orbis_can_approve_leave_request(p_leave_request_id) then
    raise exception 'You can only log payroll for time off you can approve.'
      using errcode = '42501';
  end if;

  select * into v_leave
  from public.leave_requests
  where id = p_leave_request_id
  for update;

  if not found then
    raise exception 'Leave request not found.' using errcode = 'P0002';
  end if;

  if v_leave.status <> 'approved' then
    raise exception 'Only approved time off is logged for payroll.' using errcode = '22023';
  end if;

  if v_leave.payroll_notified then
    return null;
  end if;

  select ph.id into v_existing
  from public.payroll_handoffs ph
  where ph.payload ->> 'leave_request_id' = v_leave.id::text
  limit 1;

  if v_existing is null then
    select nullif(trim(concat_ws(' ', e.first_name, e.last_name)), '')
      into v_name
    from public.employees e
    where e.id::text = v_leave.employee_id::text
    limit 1;

    v_type_label := case lower(coalesce(v_leave.leave_type, ''))
      when 'pto' then 'PTO'
      when 'sick' then 'Sick'
      when 'bereavement' then 'Bereavement'
      when 'fmla' then 'FMLA'
      when 'unpaid' then 'Unpaid'
      when 'other' then 'Other'
      else coalesce(nullif(v_leave.leave_type, ''), 'Leave')
    end;

    v_dates := case
      when v_leave.end_date is null or v_leave.end_date = v_leave.start_date
        then v_leave.start_date::text
      else v_leave.start_date::text || ' → ' || v_leave.end_date::text
    end;

    insert into public.payroll_handoffs (
      employee_id,
      change_type,
      effective_date,
      summary,
      payload,
      status,
      created_by
    )
    values (
      v_leave.employee_id,
      'status',
      v_leave.start_date,
      format(
        'Leave approved (%s) — %s · %s',
        v_type_label,
        coalesce(v_name, v_leave.employee_id),
        v_dates
      ),
      jsonb_build_object(
        'leave_request_id', v_leave.id::text,
        'leave_type', v_leave.leave_type,
        'start_date', v_leave.start_date::text,
        'end_date', v_leave.end_date::text
      ),
      'pending',
      nullif(public.orbis_auth_email(), '')
    )
    returning id into v_handoff_id;
  end if;

  update public.leave_requests
  set payroll_notified = true
  where id = v_leave.id;

  return v_handoff_id;
end;
$$;

revoke all on function public.orbis_can_approve_leave_request(uuid) from public, anon;
revoke all on function public.orbis_log_leave_payroll_handoff(uuid) from public, anon;
grant execute on function public.orbis_can_approve_leave_request(uuid) to authenticated;
grant execute on function public.orbis_log_leave_payroll_handoff(uuid) to authenticated;
