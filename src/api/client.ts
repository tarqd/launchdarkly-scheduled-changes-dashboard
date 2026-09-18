import { sleep } from '../lib/pool';
import type { CallerIdentity, Paginated } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Query parameters; `undefined` values are dropped. */
  query?: Record<string, string | number | undefined>;
  /** Retries for 429 and 5xx. Defaults to 4. */
  retries?: number;
}

const MAX_RATE_LIMIT_WAIT_MS = 30_000;

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`/api/ld/${path.replace(/^\/+/, '')}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * How long to wait before retrying. LaunchDarkly sends `X-Ratelimit-Reset` as an
 * epoch-millis timestamp; fall back to exponential backoff when it is absent.
 */
function retryDelayMs(response: Response, attempt: number): number {
  const reset = Number(response.headers.get('X-Ratelimit-Reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const wait = reset - Date.now();
    if (wait > 0) return Math.min(wait + 100, MAX_RATE_LIMIT_WAIT_MS);
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RATE_LIMIT_WAIT_MS);
  }
  return Math.min(2 ** attempt * 250, 8_000);
}

async function errorMessage(response: Response, path: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `${response.status} on ${path}`;
  } catch {
    return `${response.status} on ${path}`;
  }
}

/** GET a LaunchDarkly API path through the Worker proxy. */
export async function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { signal, query, retries = 4 } = options;
  let attempt = 0;

  while (true) {
    const response = await fetch(buildUrl(path, query), {
      signal,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) return (await response.json()) as T;

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < retries) {
      const delay = retryDelayMs(response, attempt);
      attempt += 1;
      await sleep(delay, signal);
      continue;
    }

    throw new ApiError(response.status, await errorMessage(response, path), path);
  }
}

/**
 * Walk an offset-paginated collection until it is exhausted.
 * `pageSize` is capped by the endpoint; callers pass what the endpoint allows.
 */
export async function getAllPages<T>(
  path: string,
  options: RequestOptions & { pageSize?: number; maxItems?: number } = {},
): Promise<T[]> {
  const { pageSize = 100, maxItems = 5_000, ...rest } = options;
  const items: T[] = [];
  let offset = 0;

  while (items.length < maxItems) {
    const page = await get<Paginated<T>>(path, {
      ...rest,
      query: { ...rest.query, limit: pageSize, offset },
    });
    const batch = page.items ?? [];
    items.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (page.totalCount !== undefined && items.length >= page.totalCount) break;
  }

  return items.slice(0, maxItems);
}

export async function fetchIdentity(signal?: AbortSignal): Promise<CallerIdentity> {
  const response = await fetch('/api/me', { signal, credentials: 'same-origin' });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) throw new ApiError(response.status, 'Could not load session', '/api/me');
  return (await response.json()) as CallerIdentity;
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

export function loginUrl(returnTo = window.location.pathname): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
