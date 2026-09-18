import {
  LD_HOSTS,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_CALLBACK_PATH,
  OAUTH_SCOPES,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  OAUTH_TOKEN_PATH,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '../shared/constants';
import { type SessionData, seal, sealSession, unseal } from '../shared/session';
import { clearCookie, parseCookies, serializeCookie } from './cookies';
import type { Env } from './env.d';

interface OAuthStatePayload {
  state: string;
  /** Same-origin path to return to once the flow completes. */
  returnTo: string;
  createdAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export function instanceOf(env: Env): 'us' | 'federal' {
  return env.LD_INSTANCE === 'federal' ? 'federal' : 'us';
}

export function ldHost(env: Env): string {
  return LD_HOSTS[instanceOf(env)];
}

/**
 * The origin to build the redirect URI from. LaunchDarkly matches the registered
 * redirect URI exactly and allows only one per client, so this has to be stable.
 */
export function publicOrigin(request: Request, env: Env): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export function redirectUri(request: Request, env: Env): string {
  return `${publicOrigin(request, env)}${OAUTH_CALLBACK_PATH}`;
}

function isSecureOrigin(origin: string): boolean {
  return origin.startsWith('https://');
}

/** Only allow returning to a path on this app, never to an absolute URL. */
function safeReturnTo(raw: string | null): string {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** GET /auth/login - stash state in a sealed cookie and bounce to LaunchDarkly. */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = publicOrigin(request, env);
  const state = crypto.randomUUID();
  const payload: OAuthStatePayload = {
    state,
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
    createdAt: Date.now(),
  };

  const authorize = new URL(`${ldHost(env)}${OAUTH_AUTHORIZE_PATH}`);
  authorize.searchParams.set('client_id', env.LD_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri(request, env));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': serializeCookie(OAUTH_STATE_COOKIE, await seal(payload, env.SESSION_SECRET), {
        maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
        secure: isSecureOrigin(origin),
        sameSite: 'Lax',
      }),
      'Cache-Control': 'no-store',
    },
  });
}

function errorRedirect(origin: string, message: string, secure: boolean): Response {
  const target = new URL(origin);
  target.pathname = '/';
  target.searchParams.set('auth_error', message);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Set-Cookie': clearCookie(OAUTH_STATE_COOKIE, { secure }),
      'Cache-Control': 'no-store',
    },
  });
}

/** POST the authorization code to LaunchDarkly and get an access token back. */
export async function exchangeCode(
  env: Env,
  params: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(`${ldHost(env)}${OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: env.LD_CLIENT_ID,
      client_secret: env.LD_CLIENT_SECRET,
      ...params,
    }).toString(),
  });

  const text = await response.text();
  let parsed: TokenResponse;
  try {
    parsed = JSON.parse(text) as TokenResponse;
  } catch {
    return { error: 'invalid_token_response', error_description: text.slice(0, 200) };
  }
  if (!response.ok && !parsed.error) parsed.error = `token_endpoint_${response.status}`;
  return parsed;
}

/** Ask LaunchDarkly who this token belongs to, so the UI can show the member. */
async function fetchIdentity(
  env: Env,
  accessToken: string,
): Promise<Pick<SessionData, 'accountId' | 'memberId' | 'email' | 'name'>> {
  const identity: Pick<SessionData, 'accountId' | 'memberId' | 'email' | 'name'> = {};
  const callerResponse = await fetch(`${ldHost(env)}/api/v2/caller-identity`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!callerResponse.ok) return identity;

  const caller = (await callerResponse.json()) as { accountId?: string; memberId?: string };
  identity.accountId = caller.accountId;
  identity.memberId = caller.memberId;
  if (!caller.memberId) return identity;

  const memberResponse = await fetch(`${ldHost(env)}/api/v2/members/${caller.memberId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!memberResponse.ok) return identity;

  const member = (await memberResponse.json()) as {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  identity.email = member.email;
  identity.name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
  return identity;
}

/** GET /auth/callback - verify state, exchange the code, set the session cookie. */
export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = publicOrigin(request, env);
  const secure = isSecureOrigin(origin);

  const denied = url.searchParams.get('error');
  if (denied) return errorRedirect(origin, denied, secure);

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || !returnedState) return errorRedirect(origin, 'missing_code', secure);

  const cookies = parseCookies(request.headers.get('Cookie'));
  const sealedState = cookies[OAUTH_STATE_COOKIE];
  const stored = sealedState
    ? await unseal<OAuthStatePayload>(sealedState, env.SESSION_SECRET)
    : null;
  if (!stored) return errorRedirect(origin, 'state_expired', secure);
  if (stored.state !== returnedState) return errorRedirect(origin, 'state_mismatch', secure);
  if (Date.now() - stored.createdAt > OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
    return errorRedirect(origin, 'state_expired', secure);
  }

  const token = await exchangeCode(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(request, env),
  });
  if (!token.access_token) {
    return errorRedirect(origin, token.error ?? 'token_exchange_failed', secure);
  }

  const now = Date.now();
  const session: SessionData = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? now + token.expires_in * 1000 : undefined,
    sessionExpiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
    instance: instanceOf(env),
    ...(await fetchIdentity(env, token.access_token)),
  };

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, await sealSession(session, env.SESSION_SECRET), {
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure,
      sameSite: 'Lax',
    }),
  );
  headers.append('Set-Cookie', clearCookie(OAUTH_STATE_COOKIE, { secure }));
  headers.set('Location', `${origin}${stored.returnTo}`);
  return new Response(null, { status: 302, headers });
}

/** POST /auth/logout - drop the cookie. The LaunchDarkly token is simply forgotten. */
export function handleLogout(request: Request, env: Env): Response {
  const secure = isSecureOrigin(publicOrigin(request, env));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(SESSION_COOKIE, { secure }),
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Swap a refresh token for a fresh access token. Returns the updated session, or
 * `null` when LaunchDarkly rejects the refresh (the caller should re-authorize).
 */
export async function refreshSession(env: Env, session: SessionData): Promise<SessionData | null> {
  if (!session.refreshToken) return null;
  const token = await exchangeCode(env, {
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  if (!token.access_token) return null;
  return {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? session.refreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
  };
}
