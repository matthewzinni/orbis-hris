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

  if request_row.form_type = 'discipline' then
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

  form_updated := found;
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
