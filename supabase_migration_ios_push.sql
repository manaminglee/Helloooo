-- APNs device tokens from the Capacitor iOS app.
create table if not exists public.mm_apns_tokens (
  token text primary key,
  owner_key text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);
create index if not exists mm_apns_tokens_owner_idx on public.mm_apns_tokens (owner_key);
