import type { SessionData } from '../shared/session';
import type { Env } from './env.d';
import { ldHost } from './oauth';

/**
 * `GET /api/v2/caller-identity` is the one endpoint that answers "whose
 * credential is this?", and it works for OAuth access tokens and API access
 * tokens alike. It doubles as the validity check when someone signs in with a
 * token they pasted in.
 */

interface CallerIdentityResponse {
  accountId?: string;
  memberId?: string;
  tokenName?: string;
  serviceToken?: boolean;
  authKind?: string;
  tokenKind?: string;
}

export type Identity = Pick<
  SessionData,
  'accountId' | 'memberId' | 'email' | 'name' | 'tokenName' | 'serviceToken'
>;

export interface IdentityResult {
  ok: boolean;
  /** HTTP status from `caller-identity`, for reporting a rejected token. */
  status: number;
  identity: Identity;
}

/**
 * Resolve the caller, then fill in their name and email from the member record
 * when there is one. A failure to read the *member* is not a failure to
 * authenticate: a service token has no member, and a narrowly scoped token may
 * be unable to read `/members`. Only `caller-identity` decides `ok`.
 */
export async function fetchIdentity(env: Env, authorization: string): Promise<IdentityResult> {
  const identity: Identity = {};

  const callerResponse = await fetch(`${ldHost(env)}/api/v2/caller-identity`, {
    headers: { Authorization: authorization, Accept: 'application/json' },
  });
  if (!callerResponse.ok) {
    return { ok: false, status: callerResponse.status, identity };
  }

  const caller = (await callerResponse.json()) as CallerIdentityResponse;
  identity.accountId = caller.accountId;
  identity.memberId = caller.memberId;
  identity.tokenName = caller.tokenName;
  identity.serviceToken = caller.serviceToken;

  if (caller.memberId && !caller.serviceToken) {
    const memberResponse = await fetch(`${ldHost(env)}/api/v2/members/${caller.memberId}`, {
      headers: { Authorization: authorization, Accept: 'application/json' },
    });
    if (memberResponse.ok) {
      const member = (await memberResponse.json()) as {
        email?: string;
        firstName?: string;
        lastName?: string;
      };
      identity.email = member.email;
      identity.name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
    }
  }

  return { ok: true, status: callerResponse.status, identity };
}
