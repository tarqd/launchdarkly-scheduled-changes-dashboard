import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '../shared/constants';
import { authorizationHeader, type SessionData, sealSession } from '../shared/session';
import { serializeCookie } from './cookies';
import type { Env } from './env.d';
import { fetchIdentity } from './identity';
import { instanceOf, publicOrigin } from './oauth';

/**
 * Signing in with an API access token.
 *
 * The OAuth flow is the better default — it is scoped to the authorizing
 * member's own permissions and it needs no long-lived secret pasted anywhere —
 * but it requires registering an OAuth client, which needs admin access. A
 * personal access token gets someone to the dashboard without that, and it is
 * the only option when the app is run locally against an account you cannot
 * register a client on.
 *
 * The token is treated exactly like an OAuth token once accepted: validated
 * against `caller-identity`, sealed into the same httpOnly cookie, and never
 * sent back to the browser.
 */

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  const merged = new Headers(headers);
  merged.set('Content-Type', 'application/json');
  merged.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: merged });
}

/**
 * This endpoint hands out a session, so a cross-site POST must not reach it.
 * Requiring a JSON content type already blocks HTML form CSRF (a form can only
 * send urlencoded, multipart, or text/plain), and the origin check covers the
 * rest. `Sec-Fetch-Site` is the modern signal; the `Origin` comparison is the
 * fallback for anything that does not send it.
 */
export function isSameOriginRequest(request: Request, expectedOrigin: string): boolean {
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const origin = request.headers.get('Origin');
  if (origin && origin !== expectedOrigin) return false;

  // Neither header present: a non-browser client, which cannot be a CSRF victim.
  return true;
}

/**
 * LaunchDarkly access tokens are `api-<uuid>`, and service tokens follow the
 * same shape. Reject anything obviously not a token before spending a request
 * on it, but stay loose: the check is a typo guard, not a validator, and
 * `caller-identity` is the real authority.
 */
function looksLikeToken(value: string): boolean {
  return value.length >= 16 && value.length <= 512 && !/\s/.test(value);
}

/** POST /auth/token — body `{ "token": "api-…" }`. */
export async function handleTokenLogin(request: Request, env: Env): Promise<Response> {
  const origin = publicOrigin(request, env);

  if (!isSameOriginRequest(request, origin)) {
    return json({ error: 'cross_origin', message: 'Cross-origin sign-in is not allowed.' }, 403);
  }

  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return json(
      { error: 'unsupported_media_type', message: 'Send a JSON body: {"token":"…"}.' },
      415,
    );
  }

  let token: string;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === 'string' ? body.token.trim() : '';
  } catch {
    return json({ error: 'invalid_body', message: 'Could not parse the request body.' }, 400);
  }

  if (!token) {
    return json({ error: 'missing_token', message: 'Enter an access token.' }, 400);
  }
  if (!looksLikeToken(token)) {
    return json(
      {
        error: 'malformed_token',
        message: 'That does not look like a LaunchDarkly access token.',
      },
      400,
    );
  }

  const result = await fetchIdentity(env, authorizationHeader(token, 'token'));
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      return json(
        {
          error: 'token_rejected',
          message: 'LaunchDarkly rejected that token. Check it has not been revoked.',
        },
        401,
      );
    }
    return json(
      { error: 'verification_failed', message: `LaunchDarkly returned ${result.status}.` },
      502,
    );
  }

  const session: SessionData = {
    accessToken: token,
    authKind: 'token',
    // An API access token has no expiry we can see, so the session's own cap is
    // the only bound: the cookie ages out and the token has to be entered again.
    sessionExpiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    instance: instanceOf(env),
    ...result.identity,
  };

  return json({ ok: true }, 200, {
    'Set-Cookie': serializeCookie(SESSION_COOKIE, await sealSession(session, env.SESSION_SECRET), {
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: origin.startsWith('https://'),
      sameSite: 'Lax',
    }),
  });
}
