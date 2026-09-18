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
   * Public origin of this deployment, e.g. `https://scheduled-changes.example.workers.dev`.
   * Only needed when the Worker sits behind a proxy that rewrites the Host header;
   * otherwise the request URL is used.
   */
  PUBLIC_ORIGIN?: string;
  /** Static assets binding produced by the `assets` block in wrangler.jsonc. */
  ASSETS: Fetcher;
}
