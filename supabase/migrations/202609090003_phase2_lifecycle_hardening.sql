-- One generic notification is permitted for each gift/kind pair.  The indexer
-- intentionally replays logs after shallow reorgs, so the outbox must be
-- idempotent independently of the chain_events uniqueness constraint.
delete from public.notification_outbox older
using public.notification_outbox newer
where older.gift_id = newer.gift_id
  and older.kind = newer.kind
  and older.created_at < newer.created_at;

create unique index notification_outbox_gift_kind
  on public.notification_outbox(gift_id, kind);
