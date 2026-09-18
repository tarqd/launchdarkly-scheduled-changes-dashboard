/**
 * Values shared by the Worker (OAuth + proxy) and the browser app.
 * Keep this module free of platform-specific APIs.
 */

/** The LaunchDarkly instance to talk to. `us` is the commercial instance. */
export type LDInstance = 'us' | 'federal';

export const LD_HOSTS: Record<LDInstance, string> = {
  us: 'https://app.launchdarkly.com',
  federal: 'https://app.launchdarkly.us',
};

/** Where the LaunchDarkly UI lives, for deep links back into the product. */
export const LD_APP_HOSTS = LD_HOSTS;

/** OAuth endpoints, relative to the instance host. */
export const OAUTH_AUTHORIZE_PATH = '/trust/oauth/authorize';
export const OAUTH_TOKEN_PATH = '/trust/oauth/token';

/**
 * The only scope this app needs. `reader` grants read access to everything the
 * authorizing member can already read; the app never writes.
 */
export const OAUTH_SCOPES = ['reader'] as const;

/** Path the OAuth client must be registered with as its redirect URI. */
export const OAUTH_CALLBACK_PATH = '/auth/callback';

export const SESSION_COOKIE = 'ldsc_session';
export const OAUTH_STATE_COOKIE = 'ldsc_oauth';

/** Sessions are capped independently of the LaunchDarkly token lifetime. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
