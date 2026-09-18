/**
 * Session sealing.
 *
 * The LaunchDarkly access token never reaches the browser: it lives inside an
 * AES-GCM sealed blob in an httpOnly cookie, and only the Worker can open it.
 * WebCrypto only, so this runs unchanged on Workers and in Node for tests.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/**
 * How the session was established. This is not cosmetic: LaunchDarkly wants an
 * OAuth access token as `Authorization: Bearer <token>` and an API access token
 * as the bare `Authorization: <token>`, so the wrong one is a flat 401.
 */
export type AuthKind = 'oauth' | 'token';

export interface SessionData {
  /** OAuth access token, or a personal/service access token. */
  accessToken: string;
  /** Which kind of credential `accessToken` is. Absent in older cookies. */
  authKind?: AuthKind;
  /** Refresh token, when LaunchDarkly issues one. OAuth only. */
  refreshToken?: string;
  /** Epoch millis at which `accessToken` expires, when known. OAuth only. */
  expiresAt?: number;
  /** Epoch millis at which the session itself expires regardless of the token. */
  sessionExpiresAt: number;
  /** Which LaunchDarkly instance this session is against. */
  instance: 'us' | 'federal';
  /** Account/member identity from `GET /api/v2/caller-identity`. */
  accountId?: string;
  memberId?: string;
  email?: string;
  name?: string;
  /** For an API access token, its name in LaunchDarkly, when we can read it. */
  tokenName?: string;
  /** True when the credential belongs to a service token rather than a member. */
  serviceToken?: boolean;
}

/** The `Authorization` header value for a credential of the given kind. */
export function authorizationHeader(token: string, kind: AuthKind = 'oauth'): string {
  return kind === 'token' ? token : `Bearer ${token}`;
}

/** The `Authorization` header value for a loaded session. */
export function sessionAuthorization(session: SessionData): string {
  return authorizationHeader(session.accessToken, session.authKind ?? 'oauth');
}

async function importKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const digest = await crypto.subtle.digest('SHA-256', ENC.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypt an arbitrary JSON-serialisable payload into a cookie-safe string. */
export async function seal(payload: unknown, secret: string): Promise<string> {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENC.encode(JSON.stringify(payload)),
  );
  const joined = new Uint8Array(iv.length + ciphertext.byteLength);
  joined.set(iv, 0);
  joined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(joined);
}

/** Decrypt a sealed string. Returns `null` for anything tampered with or stale. */
export async function unseal<T>(sealed: string, secret: string): Promise<T | null> {
  try {
    const key = await importKey(secret);
    const joined = fromBase64Url(sealed);
    if (joined.length <= 12) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: joined.subarray(0, 12) },
      key,
      joined.subarray(12),
    );
    return JSON.parse(DEC.decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export async function sealSession(session: SessionData, secret: string): Promise<string> {
  return seal(session, secret);
}

export async function unsealSession(
  sealed: string,
  secret: string,
  now = Date.now(),
): Promise<SessionData | null> {
  const session = await unseal<SessionData>(sealed, secret);
  if (!session?.accessToken) return null;
  if (session.sessionExpiresAt <= now) return null;
  return session;
}
