import { describe, expect, it } from 'vitest';
import { mapPool } from '../src/lib/pool';

describe('mapPool', () => {
  it('preserves input order regardless of completion order', async () => {
    const results = await mapPool([30, 10, 20], 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPool(
      Array.from({ length: 30 }, (_, i) => i),
      4,
      async (value) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return value;
      },
    );
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('reports progress once per settled item', async () => {
    const seen: number[] = [];
    await mapPool(
      [1, 2, 3, 4],
      2,
      async (value) => value,
      (completed) => seen.push(completed),
    );
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('handles an empty input', async () => {
    await expect(mapPool([], 4, async () => 1)).resolves.toEqual([]);
  });
});
