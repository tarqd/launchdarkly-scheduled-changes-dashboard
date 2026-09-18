export interface CookieOptions {
  maxAge?: number;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const { maxAge, path = '/', secure = true, httpOnly = true, sameSite = 'Lax' } = options;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
    parts.push(`Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`);
  }
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name: string, options: CookieOptions = {}): string {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}
