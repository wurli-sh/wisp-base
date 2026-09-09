import { canTransitionGift, type GiftState } from "@wisp/shared";

export function assertTransition(from: GiftState, to: GiftState): void {
  if (!canTransitionGift(from, to)) throw new Error("gift_already_terminal");
}

export function nextVersion(current: number): number {
  return current + 1;
}

export async function transitionGiftRow(
  update: (patch: { state: GiftState; version: number; updated_at: string }) => Promise<{
    version: number;
    state: GiftState;
  } | null>,
  from: GiftState,
  to: GiftState,
  version: number,
): Promise<{ version: number; state: GiftState }> {
  assertTransition(from, to);
  if (from === to) return { version, state: from };
  const updated = await update({
    state: to,
    version: nextVersion(version),
    updated_at: new Date().toISOString(),
  });
  if (!updated) throw new Error("version_conflict");
  return updated;
}
