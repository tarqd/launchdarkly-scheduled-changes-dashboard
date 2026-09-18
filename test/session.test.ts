import { describe, expect, it } from 'vitest';
import { type SessionData, seal, sealSession, unseal, unsealSession } from '../shared/session';

const SECRET = 'a-test-secret-that-is-long-enough';

function session(overrides: Partial<SessionData> = {}): SessionData {
  return {
    accessToken: 'ld-access-token',
    sessionExpiresAt: Date.now() + 60_000,
    instance: 'us',
    ...overrides,
  };
}

describe('seal / unseal', () => {
  it('round-trips a payload', async () => {
    const sealed = await seal({ hello: 'world', n: 7 }, SECRET);
    await expect(unseal<{ hello: string; n: number }>(sealed, SECRET)).resolves.toEqual({
      hello: 'world',
      n: 7,
    });
  });

  it('produces a cookie-safe string', async () => {
    const sealed = await seal({ token: 'a/b+c==' }, SECRET);
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('uses a fresh IV, so the same payload seals differently each time', async () => {
    const first = await seal({ same: true }, SECRET);
    const second = await seal({ same: true }, SECRET);
    expect(first).not.toBe(second);
  });

  it('rejects a payload sealed with a different secret', async () => {
    const sealed = await seal({ secret: 'value' }, SECRET);
    await expect(unseal(sealed, 'a-completely-different-secret')).resolves.toBeNull();
  });

  it('rejects tampered ciphertext', async () => {
    const sealed = await seal({ role: 'reader' }, SECRET);
    const tampered = `${sealed.slice(0, -4)}AAAA`;
    await expect(
      unseal(sealed === tampered ? `${sealed}AA` : tampered, SECRET),
    ).resolves.toBeNull();
  });

  it('rejects garbage', async () => {
    await expect(unseal('not-a-sealed-value', SECRET)).resolves.toBeNull();
    await expect(unseal('', SECRET)).resolves.toBeNull();
  });

  it('refuses to seal without a secret', async () => {
    await expect(seal({}, '')).rejects.toThrow('SESSION_SECRET');
  });
});

describe('unsealSession', () => {
  it('returns a live session', async () => {
    const data = session();
    const sealed = await sealSession(data, SECRET);
    await expect(unsealSession(sealed, SECRET)).resolves.toEqual(data);
  });

  it('rejects an expired session even when the ciphertext is valid', async () => {
    const sealed = await sealSession(session({ sessionExpiresAt: 1_000 }), SECRET);
    await expect(unsealSession(sealed, SECRET, 2_000)).resolves.toBeNull();
  });

  it('rejects a session with no access token', async () => {
    const sealed = await seal({ sessionExpiresAt: Date.now() + 60_000 }, SECRET);
    await expect(unsealSession(sealed, SECRET)).resolves.toBeNull();
  });
});
