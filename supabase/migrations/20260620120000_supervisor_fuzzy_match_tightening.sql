-- Tighten supervisor roster matching and backfill explicit supervised_employee_ids.

create or replace function public.orbis_normalize_supervisor_label(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')));
$$;

create or replace function public.orbis_compact_supervisor_label(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(public.orbis_normalize_supervisor_label(value), '[^a-z0-9]', '', 'g');
$$;

create or replace function public.orbis_supervisor_scope_tokens(scope_name text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(token order by token) filter (where length(token) >= 2),
    array[]::text[]
  )
  from unnest(
    regexp_split_to_array(public.orbis_normalize_supervisor_label(scope_name), '[^a-z0-9]+')
  ) as token
  where length(token) >= 2;
$$;

-- Exact, compact, or all multi-token scope tokens present (no short single-token substring).
create or replace function public.orbis_supervisor_matches(
  employee_supervisor text,
  scope_name text
)
returns boolean
language sql
immutable
as $$
  with labels as (
    select
      public.orbis_normalize_supervisor_label(employee_supervisor) as employee_norm,
      public.orbis_normalize_supervisor_label(scope_name) as scope_norm,
      public.orbis_compact_supervisor_label(employee_supervisor) as employee_compact,
      public.orbis_compact_supervisor_label(scope_name) as scope_compact
  ),
  tokens as (
    select public.orbis_supervisor_scope_tokens(scope_name) as scope_tokens
  )
  select
    (select employee_norm from labels) <> ''
    and (select scope_norm from labels) <> ''
    and (select scope_norm from labels) <> 'all'
    and (
      (select employee_norm from labels) = (select scope_norm from labels)
      or (
        (select employee_compact from labels) <> ''
        and (select scope_compact from labels) <> ''
        and (select employee_compact from labels) = (select scope_compact from labels)
      )
      or (
        coalesce(cardinality((select scope_tokens from tokens)), 0) >= 2
        and not exists (
          select 1
          from unnest((select scope_tokens from tokens)) as token
          where strpos((select employee_norm from labels), token) = 0
        )
      )
    );
$$;

-- NULL supervised_employee_ids = legacy name match; non-null array = explicit scope only.
create or replace function public.orbis_supervisor_sees_employee(e public.employees)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.orbis_supervisor_scoped_employee_ids() is not null
      and e.id::text = any (coalesce(public.orbis_supervisor_scoped_employee_ids(), array[]::text[]))
    )
    or (
      public.orbis_supervisor_scoped_employee_ids() is null
      and public.orbis_supervisor_matches(
        coalesce(e.supervisor, ''),
        public.orbis_supervisor_scope_name()
      )
    );
$$;

create or replace function public.orbis_sync_my_supervisor_scope()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  access_row public.user_access;
  scope_name text;
  roster_ids text[];
  current_ids text[];
begin
  if not public.orbis_access_is_approved() or not public.orbis_is_supervisor() then
    return null;
  end if;

  select ua.* into access_row
  from public.user_access ua
  where lower(trim(ua.email)) = public.orbis_auth_email()
  limit 1;

  if not found then
    return null;
  end if;

  scope_name := coalesce(
    nullif(btrim(access_row.supervisor_name), ''),
    nullif(btrim(access_row.display_name), '')
  );
  if scope_name is null then
    return access_row.supervised_employee_ids;
  end if;

  current_ids := coalesce(access_row.supervised_employee_ids, array[]::text[]);

  select coalesce(array_agg(e.id::text order by e.last_name nulls last, e.first_name nulls last, e.id), array[]::text[])
  into roster_ids
  from public.employees e
  where upper(trim(coalesce(e.status, ''))) not in ('TERMINATED', 'INACTIVE')
    and public.orbis_supervisor_matches(coalesce(e.supervisor, ''), scope_name);

  if access_row.supervised_employee_ids is not null and roster_ids = current_ids then
    return current_ids;
  end if;

  update public.user_access ua
  set supervised_employee_ids = roster_ids
  where lower(trim(ua.email)) = public.orbis_auth_email();

  return roster_ids;
end;
$$;

revoke all on function public.orbis_sync_my_supervisor_scope() from public;
grant execute on function public.orbis_sync_my_supervisor_scope() to authenticated;

-- Backfill explicit supervisor teams using tightened matching.
update public.user_access ua
set supervised_employee_ids = coalesce(team.ids, array[]::text[])
from (
  select
    ua2.email,
    array_agg(e.id::text order by e.last_name nulls last, e.first_name nulls last, e.id)
      filter (where e.id is not null) as ids
  from public.user_access ua2
  left join public.employees e
    on upper(trim(coalesce(e.status, ''))) not in ('TERMINATED', 'INACTIVE')
    and public.orbis_supervisor_matches(
      coalesce(e.supervisor, ''),
      coalesce(nullif(btrim(ua2.supervisor_name), ''), nullif(btrim(ua2.display_name), ''))
    )
  where lower(trim(ua2.role)) = 'supervisor'
    and coalesce(nullif(btrim(ua2.supervisor_name), ''), nullif(btrim(ua2.display_name), '')) is not null
  group by ua2.email
) team
where lower(trim(ua.email)) = lower(trim(team.email))
  and lower(trim(ua.role)) = 'supervisor';
