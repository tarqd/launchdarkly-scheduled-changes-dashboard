export interface Env {
  /** OAuth client id from `POST /api/v2/oauth/clients`. */
  LD_CLIENT_ID: string;
  /** OAuth client secret. Store with `wrangler secret put LD_CLIENT_SECRET`. */
  LD_CLIENT_SECRET: string;
  /** Random string used to seal the session cookie. `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
  /** `us` (default) or `federal`. */
  LD_INSTANCE?: string;
  /**
   * The redirect URI exactly as registered on the OAuth client, e.g.
   * `https://scheduled-changes.example.workers.dev/auth/callback`. Strongly
   * recommended: LaunchDarkly matches it exactly and allows only one per client.
   * When unset it is derived from `PUBLIC_ORIGIN` or the request origin.
   */
  LD_REDIRECT_URI?: string;
  /**
   * Public origin of this deployment. Only needed when `LD_REDIRECT_URI` is unset
   * and something in front of the Worker rewrites the Host header.
   */
  PUBLIC_ORIGIN?: string;
  /** Static assets binding produced by the `assets` block in wrangler.jsonc. */
  ASSETS: Fetcher;
}
