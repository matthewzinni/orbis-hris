-- Add Treat & Train while retaining every existing account type.
begin;

alter table public.janus_accounts
  drop constraint janus_accounts_type_check;

alter table public.janus_accounts
  add constraint janus_accounts_type_check check (
    account_type in ('client', 'vendor', 'partner', 'publisher', 'treat_train', 'other')
  );

commit;
