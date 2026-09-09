/** No artificial hold — show real UI as soon as auth/data settles. */
export const SKELETON_MAX_MS = 0;

/** First-paint boot cover disabled (was 500ms). */
export const PAGE_BOOT_MS = 0;

/** @deprecated Use `ready` on PageShimmer instead; kept at 0 for legacy call sites. */
export const SKELETON_MIN_MS = 0;

/**
 * Run `work` and optionally cap how long callers wait before resolving.
 * Default minMs is 0 — no artificial delay when data is already available.
 */
export async function withMinSkeleton<T>(
  work: () => Promise<T>,
  minMs: number = 0,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    const remaining = minMs - (performance.now() - started);
    if (remaining > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, remaining);
      });
    }
  }
}
