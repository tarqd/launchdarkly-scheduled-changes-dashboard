import { describe, expect, it } from 'vitest';
import {
  dedupeRows,
  flagUrl,
  fromApprovalRequest,
  fromScheduledChange,
  parseResourceId,
  type ScheduledChangeRow,
  seriesOf,
} from '../src/lib/model';

const NOW = 1_700_000_000_000;

const context = {
  instance: 'us' as const,
  projectKey: 'default',
  projectName: 'Default',
  environmentKey: 'production',
  environmentName: 'Production',
  flagKey: 'checkout-v2',
  flagName: 'Checkout v2',
  now: NOW,
};

describe('fromScheduledChange', () => {
  it('normalises a scheduled change', () => {
    const row = fromScheduledChange(
      {
        _id: 'abc123',
        _creationDate: NOW - 1_000,
        _version: 1,
        executionDate: NOW + 3_600_000,
        instructions: [{ kind: 'turnFlagOn' }],
      },
      context,
    );

    expect(row.source).toBe('scheduled-change');
    expect(row.state).toBe('scheduled');
    expect(row.title).toBe('Turn targeting on');
    expect(row.flagKey).toBe('checkout-v2');
    expect(row.id).toBe('sc:default:production:checkout-v2:abc123');
    expect(row.href).toContain('/projects/default/flags/checkout-v2/targeting');
  });

  it('marks a change past its execution date as overdue', () => {
    const row = fromScheduledChange(
      { _id: 'x', _creationDate: 0, _version: 1, executionDate: NOW - 1, instructions: [] },
      context,
    );
    expect(row.state).toBe('overdue');
  });

  it('conflicts outrank an overdue date', () => {
    const row = fromScheduledChange(
      {
        _id: 'x',
        _creationDate: 0,
        _version: 1,
        executionDate: NOW - 1,
        instructions: [{ kind: 'turnFlagOff' }],
        conflicts: [{ reason: 'another change turns it on first' }],
      },
      context,
    );
    expect(row.state).toBe('conflicted');
  });
});

describe('parseResourceId', () => {
  it('splits a flag resource identifier', () => {
    expect(parseResourceId('proj/my-project:env/production:flag/my-flag')).toEqual({
      projectKey: 'my-project',
      environmentKey: 'production',
      flagKey: 'my-flag',
    });
  });

  it('tolerates a missing or partial identifier', () => {
    expect(parseResourceId(undefined)).toEqual({});
    expect(parseResourceId('proj/only-a-project')).toEqual({ projectKey: 'only-a-project' });
  });
});

describe('fromApprovalRequest', () => {
  const options = { instance: 'us' as const, now: NOW };

  it('drops approval requests with no execution date', () => {
    expect(
      fromApprovalRequest({ _id: 'a1', resourceId: 'proj/p:env/e:flag/f' }, options),
    ).toBeNull();
  });

  it('prefers expanded project, flag and environment names', () => {
    const row = fromApprovalRequest(
      {
        _id: 'a1',
        executionDate: NOW + 60_000,
        resourceId: 'proj/p:env/e:flag/f',
        reviewStatus: 'pending',
        status: 'pending',
        instructions: [{ kind: 'turnFlagOn' }],
        project: { key: 'p', name: 'Payments' },
        flag: { key: 'f', name: 'Fancy flag' },
        environments: [{ key: 'e', name: 'Staging' }],
      },
      options,
    );

    expect(row?.projectName).toBe('Payments');
    expect(row?.flagName).toBe('Fancy flag');
    expect(row?.environmentName).toBe('Staging');
    expect(row?.state).toBe('awaiting-approval');
  });

  it('falls back to the resource id when nothing is expanded', () => {
    const row = fromApprovalRequest(
      {
        _id: 'a2',
        executionDate: NOW + 60_000,
        resourceId: 'proj/p:env/e:flag/f',
        reviewStatus: 'approved',
        status: 'scheduled',
      },
      options,
    );
    expect(row?.projectKey).toBe('p');
    expect(row?.environmentKey).toBe('e');
    expect(row?.flagKey).toBe('f');
    expect(row?.state).toBe('approved');
  });

  it('reports a declined review', () => {
    const row = fromApprovalRequest(
      {
        _id: 'a3',
        executionDate: NOW + 60_000,
        resourceId: 'proj/p:env/e:flag/f',
        reviewStatus: 'declined',
      },
      options,
    );
    expect(row?.state).toBe('declined');
  });
});

describe('dedupeRows', () => {
  function row(overrides: Partial<ScheduledChangeRow>): ScheduledChangeRow {
    return {
      id: 'id',
      source: 'scheduled-change',
      projectKey: 'p',
      projectName: 'P',
      environmentKey: 'e',
      environmentName: 'E',
      flagKey: 'f',
      flagName: 'F',
      executionDate: NOW,
      instructions: [],
      title: 'Turn targeting on',
      detailLines: [],
      category: 'kill-switch',
      categories: ['kill-switch'],
      state: 'scheduled',
      conflicts: [],
      href: '#',
      ...overrides,
    };
  }

  it('prefers the approval row when both describe the same event', () => {
    const merged = dedupeRows([
      row({ id: 'sc:1', source: 'scheduled-change' }),
      row({ id: 'ar:1', source: 'approval-request', state: 'awaiting-approval' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('approval-request');
  });

  it('keeps distinct events and sorts them by execution date', () => {
    const merged = dedupeRows([
      row({ id: 'b', executionDate: NOW + 2_000 }),
      row({ id: 'a', executionDate: NOW + 1_000 }),
    ]);
    expect(merged.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('seriesOf', () => {
  it('puts only approval-blocked rows in the awaiting series', () => {
    expect(seriesOf({ state: 'awaiting-approval' } as ScheduledChangeRow)).toBe('awaitingApproval');
    expect(seriesOf({ state: 'scheduled' } as ScheduledChangeRow)).toBe('scheduled');
    expect(seriesOf({ state: 'conflicted' } as ScheduledChangeRow)).toBe('scheduled');
  });
});

describe('flagUrl', () => {
  it('points at the right instance and escapes keys', () => {
    expect(flagUrl('us', 'my proj', 'my flag', 'prod')).toBe(
      'https://app.launchdarkly.com/projects/my%20proj/flags/my%20flag/targeting?env=prod&selected-env=prod',
    );
    expect(flagUrl('federal', 'p', 'f', 'e')).toContain('https://app.launchdarkly.us/');
  });
});
