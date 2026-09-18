import { describe, expect, it } from 'vitest';
import { isAllowedPath } from '../worker/proxy';

/**
 * The allowlist is the security boundary of the proxy: it is what stops a
 * session token from being used for anything beyond what the dashboard reads.
 */
describe('isAllowedPath', () => {
  const allowed = [
    'caller-identity',
    'projects',
    'projects/default',
    'projects/default/environments',
    'projects/default/environments/production',
    'flags/default',
    'flags/default/my-flag',
    'projects/default/flags/my-flag/environments/production/scheduled-changes',
    'projects/default/flags/my-flag/environments/production/scheduled-changes/abc123',
    'approval-requests',
    'approval-requests/abc123',
    'members',
    'members/abc123',
  ];

  for (const path of allowed) {
    it(`allows ${path}`, () => {
      expect(isAllowedPath(path)).toBe(true);
      expect(isAllowedPath(`/${path}/`)).toBe(true);
    });
  }

  const denied = [
    '',
    'tokens',
    'webhooks',
    'account',
    'oauth/clients',
    'projects/default/flags/my-flag/environments/production/scheduled-changes/../../../tokens',
    'projects/default/environments/production/apiKey',
    'segments/default/production',
    'projects/default/flags',
    'usage/streams',
  ];

  for (const path of denied) {
    it(`denies ${path || '(empty)'}`, () => {
      expect(isAllowedPath(path)).toBe(false);
    });
  }

  it('does not let a suffix widen a permitted prefix', () => {
    expect(isAllowedPath('approval-requests-secret')).toBe(false);
    expect(isAllowedPath('projects/default/environments/production/secret')).toBe(false);
  });
});
