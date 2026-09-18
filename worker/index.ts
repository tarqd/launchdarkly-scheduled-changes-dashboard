import type { Env } from './env.d';
import { handleCallback, handleLogin, handleLogout } from './oauth';
import { handleMe, handleProxy, loadSession, unauthenticated } from './proxy';

function missingConfig(env: Env): string[] {
  return (['LD_CLIENT_ID', 'LD_CLIENT_SECRET', 'SESSION_SECRET'] as const).filter(
    (key) => !env[key],
  );
}

function configError(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'not_configured',
      message: `Missing ${missing.join(', ')}. See the README for OAuth client setup.`,
    }),
    { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
      const missing = missingConfig(env);
      if (missing.length) return configError(missing);
    }

    if (pathname === '/auth/login') return handleLogin(request, env);
    if (pathname === '/auth/callback') return handleCallback(request, env);
    if (pathname === '/auth/logout') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      }
      return handleLogout(request, env);
    }

    if (pathname === '/api/me' || pathname.startsWith('/api/ld/')) {
      const loaded = await loadSession(request, env);
      if (!loaded) return unauthenticated();
      if (pathname === '/api/me') return handleMe(loaded);
      return handleProxy(request, env, loaded);
    }

    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
