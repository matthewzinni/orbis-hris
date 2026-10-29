-- Fix: candidate_interviews and candidate_offers RLS used a bare
-- orbis_is_admin() OR orbis_is_supervisor() check with no department scoping, unlike
-- candidates/candidate_notes which are correctly scoped via orbis_candidate_row_visible().
-- Any supervisor could read/write interview feedback and offer compensation details
-- (pay_rate, pay_type, intro_period_days) for candidates outside their own department.
-- These two tables are not currently read or written anywhere in the app (offer data is
-- instead stored as flat columns directly on `candidates`), so this closes a latent gap
-- before it becomes a live leak, matching the department-scoped pattern already proven
-- correct for candidate_notes.

drop policy if exists orbis_candidate_interviews_all on public.candidate_interviews;

drop policy if exists orbis_candidate_interviews_select on public.candidate_interviews;
create policy orbis_candidate_interviews_select
  on public.candidate_interviews
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_interviews.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_interviews_insert on public.candidate_interviews;
create policy orbis_candidate_interviews_insert
  on public.candidate_interviews
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_interviews.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_interviews_update on public.candidate_interviews;
create policy orbis_candidate_interviews_update
  on public.candidate_interviews
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_interviews.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  )
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_interviews.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_interviews_delete on public.candidate_interviews;
create policy orbis_candidate_interviews_delete
  on public.candidate_interviews
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_interviews.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_offers_all on public.candidate_offers;

drop policy if exists orbis_candidate_offers_select on public.candidate_offers;
create policy orbis_candidate_offers_select
  on public.candidate_offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_offers.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_offers_insert on public.candidate_offers;
create policy orbis_candidate_offers_insert
  on public.candidate_offers
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_offers.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_offers_update on public.candidate_offers;
create policy orbis_candidate_offers_update
  on public.candidate_offers
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_offers.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  )
  with check (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_offers.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );

drop policy if exists orbis_candidate_offers_delete on public.candidate_offers;
create policy orbis_candidate_offers_delete
  on public.candidate_offers
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_offers.candidate_id
        and public.orbis_candidate_row_visible(c)
    )
  );
