interface Entry {
  /** null = the key is known to be invalid (negative cache) */
  siteId: string | null;
  expiresAt: number;
}

interface Options {
  ttlMs?: number;
  negativeTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

/**
 * In-memory siteKey -> siteId cache in front of Postgres.
 * - Valid keys are cached for ttlMs, so a deleted site is still accepted for at most that long.
 * - Unknown keys are cached too, so a flood of random keys cannot hit the database.
 * - Concurrent lookups of the same key share one query.
 */
export function createSiteKeyCache(
  lookup: (siteKey: string) => Promise<string | null>,
  { ttlMs = 60_000, negativeTtlMs = 30_000, maxEntries = 10_000, now = Date.now }: Options = {},
) {
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<string | null>>();

  async function load(siteKey: string): Promise<string | null> {
    const siteId = await lookup(siteKey);
    if (entries.size >= maxEntries) {
      // Map keeps insertion order: drop the oldest entry
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
    entries.set(siteKey, { siteId, expiresAt: now() + (siteId ? ttlMs : negativeTtlMs) });
    return siteId;
  }

  return {
    async resolve(siteKey: string): Promise<string | null> {
      const hit = entries.get(siteKey);
      if (hit && hit.expiresAt > now()) return hit.siteId;

      let pending = inFlight.get(siteKey);
      if (!pending) {
        pending = load(siteKey).finally(() => inFlight.delete(siteKey));
        inFlight.set(siteKey, pending);
      }
      return pending;
    },
  };
}

export type SiteKeyCache = ReturnType<typeof createSiteKeyCache>;
