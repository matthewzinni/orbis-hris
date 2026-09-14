-- Preserve the exact acknowledgment issued for signing, independently of portal checkboxes.
create table public.handbook_acknowledgment_forms (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  employee_name text not null,
  document_title text not null default 'Employee Handbook Acknowledgement',
  acknowledgment_text text not null default 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook. I understand that the handbook is not a contract of employment and that policies may change at any time.',
  employee_signature text,
  signer_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint handbook_signature_complete check (
    (signed_at is null and employee_signature is null and signer_name is null)
    or (signed_at is not null and employee_signature is not null and signer_name is not null)
  )
);
create index handbook_acknowledgment_employee_idx on public.handbook_acknowledgment_forms(employee_id);
alter table public.handbook_acknowledgment_forms enable row level security;
revoke all on public.handbook_acknowledgment_forms from anon, authenticated;
grant select on public.handbook_acknowledgment_forms to authenticated;
grant all on public.handbook_acknowledgment_forms to service_role;
create policy handbook_acknowledgment_select on public.handbook_acknowledgment_forms for select to authenticated
using (public.orbis_is_admin()
  or employee_id = public.orbis_linked_employee_id()
  or (public.orbis_is_supervisor() and public.orbis_employee_child_accessible(employee_id)));

alter table public.signature_requests drop constraint signature_requests_form_type_check;
alter table public.signature_requests add constraint signature_requests_form_type_check
check (form_type in ('discipline', 'incident', 'review', 'handbook'));

-- Existing signature policies are permissive; additionally scope handbook records.
create policy handbook_signature_scope on public.signature_requests as restrictive for all to authenticated
using (form_type <> 'handbook' or public.orbis_is_admin()
  or employee_id = public.orbis_linked_employee_id()
  or (public.orbis_is_supervisor() and public.orbis_employee_child_accessible(employee_id)))
with check (form_type <> 'handbook');

-- Client-created handbook requests must go through the validated, atomic RPC below.
create function public.orbis_guard_handbook_signature_request() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.form_type = 'handbook' then
      raise exception 'Use the handbook acknowledgement action to create signing requests';
    end if;
    if tg_op = 'UPDATE' and old.form_type = 'handbook' then
      raise exception 'Handbook signing requests cannot be changed directly';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_handbook_signature_request before insert or update on public.signature_requests
for each row execute function public.orbis_guard_handbook_signature_request();

create function public.orbis_create_handbook_signature_request(p_employee_id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  employee_name_value text;
  form_row public.handbook_acknowledgment_forms%rowtype;
  request_row public.signature_requests%rowtype;
begin
  if not coalesce(public.orbis_is_admin(), false) then
    raise exception 'Only HR administrators can request handbook signatures' using errcode = '42501';
  end if;
  -- Lock the employee to serialize duplicate clicks and requests from multiple tabs.
  select concat_ws(' ', first_name, last_name) into employee_name_value
  from public.employees where id::text = btrim(p_employee_id) for update;
  if not found then raise exception 'Employee not found'; end if;

  select * into form_row from public.handbook_acknowledgment_forms
  where employee_id = btrim(p_employee_id) order by created_at desc limit 1 for update;
  if found and form_row.signed_at is not null then
    raise exception 'This employee has already signed the handbook acknowledgement. Refresh status to view it.';
  end if;
  if form_row.id is null then
    insert into public.handbook_acknowledgment_forms(employee_id, employee_name)
    values (btrim(p_employee_id), employee_name_value) returning * into form_row;
  end if;

  select * into request_row from public.signature_requests
  where form_type = 'handbook' and record_id = form_row.id::text
    and employee_id = form_row.employee_id and signer_role = 'employee'
    and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if found then return jsonb_build_object('token', request_row.token, 'reused', true); end if;

  update public.signature_requests set status = 'expired'
  where form_type = 'handbook' and record_id = form_row.id::text and status = 'pending';
  insert into public.signature_requests(form_type, record_id, employee_id, signer_role, signer_name, created_by)
  values ('handbook', form_row.id::text, form_row.employee_id, 'employee', form_row.employee_name, auth.jwt()->>'email')
  returning * into request_row;
  return jsonb_build_object('token', request_row.token, 'reused', false);
end;
$$;
revoke all on function public.orbis_create_handbook_signature_request(text) from public, anon;
grant execute on function public.orbis_create_handbook_signature_request(text) to authenticated;

-- Complete a remote signature in one transaction so concurrent submissions cannot
-- overwrite a form signature or leave signature_requests out of sync.

create or replace function public.orbis_complete_signature_request(
  p_token text,
  p_signature text,
  p_signer_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_row public.signature_requests%rowtype;
  form_updated boolean := false;
  handbook_row public.handbook_acknowledgment_forms%rowtype;
begin
  select *
    into request_row
    from public.signature_requests
   where token::text = btrim(p_token)
   for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if request_row.status = 'signed' then
    return jsonb_build_object('status', 'already_signed');
  end if;

  if request_row.status <> 'pending' or request_row.expires_at <= now() then
    if request_row.status = 'pending' then
      update public.signature_requests
         set status = 'expired'
       where id = request_row.id;
    end if;
    return jsonb_build_object('status', 'expired');
  end if;

  if request_row.form_type = 'handbook' then
    if request_row.signer_role <> 'employee' then
      return jsonb_build_object('status', 'invalid');
    end if;
    update public.handbook_acknowledgment_forms
       set employee_signature = p_signature, signer_name = p_signer_name, signed_at = now()
     where id::text = request_row.record_id
       and employee_id = request_row.employee_id and signed_at is null
     returning * into handbook_row;
    if not found then return jsonb_build_object('status', 'form_not_found'); end if;
    insert into public.employee_acknowledgments
      (employee_id, acknowledgment_type, document_title, notes, acknowledged_at)
    values (handbook_row.employee_id, 'handbook', handbook_row.document_title,
      'Electronically signed. Record: ' || handbook_row.id::text, handbook_row.signed_at)
    on conflict do nothing;
    -- ON CONFLICT may report no insert; the locked form update still succeeded.
    form_updated := true;
  elsif request_row.form_type = 'discipline' then
    if request_row.signer_role = 'employee' then
      update public.discipline_reports
         set employee_signature = p_signature,
             refused_to_sign = false
       where id = request_row.record_id::bigint;
    elsif request_row.signer_role = 'manager' then
      update public.discipline_reports
         set manager_signature = p_signature
       where id = request_row.record_id::bigint;
    elsif request_row.signer_role = 'witness' then
      update public.discipline_reports
         set witness_signature = p_signature
       where id = request_row.record_id::bigint;
    end if;
  elsif request_row.form_type = 'incident' then
    if request_row.signer_role = 'employee' then
      update public.incident_reports
         set employee_signature = p_signature,
             refused_to_sign = false
       where id = request_row.record_id::uuid;
    elsif request_row.signer_role = 'manager' then
      update public.incident_reports
         set manager_signature = p_signature
       where id = request_row.record_id::uuid;
    elsif request_row.signer_role = 'witness' then
      update public.incident_reports
         set witness_signature = p_signature
       where id = request_row.record_id::uuid;
    end if;
  elsif request_row.form_type = 'review' then
    if request_row.signer_role = 'employee' then
      update public.employee_reviews
         set employee_signature = p_signature,
             refused_to_sign = false
       where id = request_row.record_id::uuid;
    elsif request_row.signer_role = 'manager' then
      update public.employee_reviews
         set manager_signature = p_signature
       where id = request_row.record_id::uuid;
    elsif request_row.signer_role = 'witness' then
      update public.employee_reviews
         set witness_signature = p_signature
       where id = request_row.record_id::uuid;
    end if;
  end if;

  if request_row.form_type <> 'handbook' then
    form_updated := found;
  end if;
  if not form_updated then
    return jsonb_build_object('status', 'form_not_found');
  end if;

  update public.signature_requests
     set status = 'signed',
         signature_data = p_signature,
         signer_name = p_signer_name,
         signed_at = now()
   where id = request_row.id;

  return jsonb_build_object('status', 'signed');
end;
$$;

revoke all on function public.orbis_complete_signature_request(text, text, text) from public;
revoke all on function public.orbis_complete_signature_request(text, text, text) from anon;
revoke all on function public.orbis_complete_signature_request(text, text, text) from authenticated;
grant execute on function public.orbis_complete_signature_request(text, text, text) to service_role;
