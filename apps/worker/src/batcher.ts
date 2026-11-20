export interface BatcherOptions<T> {
  /** Flush as soon as the buffered weight reaches this (weight = number of events). */
  maxWeight: number;
  /** Flush at the latest this long after the first buffered item. */
  flushIntervalMs: number;
  weigh: (item: T) => number;
  /**
   * Writes a batch. Returns one entry per item: an Error rejects that item only,
   * null resolves it. Throwing rejects every item in the batch.
   */
  flush: (items: T[]) => Promise<(Error | null)[]>;
}

interface Pending<T> {
  item: T;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

export interface Batcher<T> {
  /** Resolves once the batch containing the item has been written, rejects if that failed. */
  add(item: T): Promise<void>;
  /** Flushes the buffer now and resolves when all running and queued flushes are done. */
  flushNow(): Promise<void>;
}

/**
 * Collects items and writes them in batches. Batches are written one at a time, so the
 * database never sees more than one concurrent flush from this process.
 */
export function createBatcher<T>({
  maxWeight,
  flushIntervalMs,
  weigh,
  flush,
}: BatcherOptions<T>): Batcher<T> {
  let buffer: Pending<T>[] = [];
  let weight = 0;
  let timer: NodeJS.Timeout | undefined;
  let chain: Promise<void> = Promise.resolve();

  async function run(batch: Pending<T>[]): Promise<void> {
    try {
      const results = await flush(batch.map((p) => p.item));
      batch.forEach((p, i) => {
        const error = results[i];
        if (error) p.reject(error);
        else p.resolve();
      });
    } catch (err) {
      batch.forEach((p) => p.reject(err));
    }
  }

  function drain(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const batch = buffer;
    buffer = [];
    weight = 0;
    // `run` never throws, so the chain never rejects
    if (batch.length > 0) chain = chain.then(() => run(batch));
    return chain;
  }

  return {
    add(item) {
      return new Promise<void>((resolve, reject) => {
        buffer.push({ item, resolve, reject });
        weight += weigh(item);
        if (weight >= maxWeight) void drain();
        else if (!timer) timer = setTimeout(() => void drain(), flushIntervalMs);
      });
    },
    flushNow: drain,
  };
}
