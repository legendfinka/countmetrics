export interface BatcherOptions<T> {
  /** Save as soon as the buffer reaches this weight (weight = number of events). */
  maxWeight: number;
  /** Save at the latest this long after the first item arrives. */
  flushIntervalMs: number;
  weigh: (item: T) => number;
  /**
   * Saves a batch. Returns one result per item. An Error fails only that item.
   * null means success. If it throws, every item in the batch fails.
   */
  flush: (items: T[]) => Promise<(Error | null)[]>;
}

interface Pending<T> {
  item: T;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

export interface Batcher<T> {
  /** Resolves when the item's batch is saved. Rejects if saving failed. */
  add(item: T): Promise<void>;
  /** Saves the buffer now. Resolves when all running and waiting saves are done. */
  flushNow(): Promise<void>;
}

/**
 * Collects items and saves them in batches. Only one batch is saved at a time.
 * So this process never runs two saves on the database at once.
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
    // run() never throws, so the chain never fails
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
