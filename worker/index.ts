import type { Env } from './env.d';
import { handleCallback, handleLogin, handleLogout, publicOrigin } from './oauth';
import { handleMe, handleProxy, loadSession, unauthenticated } from './proxy';
import { handleTokenLogin, isSameOriginRequest } from './tokenLogin';

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  const merged = new Headers(headers);
  merged.set('Content-Type', 'application/json');
  merged.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: merged });
}

/**
 * Only the OAuth routes need a registered client. Token sign-in and the proxy
 * work with `SESSION_SECRET` alone, so an account where you cannot register an
 * OAuth client can still run this with nothing but a personal access token.
 */
function configError(missing: string[], what: string): Response {
  return json(
    {
      error: 'not_configured',
      message: `Missing ${missing.join(', ')}. ${what}`,
    },
    500,
  );
}

function missing(env: Env, keys: readonly (keyof Env)[]): string[] {
  return keys.filter((key) => !env[key]).map(String);
}

/** Which sign-in methods this deployment can actually offer. */
function authMethods(env: Env) {
  return {
    oauth: Boolean(env.LD_CLIENT_ID && env.LD_CLIENT_SECRET && env.SESSION_SECRET),
    token: Boolean(env.SESSION_SECRET),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const isAuthRoute = pathname.startsWith('/auth/');
    const isApiRoute = pathname.startsWith('/api/');

    // Everything that touches a session needs the sealing key.
    if (isAuthRoute || isApiRoute) {
      const missingSecret = missing(env, ['SESSION_SECRET']);
      if (missingSecret.length) {
        return configError(missingSecret, 'Generate one with `openssl rand -hex 32`.');
      }
    }

    // Lets the sign-in screen show only the methods that are configured.
    if (pathname === '/api/auth-methods') {
      return json(authMethods(env), 200);
    }

    if (pathname === '/auth/login' || pathname === '/auth/callback') {
      const missingOAuth = missing(env, ['LD_CLIENT_ID', 'LD_CLIENT_SECRET']);
      if (missingOAuth.length) {
        return configError(
          missingOAuth,
          'See the README for OAuth client setup, or sign in with an access token instead.',
        );
      }
      return pathname === '/auth/login' ? handleLogin(request, env) : handleCallback(request, env);
    }

    if (pathname === '/auth/token') {
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
      }
      return handleTokenLogin(request, env);
    }

    if (pathname === '/auth/logout') {
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
      }
      // Signing someone out cross-site is only a nuisance, but there is no
      // reason to allow it either.
      if (!isSameOriginRequest(request, publicOrigin(request, env))) {
        return json({ error: 'cross_origin' }, 403);
      }
      return handleLogout(request, env);
    }

    if (pathname === '/api/me' || pathname.startsWith('/api/ld/')) {
      const loaded = await loadSession(request, env);
      if (!loaded) return unauthenticated();
      if (pathname === '/api/me') return handleMe(loaded);
      return handleProxy(request, env, loaded);
    }

    if (isApiRoute || isAuthRoute) {
      return json({ error: 'not_found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
