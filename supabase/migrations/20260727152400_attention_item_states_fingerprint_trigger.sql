-- Normalize legacy dismiss rows: dedupe_key is not a valid source fingerprint.

create or replace function public.attention_item_states_normalize_fingerprint()
returns trigger
language plpgsql
as $$
begin
  if new.source_fingerprint is not distinct from new.dedupe_key then
    new.source_fingerprint := null;
  end if;
  return new;
end;
$$;

drop trigger if exists attention_item_states_normalize_fingerprint on public.attention_item_states;
create trigger attention_item_states_normalize_fingerprint
before insert or update on public.attention_item_states
for each row execute function public.attention_item_states_normalize_fingerprint();
