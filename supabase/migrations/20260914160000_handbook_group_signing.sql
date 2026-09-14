-- One HR-issued link for the current handbook, with name-only matching on submission.
create table public.handbook_group_links (
  id text primary key check (id = 'employee-handbook'),
  token uuid not null unique default gen_random_uuid(),
  document_title text not null default 'Employee Handbook Acknowledgement',
  acknowledgment_text text not null default 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook. I understand that the handbook is not a contract of employment and that policies may change at any time.',
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now()
);
alter table public.handbook_group_links enable row level security;
revoke all on public.handbook_group_links from anon, authenticated;
grant all on public.handbook_group_links to service_role;

alter table public.handbook_acknowledgment_forms add column signing_method text not null default 'individual_link'
  check (signing_method in ('individual_link', 'shared_link_name_match'));

create function public.orbis_create_handbook_group_link() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare link_row public.handbook_group_links%rowtype;
begin
  if not coalesce(public.orbis_is_admin(), false) then
    raise exception 'Only HR administrators can create group signing links' using errcode = '42501';
  end if;
  insert into public.handbook_group_links(id) values ('employee-handbook')
  on conflict (id) do update set
    token = case when handbook_group_links.expires_at <= now() then gen_random_uuid() else handbook_group_links.token end,
    expires_at = case when handbook_group_links.expires_at <= now() then now() + interval '90 days' else handbook_group_links.expires_at end
  returning * into link_row;
  return jsonb_build_object('token', link_row.token, 'expiresAt', link_row.expires_at);
end;
$$;
revoke all on function public.orbis_create_handbook_group_link() from public, anon;
grant execute on function public.orbis_create_handbook_group_link() to authenticated;

create function public.orbis_handbook_normalize_name(value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select lower(btrim(regexp_replace(coalesce(value, ''), '[[:space:]]+', ' ', 'g')));
$$;

create function public.orbis_complete_handbook_group_signature(
  p_token text, p_first_name text, p_last_name text, p_signature text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  link_row public.handbook_group_links%rowtype;
  employee_row public.employees%rowtype;
  form_row public.handbook_acknowledgment_forms%rowtype;
  match_ids text[];
  signer_name_value text;
begin
  select * into link_row from public.handbook_group_links
  where token::text = btrim(p_token) and expires_at > now() for share;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if length(public.orbis_handbook_normalize_name(p_first_name)) not between 1 and 100
     or length(public.orbis_handbook_normalize_name(p_last_name)) not between 1 and 100 then
    return jsonb_build_object('status', 'unmatched');
  end if;
  if p_signature is null or length(p_signature) > 2000000
     or p_signature !~* '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$' then
    return jsonb_build_object('status', 'invalid_signature');
  end if;

  -- No fuzzy matching, roster suggestions, or public employee identifiers.
  select array_agg(id) into match_ids from public.employees
  where public.orbis_handbook_normalize_name(first_name) = public.orbis_handbook_normalize_name(p_first_name)
    and public.orbis_handbook_normalize_name(last_name) = public.orbis_handbook_normalize_name(p_last_name)
    and upper(btrim(coalesce(status, ''))) not in ('TERMINATED', 'INACTIVE', 'ARCHIVED');
  if coalesce(cardinality(match_ids), 0) <> 1 then
    return jsonb_build_object('status', 'unmatched');
  end if;
  select * into employee_row from public.employees where id = match_ids[1] for update;
  if not found or upper(btrim(coalesce(employee_row.status, ''))) in ('TERMINATED', 'INACTIVE', 'ARCHIVED')
     or public.orbis_handbook_normalize_name(employee_row.first_name) <> public.orbis_handbook_normalize_name(p_first_name)
     or public.orbis_handbook_normalize_name(employee_row.last_name) <> public.orbis_handbook_normalize_name(p_last_name) then
    return jsonb_build_object('status', 'unmatched');
  end if;

  -- Match the individual signing path's request-before-form lock order.
  perform id from public.signature_requests
    where employee_id = employee_row.id and form_type = 'handbook' and status = 'pending'
    order by id for update;
  select * into form_row from public.handbook_acknowledgment_forms
    where employee_id = employee_row.id order by created_at desc limit 1 for update;
  if found and form_row.signed_at is not null then
    -- Idempotent public response without disclosing an employee's signing history.
    return jsonb_build_object('status', 'signed');
  end if;
  if form_row.id is not null and form_row.acknowledgment_text <> link_row.acknowledgment_text then
    return jsonb_build_object('status', 'unmatched');
  end if;
  if form_row.id is null then
    insert into public.handbook_acknowledgment_forms(employee_id, employee_name, document_title, acknowledgment_text)
    values (employee_row.id, concat_ws(' ', employee_row.first_name, employee_row.last_name),
      link_row.document_title, link_row.acknowledgment_text) returning * into form_row;
  end if;
  signer_name_value := btrim(regexp_replace(p_first_name || ' ' || p_last_name, '[[:space:]]+', ' ', 'g'));
  update public.handbook_acknowledgment_forms
    set employee_signature = p_signature, signer_name = signer_name_value, signed_at = now(),
        signing_method = 'shared_link_name_match'
    where id = form_row.id;
  insert into public.employee_acknowledgments(employee_id, acknowledgment_type, document_title, notes, acknowledged_at)
    values (employee_row.id, 'handbook', form_row.document_title,
      'Shared link; matched by first and last name. Record: ' || form_row.id::text, now())
    on conflict do nothing;
  update public.signature_requests set status = 'signed', signed_at = now(),
    signature_data = p_signature, signer_name = signer_name_value
    where form_type = 'handbook' and record_id = form_row.id::text
      and employee_id = employee_row.id and status = 'pending' and signer_role = 'employee';
  if not found then
    insert into public.signature_requests(form_type, record_id, employee_id, signer_role, signer_name, status, signature_data, signed_at)
    values ('handbook', form_row.id::text, employee_row.id, 'employee', signer_name_value, 'signed', p_signature, now());
  end if;
  return jsonb_build_object('status', 'signed');
end;
$$;
revoke all on function public.orbis_complete_handbook_group_signature(text, text, text, text) from public, anon, authenticated;
grant execute on function public.orbis_complete_handbook_group_signature(text, text, text, text) to service_role;
