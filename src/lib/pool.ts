/**
 * Bounded-concurrency map. The dashboard fans out one request per
 * flag x environment pair, so the number in flight has to be capped.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onSettled?: (completed: number, total: number) => void,
): Promise<R[]> {
  const total = items.length;
  const results = new Array<R>(total);
  if (total === 0) return results;

  let next = 0;
  let completed = 0;
  const limit = Math.max(1, Math.min(concurrency, total));

  async function run(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= total) return;
      results[index] = await worker(items[index] as T, index);
      completed += 1;
      onSettled?.(completed, total);
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('aborted'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
