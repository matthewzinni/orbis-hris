-- Standalone documents belong in Documents; accounts are no longer required.
-- Keep existing document IDs and signing links intact.
alter table public.janus_signing_documents alter column account_id drop not null;
alter table public.janus_signing_documents drop constraint janus_signing_documents_account_id_fkey;

drop policy janus_signing_documents_read on public.janus_signing_documents;
drop policy janus_signing_links_read on public.janus_document_signing_links;
create policy signing_documents_admin_read on public.janus_signing_documents for select to authenticated using (public.orbis_is_admin());
create policy signing_links_admin_read on public.janus_document_signing_links for select to authenticated using (public.orbis_is_admin());

-- Disable the old account-based authoring endpoint.
revoke execute on function public.orbis_save_signing_document(uuid,jsonb,text,text,boolean,uuid) from authenticated;
create function public.orbis_save_signing_document(p_content jsonb, p_signer_name text, p_signer_email text, p_allow_edits boolean, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result_id uuid; name_value text := btrim(coalesce(p_signer_name,'')); email_value text := lower(btrim(coalesce(p_signer_email,'')));
begin
 if not coalesce(public.orbis_is_admin(),false) then raise exception 'Document creation requires administrator access' using errcode='42501'; end if;
 if not public.orbis_valid_signing_content(p_content) or length(name_value)>200
   or (name_value<>'' and length(name_value)<2) or length(email_value)>254
   or (email_value<>'' and email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid document title and content. Signer details are optional for drafts.'; end if;
 if p_id is null then
   insert into public.janus_signing_documents(content,signer_name,signer_email,allow_recipient_edits)
   values(p_content,name_value,email_value,p_allow_edits) returning id into result_id;
 else
   update public.janus_signing_documents set content=p_content,signer_name=name_value,signer_email=email_value,allow_recipient_edits=p_allow_edits,updated_at=now()
   where id=p_id and status='draft' returning id into result_id;
   if result_id is null then raise exception 'Only draft documents can be edited. Cancel the active signing link first.'; end if;
 end if;
 return result_id;
end;
$$;
revoke all on function public.orbis_save_signing_document(jsonb,text,text,boolean,uuid) from public,anon;
grant execute on function public.orbis_save_signing_document(jsonb,text,text,boolean,uuid) to authenticated;

create or replace function public.orbis_issue_document_signing_link(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare doc public.janus_signing_documents%rowtype; link public.janus_document_signing_links%rowtype;
begin
 if not coalesce(public.orbis_is_admin(),false) then raise exception 'Document creation requires administrator access' using errcode='42501'; end if;
 select * into doc from public.janus_signing_documents where id=p_id for update;
 if not found or doc.status='signed' then raise exception 'Document unavailable or already signed'; end if;
 if length(btrim(doc.signer_name))<2 or doc.signer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Add a signer name and valid email before creating a signing link'; end if;
 select * into link from public.janus_document_signing_links where document_id=p_id and status='pending' for update;
 if found and link.expires_at>now() then return jsonb_build_object('token',link.token,'expiresAt',link.expires_at); end if;
 update public.janus_document_signing_links set status='cancelled' where document_id=p_id and status='pending';
 insert into public.janus_document_signing_links(document_id) values(p_id) returning * into link;
 update public.janus_signing_documents set status='pending',updated_at=now() where id=p_id;
 return jsonb_build_object('token',link.token,'expiresAt',link.expires_at);
end;
$$;

create or replace function public.orbis_cancel_document_signing_link(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if not coalesce(public.orbis_is_admin(),false) then raise exception 'Document creation requires administrator access' using errcode='42501'; end if;
 perform id from public.janus_signing_documents where id=p_id and status<>'signed' for update;
 if not found then raise exception 'Signed documents cannot be changed'; end if;
 update public.janus_document_signing_links set status='cancelled' where document_id=p_id and status='pending';
 update public.janus_signing_documents set status='draft',updated_at=now() where id=p_id;
end;
$$;
