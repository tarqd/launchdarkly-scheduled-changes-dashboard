/** Time helpers for bucketing scheduled changes into a readable agenda. */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type BucketId = 'overdue' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'later';

export const BUCKET_LABELS: Record<BucketId, string> = {
  overdue: 'Past due',
  today: 'Today',
  tomorrow: 'Tomorrow',
  'this-week': 'Later this week',
  'next-week': 'Next week',
  later: 'Later',
};

export const BUCKET_ORDER: BucketId[] = [
  'overdue',
  'today',
  'tomorrow',
  'this-week',
  'next-week',
  'later',
];

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Whole calendar days from `now`'s day to `timestamp`'s day. Can be negative. */
export function dayOffset(timestamp: number, now: number): number {
  return Math.round((startOfDay(timestamp) - startOfDay(now)) / DAY);
}

export function bucketOf(executionDate: number, now: number): BucketId {
  if (executionDate < now) return 'overdue';
  const offset = dayOffset(executionDate, now);
  if (offset <= 0) return 'today';
  if (offset === 1) return 'tomorrow';
  if (offset <= 7) return 'this-week';
  if (offset <= 14) return 'next-week';
  return 'later';
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "in 3 hours" / "2 days ago", picking a sensible unit. */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const delta = timestamp - now;
  const absolute = Math.abs(delta);
  if (absolute < HOUR) return RELATIVE.format(Math.round(delta / MINUTE), 'minute');
  if (absolute < DAY) return RELATIVE.format(Math.round(delta / HOUR), 'hour');
  if (absolute < 30 * DAY) return RELATIVE.format(Math.round(delta / DAY), 'day');
  return RELATIVE.format(Math.round(delta / (30 * DAY)), 'month');
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const DATE_ONLY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const TIME_ONLY = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatDateTime(timestamp: number): string {
  return DATE_TIME.format(timestamp);
}

export function formatDate(timestamp: number): string {
  return DATE_ONLY.format(timestamp);
}

export function formatWeekday(timestamp: number): string {
  return WEEKDAY.format(timestamp);
}

export function formatTime(timestamp: number): string {
  return TIME_ONLY.format(timestamp);
}

/** An inclusive run of day-start timestamps, for the volume chart's x axis. */
export function dayRange(from: number, days: number): number[] {
  const first = startOfDay(from);
  return Array.from({ length: days }, (_, index) => first + index * DAY);
}
