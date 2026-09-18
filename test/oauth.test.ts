import { describe, expect, it } from 'vitest';
import type { Env } from '../worker/env.d';
import { instanceOf, ldHost, publicOrigin, redirectUri } from '../worker/oauth';

function env(overrides: Partial<Env> = {}): Env {
  return {
    LD_CLIENT_ID: 'client-id',
    LD_CLIENT_SECRET: 'client-secret',
    SESSION_SECRET: 'session-secret',
    ASSETS: {} as Env['ASSETS'],
    ...overrides,
  };
}

const request = new Request('https://scheduled-changes.example.workers.dev/auth/login');

/**
 * LaunchDarkly matches the registered redirect URI exactly and allows one per
 * client, so getting this wrong is an opaque failure at the token endpoint.
 */
describe('redirectUri', () => {
  it('uses LD_REDIRECT_URI verbatim when set', () => {
    const configured = 'https://changes.example.com/auth/callback';
    expect(redirectUri(request, env({ LD_REDIRECT_URI: configured }))).toBe(configured);
  });

  it('prefers LD_REDIRECT_URI over PUBLIC_ORIGIN and the request', () => {
    const configured = 'https://changes.example.com/auth/callback';
    expect(
      redirectUri(
        request,
        env({ LD_REDIRECT_URI: configured, PUBLIC_ORIGIN: 'https://elsewhere.example.com' }),
      ),
    ).toBe(configured);
  });

  it('falls back to PUBLIC_ORIGIN, tolerating a trailing slash', () => {
    expect(redirectUri(request, env({ PUBLIC_ORIGIN: 'https://changes.example.com/' }))).toBe(
      'https://changes.example.com/auth/callback',
    );
  });

  it('falls back to the request origin when nothing is configured', () => {
    expect(redirectUri(request, env())).toBe(
      'https://scheduled-changes.example.workers.dev/auth/callback',
    );
  });
});

describe('publicOrigin', () => {
  it('derives the origin from LD_REDIRECT_URI when PUBLIC_ORIGIN is unset', () => {
    expect(
      publicOrigin(request, env({ LD_REDIRECT_URI: 'https://changes.example.com/auth/callback' })),
    ).toBe('https://changes.example.com');
  });

  it('prefers PUBLIC_ORIGIN', () => {
    expect(
      publicOrigin(
        request,
        env({
          PUBLIC_ORIGIN: 'https://front.example.com',
          LD_REDIRECT_URI: 'https://changes.example.com/auth/callback',
        }),
      ),
    ).toBe('https://front.example.com');
  });
});

describe('instanceOf / ldHost', () => {
  it('defaults to the commercial instance', () => {
    expect(instanceOf(env())).toBe('us');
    expect(ldHost(env())).toBe('https://app.launchdarkly.com');
  });

  it('honours the federal instance', () => {
    expect(instanceOf(env({ LD_INSTANCE: 'federal' }))).toBe('federal');
    expect(ldHost(env({ LD_INSTANCE: 'federal' }))).toBe('https://app.launchdarkly.us');
  });

  it('treats an unrecognised value as the commercial instance', () => {
    expect(instanceOf(env({ LD_INSTANCE: 'nonsense' }))).toBe('us');
  });
});
