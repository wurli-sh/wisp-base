-- Wisp Phase 2: application schema. Secret-bearing writes use the service role.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('email', 'google', 'x')),
  provider_subject text not null,
  normalized_identifier text not null,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create unique index identities_active_identifier
  on public.identities(provider, normalized_identifier)
  where revoked_at is null and verified_at is not null;

create index identities_active_email_lookup
  on public.identities(lower(normalized_identifier), profile_id)
  where provider in ('email', 'google') and revoked_at is null and verified_at is not null;

create table public.wallet_bindings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chain_id bigint not null check (chain_id = 84532),
  address text not null,
  wallet_provider text not null default 'cdp' check (wallet_provider in ('cdp', 'eoa')),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index wallet_bindings_active_address
  on public.wallet_bindings(chain_id, lower(address))
  where revoked_at is null;

create unique index wallet_bindings_active_profile_chain
  on public.wallet_bindings(profile_id, chain_id)
  where revoked_at is null;

create table public.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nonce_hash text not null unique,
  challenge_hash text not null,
  address text not null,
  purpose text not null check (purpose = 'wallet_link'),
  origin text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  chain_id bigint not null check (chain_id = 84532),
  onchain_gift_id numeric(78,0),
  token_address text not null,
  token_amount numeric(78,0) not null,
  usdc_amount numeric(78,0) not null,
  unlock_at timestamptz not null,
  expires_at timestamptz not null,
  anonymous_sender boolean not null default false,
  message text check (message is null or char_length(message) <= 280),
  state text not null default 'draft',
  tx_hash text,
  claim_tx_hash text,
  refund_tx_hash text,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state in (
    'draft','submitted','funded','delivered','claimable','claimed','refundable','refunded','failed'
  ))
);

create index gifts_owner_created on public.gifts(owner_id, created_at desc);
create unique index gifts_onchain_id on public.gifts(chain_id, onchain_gift_id) where onchain_gift_id is not null;

create table public.gift_events (
  id bigint generated always as identity primary key,
  gift_id uuid not null references public.gifts(id) on delete cascade,
  from_state text,
  to_state text not null,
  version integer not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (gift_id, version)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null unique references public.gifts(id) on delete cascade,
  recipient_profile_id uuid references public.profiles(id),
  recipient_address text,
  recipient_kind text not null check (recipient_kind in ('email', 'x', 'basename')),
  delivery_state text not null default 'pending'
    check (delivery_state in ('pending', 'delivered', 'read')),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index deliveries_recipient on public.deliveries(recipient_profile_id, created_at desc)
  where recipient_profile_id is not null;

create table public.pending_deliveries (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null unique references public.gifts(id) on delete cascade,
  recipient_lookup_hash text not null,
  recipient_kind text not null check (recipient_kind in ('email', 'x', 'basename')),
  expires_at timestamptz not null,
  delivered_profile_id uuid references public.profiles(id),
  delivered_at timestamptz,
  processing_token uuid,
  processing_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index pending_deliveries_lookup
  on public.pending_deliveries(recipient_lookup_hash)
  where delivered_at is null;

create table public.idempotency_keys (
  owner_id uuid not null references public.profiles(id),
  key uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, key)
);

create table public.chain_events (
  id bigint generated always as identity primary key,
  chain_id bigint not null,
  block_number bigint not null,
  block_hash text not null,
  tx_hash text not null,
  log_index integer not null,
  kind text not null,
  gift_id uuid references public.gifts(id),
  onchain_gift_id numeric(78,0),
  payload jsonb not null,
  canonical boolean not null default true,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create table public.indexer_cursors (
  chain_id bigint primary key,
  block_number bigint not null,
  block_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts(id) on delete cascade,
  kind text not null default 'gift_waiting',
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'unavailable')),
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_leases (
  name text primary key,
  holder text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.identities enable row level security;
alter table public.identities force row level security;
alter table public.wallet_bindings enable row level security;
alter table public.wallet_bindings force row level security;
alter table public.wallet_challenges enable row level security;
alter table public.wallet_challenges force row level security;
alter table public.gifts enable row level security;
alter table public.gifts force row level security;
alter table public.gift_events enable row level security;
alter table public.gift_events force row level security;
alter table public.deliveries enable row level security;
alter table public.deliveries force row level security;
alter table public.pending_deliveries enable row level security;
alter table public.pending_deliveries force row level security;
alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;
alter table public.chain_events enable row level security;
alter table public.chain_events force row level security;
alter table public.indexer_cursors enable row level security;
alter table public.indexer_cursors force row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
alter table public.worker_leases enable row level security;
alter table public.worker_leases force row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "own identities" on public.identities for select using (profile_id = auth.uid());
create policy "own wallets" on public.wallet_bindings for select using (profile_id = auth.uid());
create policy "own challenges" on public.wallet_challenges for select using (profile_id = auth.uid());
create policy "own gifts" on public.gifts for select using (owner_id = auth.uid());
create policy "own gift events" on public.gift_events for select
  using (exists (select 1 from public.gifts g where g.id = gift_id and g.owner_id = auth.uid()));
create policy "own deliveries" on public.deliveries for select
  using (recipient_profile_id = auth.uid());

revoke all on public.pending_deliveries, public.chain_events, public.indexer_cursors,
  public.idempotency_keys, public.notification_outbox, public.worker_leases
  from anon, authenticated;

create or replace function public.enforce_identity_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.revoked_at is null and new.verified_at is not null and exists (
    select 1 from public.identities existing
    where existing.id <> new.id
      and existing.revoked_at is null
      and existing.verified_at is not null
      and existing.profile_id <> new.profile_id
      and lower(existing.normalized_identifier) = lower(new.normalized_identifier)
      and (
        (new.provider = 'x' and existing.provider = 'x')
        or
        (new.provider in ('email', 'google') and existing.provider in ('email', 'google'))
      )
  ) then
    raise exception using errcode = '23505', message = 'identity_already_linked';
  end if;
  return new;
end $$;

drop trigger if exists identities_enforce_owner on public.identities;
create trigger identities_enforce_owner
before insert or update of profile_id, provider, normalized_identifier, verified_at, revoked_at
on public.identities for each row execute function public.enforce_identity_owner();

create or replace function public.claim_pending_deliveries(
  p_profile_id uuid,
  p_lookup_hashes text[],
  p_token uuid
)
returns table(
  id uuid,
  gift_id uuid,
  recipient_kind text,
  recipient_lookup_hash text
) language plpgsql security definer set search_path = public as $$
declare
  claimed public.pending_deliveries%rowtype;
begin
  for claimed in
    select pd.*
    from public.pending_deliveries pd
    where pd.delivered_at is null
      and pd.expires_at > now()
      and pd.recipient_lookup_hash = any(p_lookup_hashes)
      and (pd.processing_expires_at is null or pd.processing_expires_at < now())
    for update of pd skip locked
  loop
    update public.pending_deliveries
      set processing_token = p_token,
          processing_expires_at = now() + interval '5 minutes'
    where public.pending_deliveries.id = claimed.id;

    id := claimed.id;
    gift_id := claimed.gift_id;
    recipient_kind := claimed.recipient_kind;
    recipient_lookup_hash := claimed.recipient_lookup_hash;
    return next;
  end loop;
  return;
end $$;

revoke all on function public.claim_pending_deliveries(uuid, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.claim_pending_deliveries(uuid, text[], uuid) to service_role;

create or replace function public.try_acquire_worker_lease(
  p_name text,
  p_holder text,
  p_expires_at timestamptz
)
returns boolean language plpgsql security definer set search_path = public as $$
declare acquired boolean;
begin
  insert into worker_leases(name, holder, expires_at)
  values (p_name, p_holder, p_expires_at)
  on conflict(name) do update
    set holder = excluded.holder,
        expires_at = excluded.expires_at,
        updated_at = now()
    where worker_leases.expires_at < now() or worker_leases.holder = excluded.holder
  returning true into acquired;
  return coalesce(acquired, false);
end $$;

revoke all on function public.try_acquire_worker_lease(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.try_acquire_worker_lease(text, text, timestamptz) to service_role;
