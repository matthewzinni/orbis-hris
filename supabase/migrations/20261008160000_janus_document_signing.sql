-- Editable publisher documents and scoped, single-recipient signing links.
create table public.janus_signing_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.janus_accounts(id),
  content jsonb not null,
  signer_name text not null,
  signer_email text not null,
  allow_recipient_edits boolean not null default true,
  status text not null default 'draft' check (status in ('draft','pending','signed')),
  signed_content jsonb,
  signature text,
  signed_name text,
  signed_at timestamptz,
  signed_hash text,
  signer_user_agent text,
  created_by text not null default coalesce(auth.jwt()->>'email',''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index janus_signing_documents_account_idx on public.janus_signing_documents(account_id, created_at desc);
create table public.janus_document_signing_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.janus_signing_documents(id),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','signed','cancelled')),
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create unique index janus_document_one_pending_link on public.janus_document_signing_links(document_id) where status='pending';
alter table public.janus_signing_documents enable row level security;
alter table public.janus_document_signing_links enable row level security;
revoke all on public.janus_signing_documents, public.janus_document_signing_links from anon, authenticated;
grant select on public.janus_signing_documents, public.janus_document_signing_links to authenticated;
grant all on public.janus_signing_documents, public.janus_document_signing_links to service_role;
create policy janus_signing_documents_read on public.janus_signing_documents for select to authenticated using (public.orbis_can_read_janus());
create policy janus_signing_links_read on public.janus_document_signing_links for select to authenticated using (public.orbis_can_write_janus());

create function public.orbis_valid_signing_content(p_content jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
 select coalesce(jsonb_typeof(p_content)='object'
   and jsonb_typeof(p_content->'title')='string' and length(btrim(p_content->>'title')) between 1 and 200
   and jsonb_typeof(p_content->'body')='string' and length(btrim(p_content->>'body')) between 1 and 100000
   and jsonb_typeof(p_content->'letterhead_name')='string'
   and jsonb_typeof(p_content->'letterhead_details')='string'
   and jsonb_typeof(p_content->'logo')='string'
   and length(coalesce(p_content->>'letterhead_name','')) <= 200
   and length(coalesce(p_content->>'letterhead_details','')) <= 2000
   and length(coalesce(p_content->>'logo','')) <= 700000
   and (coalesce(p_content->>'logo','')='' or p_content->>'logo' ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'), false);
$$;

create function public.orbis_save_signing_document(p_account_id uuid, p_content jsonb, p_signer_name text, p_signer_email text, p_allow_edits boolean, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result_id uuid;
begin
 if not coalesce(public.orbis_can_write_janus(),false) then raise exception 'Janus edit access required' using errcode='42501'; end if;
 if not public.orbis_valid_signing_content(p_content) or length(btrim(p_signer_name)) not between 2 and 200
   or length(p_signer_email)>254 or p_signer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a document title, content, signer name and valid email'; end if;
 if p_id is null then
   insert into public.janus_signing_documents(account_id,content,signer_name,signer_email,allow_recipient_edits)
   values(p_account_id,p_content,btrim(p_signer_name),lower(btrim(p_signer_email)),p_allow_edits) returning id into result_id;
 else
   update public.janus_signing_documents set content=p_content,signer_name=btrim(p_signer_name),signer_email=lower(btrim(p_signer_email)),allow_recipient_edits=p_allow_edits,updated_at=now()
   where id=p_id and account_id=p_account_id and status='draft' returning id into result_id;
   if result_id is null then raise exception 'Only draft documents can be edited. Cancel the active signing link first.'; end if;
 end if;
 return result_id;
end;
$$;

create function public.orbis_issue_document_signing_link(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare doc public.janus_signing_documents%rowtype; link public.janus_document_signing_links%rowtype;
begin
 if not coalesce(public.orbis_can_write_janus(),false) then raise exception 'Janus edit access required' using errcode='42501'; end if;
 select * into doc from public.janus_signing_documents where id=p_id for update;
 if not found or doc.status='signed' then raise exception 'Document unavailable or already signed'; end if;
 select * into link from public.janus_document_signing_links where document_id=p_id and status='pending' for update;
 if found and link.expires_at>now() then return jsonb_build_object('token',link.token,'expiresAt',link.expires_at); end if;
 update public.janus_document_signing_links set status='cancelled' where document_id=p_id and status='pending';
 insert into public.janus_document_signing_links(document_id) values(p_id) returning * into link;
 update public.janus_signing_documents set status='pending',updated_at=now() where id=p_id;
 return jsonb_build_object('token',link.token,'expiresAt',link.expires_at);
end;
$$;

create function public.orbis_cancel_document_signing_link(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if not coalesce(public.orbis_can_write_janus(),false) then raise exception 'Janus edit access required' using errcode='42501'; end if;
 perform id from public.janus_signing_documents where id=p_id and status<>'signed' for update;
 if not found then raise exception 'Signed documents cannot be changed'; end if;
 update public.janus_document_signing_links set status='cancelled' where document_id=p_id and status='pending';
 update public.janus_signing_documents set status='draft',updated_at=now() where id=p_id;
end;
$$;

create function public.orbis_complete_document_signing(p_token uuid, p_content jsonb, p_signature text, p_name text, p_hash text, p_user_agent text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare link public.janus_document_signing_links%rowtype; doc public.janus_signing_documents%rowtype;
begin
 -- Document-before-link locks also serialize cancellation and link issuance.
 select d.* into doc from public.janus_signing_documents d join public.janus_document_signing_links l on l.document_id=d.id where l.token=p_token for update of d;
 if not found then return jsonb_build_object('status','invalid'); end if;
 select * into link from public.janus_document_signing_links where token=p_token for update;
 if link.status<>'pending' or doc.status<>'pending' then return jsonb_build_object('status','unavailable'); end if;
 if link.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if not public.orbis_valid_signing_content(p_content) or length(btrim(p_name)) not between 2 and 200
    or length(p_signature)>700000 or p_signature !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'
    or p_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid'); end if;
 if not doc.allow_recipient_edits and doc.content<>p_content then return jsonb_build_object('status','edits_disallowed'); end if;
 update public.janus_signing_documents set status='signed',signed_content=p_content,signature=p_signature,signed_name=btrim(p_name),signed_at=now(),signed_hash=p_hash,signer_user_agent=left(p_user_agent,1000),updated_at=now() where id=doc.id;
 update public.janus_document_signing_links set status='signed' where id=link.id;
 return jsonb_build_object('status','signed','id',doc.id);
end;
$$;
revoke all on function public.orbis_valid_signing_content(jsonb) from public,anon,authenticated;
revoke all on function public.orbis_save_signing_document(uuid,jsonb,text,text,boolean,uuid), public.orbis_issue_document_signing_link(uuid), public.orbis_cancel_document_signing_link(uuid), public.orbis_complete_document_signing(uuid,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.orbis_save_signing_document(uuid,jsonb,text,text,boolean,uuid), public.orbis_issue_document_signing_link(uuid), public.orbis_cancel_document_signing_link(uuid) to authenticated;
grant execute on function public.orbis_complete_document_signing(uuid,jsonb,text,text,text,text) to service_role;
