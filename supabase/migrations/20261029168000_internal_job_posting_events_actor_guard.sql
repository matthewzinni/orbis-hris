-- Fix: internal_job_posting_events INSERT policy let any employee insert a row for any
-- posting visible to them, with nothing tying actor_email/actor_name to the real caller's
-- identity -- the app always sends the real signed-in user's email
-- (resolveCurrentUserEmail(), already lowercased/trimmed to match orbis_auth_email()), but
-- RLS never enforced it. Anyone could forge an audit-log entry attributing an action to a
-- different person. Adds a check that actor_email must equal the caller's own JWT email,
-- with no behavior change for the real app (which already only ever sends its own email).

drop policy if exists orbis_internal_job_posting_events_insert on public.internal_job_posting_events;
create policy orbis_internal_job_posting_events_insert
  on public.internal_job_posting_events for insert to authenticated
  with check (
    lower(trim(actor_email)) = public.orbis_auth_email()
    and (
      public.orbis_is_admin()
      or public.orbis_is_supervisor()
      or posting_id in (
        select p.id
        from public.internal_job_postings p
        where public.orbis_internal_job_posting_visible(p)
      )
    )
  );
