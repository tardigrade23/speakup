-- Private settings read only by Edge Functions with the service role key.
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
-- No policies: anon and authenticated users can neither read nor write.
revoke all on public.app_config from anon, authenticated;
-- The passcode row is inserted by hand, not committed:
--   insert into public.app_config (key, value) values ('passcode', '<code>');
