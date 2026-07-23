-- Per-user overlay for unified attention items (dismiss, snooze, in progress).

create table if not exists public.attention_item_states (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  dedupe_key text not null,
  status text not null check (status in ('dismissed', 'in_progress', 'snoozed')),
  snoozed_until date,
  source_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attention_item_states_user_dedupe_key unique (user_email, dedupe_key)
);

create index if not exists attention_item_states_user_email_idx
  on public.attention_item_states (user_email);

alter table public.attention_item_states enable row level security;

drop policy if exists attention_item_states_select_own on public.attention_item_states;
create policy attention_item_states_select_own
  on public.attention_item_states
  for select
  to authenticated
  using (lower(trim(user_email)) = public.orbis_auth_email());

drop policy if exists attention_item_states_insert_own on public.attention_item_states;
create policy attention_item_states_insert_own
  on public.attention_item_states
  for insert
  to authenticated
  with check (lower(trim(user_email)) = public.orbis_auth_email());

drop policy if exists attention_item_states_update_own on public.attention_item_states;
create policy attention_item_states_update_own
  on public.attention_item_states
  for update
  to authenticated
  using (lower(trim(user_email)) = public.orbis_auth_email())
  with check (lower(trim(user_email)) = public.orbis_auth_email());

drop policy if exists attention_item_states_delete_own on public.attention_item_states;
create policy attention_item_states_delete_own
  on public.attention_item_states
  for delete
  to authenticated
  using (lower(trim(user_email)) = public.orbis_auth_email());

grant select, insert, update, delete on table public.attention_item_states to authenticated;
