import { describe, expect, it } from 'vitest';
import { authorizationHeader, sessionAuthorization } from '../shared/session';
import { isSameOriginRequest } from '../worker/tokenLogin';

/**
 * LaunchDarkly wants an OAuth access token as `Bearer <token>` and an API
 * access token as the bare value. Getting this backwards is a flat 401 with no
 * useful message, so it is worth pinning down.
 */
describe('authorizationHeader', () => {
  it('prefixes an OAuth token with Bearer', () => {
    expect(authorizationHeader('oauth-token', 'oauth')).toBe('Bearer oauth-token');
  });

  it('sends an API access token raw', () => {
    expect(authorizationHeader('api-abc123', 'token')).toBe('api-abc123');
  });

  it('defaults to OAuth', () => {
    expect(authorizationHeader('some-token')).toBe('Bearer some-token');
  });
});

describe('sessionAuthorization', () => {
  const base = { accessToken: 'the-token', sessionExpiresAt: 0, instance: 'us' } as const;

  it('follows the session authKind', () => {
    expect(sessionAuthorization({ ...base, authKind: 'token' })).toBe('the-token');
    expect(sessionAuthorization({ ...base, authKind: 'oauth' })).toBe('Bearer the-token');
  });

  it('treats a session with no authKind as OAuth, for cookies sealed before it existed', () => {
    expect(sessionAuthorization({ ...base })).toBe('Bearer the-token');
  });
});

/** /auth/token hands out a session, so a cross-site POST must not reach it. */
describe('isSameOriginRequest', () => {
  const ORIGIN = 'https://changes.example.com';

  function request(headers: Record<string, string>) {
    return new Request(`${ORIGIN}/auth/token`, { method: 'POST', headers });
  }

  it('accepts a same-origin browser request', () => {
    expect(
      isSameOriginRequest(request({ Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' }), ORIGIN),
    ).toBe(true);
  });

  it('accepts a direct navigation, which reports Sec-Fetch-Site: none', () => {
    expect(isSameOriginRequest(request({ 'Sec-Fetch-Site': 'none' }), ORIGIN)).toBe(true);
  });

  it('rejects a cross-site request', () => {
    expect(isSameOriginRequest(request({ 'Sec-Fetch-Site': 'cross-site' }), ORIGIN)).toBe(false);
  });

  it('rejects a same-site-but-different-origin request', () => {
    expect(isSameOriginRequest(request({ 'Sec-Fetch-Site': 'same-site' }), ORIGIN)).toBe(false);
  });

  it('rejects a mismatched Origin even without Sec-Fetch-Site', () => {
    expect(isSameOriginRequest(request({ Origin: 'https://evil.example.com' }), ORIGIN)).toBe(
      false,
    );
  });

  it('allows a non-browser client that sends neither header', () => {
    expect(isSameOriginRequest(request({}), ORIGIN)).toBe(true);
  });
});
