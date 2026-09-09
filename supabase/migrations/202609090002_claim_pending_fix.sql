-- Fix ambiguous OUT columns in claim_pending_deliveries.
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
