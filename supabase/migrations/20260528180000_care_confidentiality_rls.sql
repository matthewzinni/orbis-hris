-- Care item / note confidentiality on SELECT:
--   hr_only    → HR admins only
--   restricted → HR admins + employee's supervisor (direct report scope)
--   standard   → anyone with Care & Engagement read access (admins + supervisors)

create or replace function public.orbis_care_confidential_record_visible(
  record_confidentiality text,
  care_employee_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and lower(trim(coalesce(record_confidentiality, 'hr_only'))) = 'standard'
    )
    or (
      public.orbis_is_supervisor()
      and lower(trim(coalesce(record_confidentiality, ''))) = 'restricted'
      and public.orbis_employee_child_accessible(care_employee_id)
    );
$$;

grant execute on function public.orbis_care_confidential_record_visible(text, text) to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['care_items', 'care_employee_notes']
  loop
    execute format('drop policy if exists orbis_%s_select on public.%I', tbl, tbl);
    execute format(
      $policy$
      create policy orbis_%1$s_select on public.%1$I
        for select
        to authenticated
        using (
          public.orbis_can_access_care_engagement()
          or (
            public.orbis_can_view_care_engagement()
            and public.orbis_care_confidential_record_visible(confidentiality, employee_id)
          )
        )
      $policy$,
      tbl
    );
  end loop;
end $$;
