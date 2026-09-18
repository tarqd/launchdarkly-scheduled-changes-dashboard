import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '../shared/constants';
import { type SessionData, sealSession, unsealSession } from '../shared/session';
import { parseCookies, serializeCookie } from './cookies';
import type { Env } from './env.d';
import { ldHost, refreshSession } from './oauth';

/**
 * Every LaunchDarkly path this app is allowed to read, anchored at both ends.
 * The dashboard is read-only, so the proxy is too: anything not matched here is
 * rejected before a request leaves the Worker, and only GET is ever forwarded.
 */
const ALLOWED_PATHS: RegExp[] = [
  /^caller-identity$/,
  /^projects$/,
  /^projects\/[^/]+$/,
  /^projects\/[^/]+\/environments$/,
  /^projects\/[^/]+\/environments\/[^/]+$/,
  /^flags\/[^/]+$/,
  /^flags\/[^/]+\/[^/]+$/,
  /^projects\/[^/]+\/flags\/[^/]+\/environments\/[^/]+\/scheduled-changes$/,
  /^projects\/[^/]+\/flags\/[^/]+\/environments\/[^/]+\/scheduled-changes\/[^/]+$/,
  /^projects\/[^/]+\/flags\/[^/]+\/environments\/[^/]+\/workflows$/,
  /^approval-requests$/,
  /^approval-requests\/[^/]+$/,
  /^members$/,
  /^members\/[^/]+$/,
];

export function isAllowedPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized.includes('..')) return false;
  return ALLOWED_PATHS.some((pattern) => pattern.test(normalized));
}

export interface LoadedSession {
  session: SessionData;
  /** Set when the session was refreshed and the cookie needs rewriting. */
  refreshedCookie?: string;
}

/** Read the session cookie, refreshing the access token when it has expired. */
export async function loadSession(request: Request, env: Env): Promise<LoadedSession | null> {
  const sealed = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE];
  if (!sealed) return null;

  const session = await unsealSession(sealed, env.SESSION_SECRET);
  if (!session) return null;

  const expiringSoon = session.expiresAt !== undefined && session.expiresAt - Date.now() < 60_000;
  if (!expiringSoon) return { session };

  const refreshed = await refreshSession(env, session);
  if (!refreshed) return null;

  const secure = new URL(request.url).protocol === 'https:';
  return {
    session: refreshed,
    refreshedCookie: serializeCookie(
      SESSION_COOKIE,
      await sealSession(refreshed, env.SESSION_SECRET),
      { maxAge: SESSION_MAX_AGE_SECONDS, secure, sameSite: 'Lax' },
    ),
  };
}

function json(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

/** GET /api/ld/<path> -> GET https://app.launchdarkly.com/api/v2/<path> */
export async function handleProxy(request: Request, env: Env, loaded: LoadedSession) {
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed', message: 'This proxy is read-only.' }, 405, {
      Allow: 'GET',
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/ld\/?/, '');
  if (!isAllowedPath(path)) {
    return json(
      { error: 'path_not_allowed', message: `The dashboard does not read /api/v2/${path}.` },
      403,
    );
  }

  const upstream = new URL(`${ldHost(env)}/api/v2/${path}`);
  upstream.search = url.search;

  const response = await fetch(upstream.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${loaded.session.accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'launchdarkly-scheduled-changes-dashboard',
    },
  });

  const headers = new Headers({
    'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  // Surface LaunchDarkly's rate-limit signals so the client can pace its scan.
  for (const header of ['X-Ratelimit-Reset', 'X-Ratelimit-Route-Remaining', 'Retry-After']) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }
  if (loaded.refreshedCookie) headers.append('Set-Cookie', loaded.refreshedCookie);

  return new Response(response.body, { status: response.status, headers });
}

/** GET /api/me - who is signed in, for the app shell. */
export function handleMe(loaded: LoadedSession): Response {
  const { session } = loaded;
  return json(
    {
      authenticated: true,
      instance: session.instance,
      accountId: session.accountId,
      memberId: session.memberId,
      email: session.email,
      name: session.name,
      sessionExpiresAt: session.sessionExpiresAt,
    },
    200,
    loaded.refreshedCookie ? { 'Set-Cookie': loaded.refreshedCookie } : undefined,
  );
}

export function unauthenticated(): Response {
  return json({ authenticated: false }, 401);
}
