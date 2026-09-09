-- PostgREST serializes PostgreSQL numeric values as JSON numbers. Values above
-- Number.MAX_SAFE_INTEGER are rounded by JSON.parse before the API can turn
-- them into strings. Store uint-like chain values as validated decimal text so
-- they cross the PostgREST/JavaScript boundary without losing precision.

alter table public.gifts
  alter column onchain_gift_id type text using onchain_gift_id::text,
  alter column token_amount type text using token_amount::text,
  alter column usdc_amount type text using usdc_amount::text;

alter table public.chain_events
  alter column onchain_gift_id type text using onchain_gift_id::text;

alter table public.gifts
  add constraint gifts_onchain_gift_id_decimal
    check (onchain_gift_id is null or onchain_gift_id ~ '^[1-9][0-9]{0,77}$'),
  add constraint gifts_token_amount_decimal
    check (token_amount ~ '^[1-9][0-9]{0,77}$'),
  add constraint gifts_usdc_amount_decimal
    check (usdc_amount ~ '^[1-9][0-9]{0,77}$');

alter table public.chain_events
  add constraint chain_events_onchain_gift_id_decimal
    check (onchain_gift_id is null or onchain_gift_id ~ '^[1-9][0-9]{0,77}$');
