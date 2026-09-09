#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env
  set +a
fi

if [[ -n "${DATABASE_POOLER_URL:-}" ]]; then
  DATABASE_URL="$DATABASE_POOLER_URL"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
drop function if exists public.claim_pending_deliveries(uuid, text[], uuid) cascade;
drop function if exists public.try_acquire_worker_lease(text, text, timestamptz) cascade;
drop function if exists public.enforce_identity_owner() cascade;

drop table if exists public.notification_outbox cascade;
drop table if exists public.worker_leases cascade;
drop table if exists public.chain_events cascade;
drop table if exists public.indexer_cursors cascade;
drop table if exists public.idempotency_keys cascade;
drop table if exists public.pending_deliveries cascade;
drop table if exists public.deliveries cascade;
drop table if exists public.gift_events cascade;
drop table if exists public.gifts cascade;
drop table if exists public.wallet_challenges cascade;
drop table if exists public.wallet_bindings cascade;
drop table if exists public.identities cascade;
drop table if exists public.profiles cascade;
drop table if exists public.wisp_schema_migrations cascade;
SQL

bash "$ROOT/scripts/db/migrate.sh"
echo "db reset ok"
