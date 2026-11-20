interface Entry {
  /** null means the key is known to be invalid */
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
 * Keeps siteKey -> siteId in memory, in front of Postgres.
 * - Valid keys are kept for ttlMs. A deleted site still works for that long.
 * - Unknown keys are kept too. Random keys can't flood the database.
 * - If many requests ask for the same key at once, only one query runs.
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
      // A Map remembers insertion order, so the first key is the oldest
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
