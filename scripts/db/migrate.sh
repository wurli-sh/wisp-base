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
  echo "DATABASE_URL is required; add it to .env or export it before running migrations." >&2
  exit 1
fi

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.wisp_schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
SQL

shopt -s nullglob
for file in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$file")"
  applied="$(psql "$DATABASE_URL" -Atc "select 1 from public.wisp_schema_migrations where name = '$name' limit 1")"
  if [[ "$applied" == "1" ]]; then
    echo "skip $name"
    continue
  fi
  echo "apply $name"
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "$file"
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -c "insert into public.wisp_schema_migrations(name) values ('$name') on conflict do nothing"
done

echo "migrations ok"
