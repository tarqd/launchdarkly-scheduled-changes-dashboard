import type { Filters } from '../components/FilterBar';
import type { ScheduledChangeRow } from './model';

/** Apply the filter bar to the scan result. Pure, so it is easy to test. */
export function applyFilters(
  rows: readonly ScheduledChangeRow[],
  filters: Filters,
  now = Date.now(),
): ScheduledChangeRow[] {
  const needle = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.projectKey !== 'all' && row.projectKey !== filters.projectKey) return false;
    if (filters.environmentKey !== 'all' && row.environmentKey !== filters.environmentKey) {
      return false;
    }
    if (filters.state !== 'all' && row.state !== filters.state) return false;
    if (filters.category !== 'all' && !row.categories.includes(filters.category)) return false;
    if (filters.hideExecuted && row.executionDate < now) return false;

    if (needle) {
      const haystack = [
        row.flagKey,
        row.flagName,
        row.projectKey,
        row.projectName,
        row.environmentKey,
        row.environmentName,
        row.title,
        row.description ?? '',
        ...row.detailLines,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}
