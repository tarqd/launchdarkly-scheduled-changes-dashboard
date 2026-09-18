import { describe, expect, it } from 'vitest';
import { bucketOf, DAY, dayOffset, dayRange, startOfDay } from '../src/lib/time';

// Noon, so day arithmetic is not sensitive to the machine's timezone offset.
const NOON = new Date(2024, 4, 15, 12, 0, 0).getTime();

describe('startOfDay / dayOffset', () => {
  it('snaps to local midnight', () => {
    expect(new Date(startOfDay(NOON)).getHours()).toBe(0);
  });

  it('counts whole calendar days', () => {
    expect(dayOffset(NOON, NOON)).toBe(0);
    expect(dayOffset(NOON + DAY, NOON)).toBe(1);
    expect(dayOffset(NOON - DAY, NOON)).toBe(-1);
  });
});

describe('bucketOf', () => {
  it('buckets by how people actually plan', () => {
    expect(bucketOf(NOON - 1_000, NOON)).toBe('overdue');
    expect(bucketOf(NOON + 3_600_000, NOON)).toBe('today');
    expect(bucketOf(NOON + DAY, NOON)).toBe('tomorrow');
    expect(bucketOf(NOON + 4 * DAY, NOON)).toBe('this-week');
    expect(bucketOf(NOON + 10 * DAY, NOON)).toBe('next-week');
    expect(bucketOf(NOON + 40 * DAY, NOON)).toBe('later');
  });

  it('treats a later time today as today, not overdue', () => {
    const laterToday = new Date(2024, 4, 15, 23, 30, 0).getTime();
    expect(bucketOf(laterToday, NOON)).toBe('today');
  });
});

describe('dayRange', () => {
  it('returns consecutive day starts', () => {
    const range = dayRange(NOON, 3);
    expect(range).toHaveLength(3);
    expect(range[0]).toBe(startOfDay(NOON));
    expect(range[2]).toBe(startOfDay(NOON) + 2 * DAY);
  });
});
