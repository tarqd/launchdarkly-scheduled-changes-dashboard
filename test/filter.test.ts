import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '../src/components/FilterBar';
import { applyFilters } from '../src/lib/filter';
import type { ScheduledChangeRow } from '../src/lib/model';

const NOW = 1_700_000_000_000;

function row(overrides: Partial<ScheduledChangeRow> = {}): ScheduledChangeRow {
  return {
    id: 'id',
    source: 'scheduled-change',
    projectKey: 'payments',
    projectName: 'Payments',
    environmentKey: 'production',
    environmentName: 'Production',
    flagKey: 'checkout-v2',
    flagName: 'Checkout v2',
    executionDate: NOW + 60_000,
    instructions: [],
    title: 'Turn targeting on',
    detailLines: ['Turn targeting on'],
    category: 'kill-switch',
    categories: ['kill-switch'],
    state: 'scheduled',
    conflicts: [],
    href: '#',
    ...overrides,
  };
}

describe('applyFilters', () => {
  it('passes everything through by default', () => {
    const rows = [row(), row({ id: 'b', projectKey: 'web' })];
    expect(applyFilters(rows, DEFAULT_FILTERS, NOW)).toHaveLength(2);
  });

  it('filters by project and environment', () => {
    const rows = [row(), row({ id: 'b', projectKey: 'web', environmentKey: 'staging' })];
    expect(
      applyFilters(rows, { ...DEFAULT_FILTERS, projectKey: 'web' }, NOW).map((r) => r.id),
    ).toEqual(['b']);
    expect(
      applyFilters(rows, { ...DEFAULT_FILTERS, environmentKey: 'production' }, NOW).map(
        (r) => r.id,
      ),
    ).toEqual(['id']);
  });

  it('matches a category anywhere in the instruction list, not just the first', () => {
    const rows = [row({ category: 'kill-switch', categories: ['kill-switch', 'targeting'] })];
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, category: 'targeting' }, NOW)).toHaveLength(1);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, category: 'rules' }, NOW)).toHaveLength(0);
  });

  it('hides past-due rows only when asked', () => {
    const rows = [row({ executionDate: NOW - 1 })];
    expect(applyFilters(rows, DEFAULT_FILTERS, NOW)).toHaveLength(0);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, hideExecuted: false }, NOW)).toHaveLength(1);
  });

  it('searches keys, names and instruction text, case-insensitively', () => {
    const rows = [row()];
    for (const search of ['CHECKOUT', 'Payments', 'targeting on', 'production']) {
      expect(applyFilters(rows, { ...DEFAULT_FILTERS, search }, NOW)).toHaveLength(1);
    }
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, search: 'nonexistent' }, NOW)).toHaveLength(0);
  });

  it('filters by state', () => {
    const rows = [row(), row({ id: 'b', state: 'awaiting-approval' })];
    expect(
      applyFilters(rows, { ...DEFAULT_FILTERS, state: 'awaiting-approval' }, NOW).map((r) => r.id),
    ).toEqual(['b']);
  });
});
