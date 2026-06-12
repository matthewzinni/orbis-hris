-- Janus CRM — relationship management (accounts, contacts, meetings, documents, activities)

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create or replace function public.orbis_can_read_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_access_role() in ('janus', 'janus_readonly');
$$;

create or replace function public.orbis_can_write_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_access_role() = 'janus';
$$;

grant execute on function public.orbis_can_read_janus() to authenticated;
grant execute on function public.orbis_can_write_janus() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.janus_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null default 'other',
  status text not null default 'active',
  owner_email text,
  website text,
  phone text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  notes text,
  copper_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint janus_accounts_type_check check (
    account_type in ('client', 'vendor', 'partner', 'publisher', 'other')
  ),
  constraint janus_accounts_status_check check (
    status in ('active', 'inactive', 'prospect')
  )
);

create index if not exists janus_accounts_name_idx on public.janus_accounts (lower(name));
create index if not exists janus_accounts_status_idx on public.janus_accounts (status);
create index if not exists janus_accounts_owner_idx on public.janus_accounts (owner_email);
create index if not exists janus_accounts_copper_idx on public.janus_accounts (copper_id);

create table if not exists public.janus_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.janus_accounts(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  title text,
  email text,
  phone text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  notes text,
  is_primary boolean not null default false,
  copper_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists janus_contacts_account_idx on public.janus_contacts (account_id);
create index if not exists janus_contacts_email_idx on public.janus_contacts (lower(email));

create table if not exists public.janus_meetings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.janus_accounts(id) on delete cascade,
  meeting_date date not null,
  title text not null,
  attendees text[] not null default '{}'::text[],
  transcript text,
  summary text,
  action_items text,
  follow_up_date date,
  logged_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists janus_meetings_account_idx on public.janus_meetings (account_id);
create index if not exists janus_meetings_date_idx on public.janus_meetings (meeting_date desc);

create table if not exists public.janus_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.janus_accounts(id) on delete cascade,
  title text not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  document_type text not null default 'other',
  effective_date date,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  constraint janus_documents_type_check check (
    document_type in ('agreement', 'sow', 'nda', 'other')
  )
);

create index if not exists janus_documents_account_idx on public.janus_documents (account_id);

create table if not exists public.janus_activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.janus_accounts(id) on delete cascade,
  contact_id uuid references public.janus_contacts(id) on delete set null,
  activity_type text not null default 'note',
  activity_date date not null default current_date,
  subject text not null,
  body text,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint janus_activities_type_check check (
    activity_type in ('call', 'email', 'meeting', 'visit', 'note', 'follow_up')
  )
);

create index if not exists janus_activities_account_idx on public.janus_activities (account_id, activity_date desc);

create or replace function public.janus_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists janus_accounts_updated_at on public.janus_accounts;
create trigger janus_accounts_updated_at
  before update on public.janus_accounts
  for each row execute function public.janus_set_updated_at();

drop trigger if exists janus_contacts_updated_at on public.janus_contacts;
create trigger janus_contacts_updated_at
  before update on public.janus_contacts
  for each row execute function public.janus_set_updated_at();

drop trigger if exists janus_meetings_updated_at on public.janus_meetings;
create trigger janus_meetings_updated_at
  before update on public.janus_meetings
  for each row execute function public.janus_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.janus_accounts enable row level security;
alter table public.janus_contacts enable row level security;
alter table public.janus_meetings enable row level security;
alter table public.janus_documents enable row level security;
alter table public.janus_activities enable row level security;

drop policy if exists janus_accounts_select on public.janus_accounts;
create policy janus_accounts_select on public.janus_accounts
  for select to authenticated using (public.orbis_can_read_janus());

drop policy if exists janus_accounts_insert on public.janus_accounts;
create policy janus_accounts_insert on public.janus_accounts
  for insert to authenticated with check (public.orbis_can_write_janus());

drop policy if exists janus_accounts_update on public.janus_accounts;
create policy janus_accounts_update on public.janus_accounts
  for update to authenticated
  using (public.orbis_can_write_janus())
  with check (public.orbis_can_write_janus());

drop policy if exists janus_accounts_delete on public.janus_accounts;
create policy janus_accounts_delete on public.janus_accounts
  for delete to authenticated using (public.orbis_is_admin());

drop policy if exists janus_contacts_select on public.janus_contacts;
create policy janus_contacts_select on public.janus_contacts
  for select to authenticated using (public.orbis_can_read_janus());

drop policy if exists janus_contacts_insert on public.janus_contacts;
create policy janus_contacts_insert on public.janus_contacts
  for insert to authenticated with check (public.orbis_can_write_janus());

drop policy if exists janus_contacts_update on public.janus_contacts;
create policy janus_contacts_update on public.janus_contacts
  for update to authenticated
  using (public.orbis_can_write_janus())
  with check (public.orbis_can_write_janus());

drop policy if exists janus_contacts_delete on public.janus_contacts;
create policy janus_contacts_delete on public.janus_contacts
  for delete to authenticated using (public.orbis_can_write_janus());

drop policy if exists janus_meetings_select on public.janus_meetings;
create policy janus_meetings_select on public.janus_meetings
  for select to authenticated using (public.orbis_can_read_janus());

drop policy if exists janus_meetings_insert on public.janus_meetings;
create policy janus_meetings_insert on public.janus_meetings
  for insert to authenticated with check (public.orbis_can_write_janus());

drop policy if exists janus_meetings_update on public.janus_meetings;
create policy janus_meetings_update on public.janus_meetings
  for update to authenticated
  using (public.orbis_can_write_janus())
  with check (public.orbis_can_write_janus());

drop policy if exists janus_meetings_delete on public.janus_meetings;
create policy janus_meetings_delete on public.janus_meetings
  for delete to authenticated using (public.orbis_can_write_janus());

drop policy if exists janus_documents_select on public.janus_documents;
create policy janus_documents_select on public.janus_documents
  for select to authenticated using (public.orbis_can_read_janus());

drop policy if exists janus_documents_insert on public.janus_documents;
create policy janus_documents_insert on public.janus_documents
  for insert to authenticated with check (public.orbis_can_write_janus());

drop policy if exists janus_documents_update on public.janus_documents;
create policy janus_documents_update on public.janus_documents
  for update to authenticated
  using (public.orbis_can_write_janus())
  with check (public.orbis_can_write_janus());

drop policy if exists janus_documents_delete on public.janus_documents;
create policy janus_documents_delete on public.janus_documents
  for delete to authenticated using (public.orbis_can_write_janus());

drop policy if exists janus_activities_select on public.janus_activities;
create policy janus_activities_select on public.janus_activities
  for select to authenticated using (public.orbis_can_read_janus());

drop policy if exists janus_activities_insert on public.janus_activities;
create policy janus_activities_insert on public.janus_activities
  for insert to authenticated with check (public.orbis_can_write_janus());

drop policy if exists janus_activities_update on public.janus_activities;
create policy janus_activities_update on public.janus_activities
  for update to authenticated
  using (public.orbis_can_write_janus())
  with check (public.orbis_can_write_janus());

drop policy if exists janus_activities_delete on public.janus_activities;
create policy janus_activities_delete on public.janus_activities
  for delete to authenticated using (public.orbis_can_write_janus());

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'janus-documents',
  'janus-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;

drop policy if exists janus_documents_storage_select on storage.objects;
create policy janus_documents_storage_select
  on storage.objects for select to authenticated
  using (bucket_id = 'janus-documents' and public.orbis_can_read_janus());

drop policy if exists janus_documents_storage_insert on storage.objects;
create policy janus_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'janus-documents' and public.orbis_can_write_janus());

drop policy if exists janus_documents_storage_delete on storage.objects;
create policy janus_documents_storage_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'janus-documents' and public.orbis_can_write_janus());
