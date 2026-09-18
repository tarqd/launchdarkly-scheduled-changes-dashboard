import {
  Alert,
  AlertText,
  Button,
  EmptyState,
  Heading,
  IconButton,
  Separator,
  Text,
} from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { fetchAuthMethods, fetchIdentity, logout } from './api/client';
import type { AuthMethods, CallerIdentity } from './api/types';
import { Agenda } from './components/Agenda';
import { ChangeTable } from './components/ChangeTable';
import { DEFAULT_FILTERS, FilterBar, type Filters } from './components/FilterBar';
import { LoginScreen } from './components/LoginScreen';
import { ScanErrors, ScanProgressPanel } from './components/ScanProgressPanel';
import { computeStats, StatTiles } from './components/StatTiles';
import { UpcomingVolumeChart } from './components/UpcomingVolumeChart';
import { useScheduledChanges } from './hooks/useScheduledChanges';
import { useTheme } from './hooks/useTheme';
import { applyFilters } from './lib/filter';
import type { InstructionCategory } from './lib/instructions';
import { formatDateTime } from './lib/time';

function authErrorFromUrl(): string | null {
  const error = new URLSearchParams(window.location.search).get('auth_error');
  if (error) {
    // Keep the address bar clean once the message has been read.
    const url = new URL(window.location.href);
    url.searchParams.delete('auth_error');
    window.history.replaceState({}, '', url);
  }
  return error;
}

export function App() {
  const [identity, setIdentity] = useState<CallerIdentity | null>(null);
  const [methods, setMethods] = useState<AuthMethods>({ oauth: true, token: true });
  const [authError] = useState<string | null>(authErrorFromUrl);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    fetchIdentity(controller.signal)
      .then(setIdentity)
      .catch(() => setIdentity({ authenticated: false }));
    fetchAuthMethods(controller.signal)
      .then(setMethods)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (identity === null) {
    return (
      <main className="login">
        <div className="card login__card" role="status" aria-live="polite">
          <Text>Checking your LaunchDarkly session…</Text>
        </div>
      </main>
    );
  }

  if (!identity.authenticated) return <LoginScreen authError={authError} methods={methods} />;

  return <Dashboard identity={identity} theme={theme} onToggleTheme={toggleTheme} />;
}

/**
 * Who the session belongs to. With an access token there may be no member at
 * all (a service token), so fall back to the token's name — it matters, because
 * the credential decides what the scan can see.
 */
function signedInAs(identity: CallerIdentity): string {
  if (identity.name ?? identity.email) return (identity.name ?? identity.email) as string;
  if (identity.authKind === 'token') {
    const label = identity.serviceToken ? 'service token' : 'access token';
    return identity.tokenName ? `${identity.tokenName} (${label})` : `Signed in with an ${label}`;
  }
  return 'Signed in';
}

interface DashboardProps {
  identity: CallerIdentity;
  theme: 'default' | 'dark';
  onToggleTheme: () => void;
}

function Dashboard({ identity, theme, onToggleTheme }: DashboardProps) {
  const instance = identity.instance ?? 'us';
  const { result, progress, error, isUnauthorized, isScanning, scan, cancel } =
    useScheduledChanges(instance);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const now = result?.scannedAt ?? Date.now();

  // The first scan covers every project and environment. Narrow with the filter
  // bar, then rescan to make the next pass cheaper.
  useEffect(() => {
    void scan({ projectKeys: [], environmentKeys: [] });
  }, [scan]);

  const rows = result?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters, now), [rows, filters, now]);
  // The tiles ignore `hideExecuted`, otherwise "Past due: 0" would be a lie the
  // moment the default filter hides the very rows the tile is counting.
  const inScope = useMemo(
    () => applyFilters(rows, { ...filters, hideExecuted: false }, now),
    [rows, filters, now],
  );
  const stats = useMemo(() => computeStats(inScope, now), [inScope, now]);

  const environments = useMemo(() => {
    if (!result) return [];
    if (filters.projectKey !== 'all') {
      return result.environmentsByProject.get(filters.projectKey) ?? [];
    }
    const byKey = new Map<string, { key: string; name: string }>();
    for (const list of result.environmentsByProject.values()) {
      for (const environment of list) byKey.set(environment.key, environment);
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [result, filters.projectKey]);

  const categories = useMemo(() => {
    const present = new Set<InstructionCategory>();
    for (const row of rows) for (const category of row.categories) present.add(category);
    return [...present].sort();
  }, [rows]);

  const rescan = () => {
    void scan({
      projectKeys: filters.projectKey === 'all' ? [] : [filters.projectKey],
      environmentKeys: filters.environmentKey === 'all' ? [] : [filters.environmentKey],
    });
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <Icon name="calendar-schedule" size="large" aria-hidden="true" />
          <div className="app__brand-text">
            <Heading size="small" level={1}>
              Scheduled changes
            </Heading>
            <Text size="small" elementType="span">
              {signedInAs(identity)}
              {result ? ` · scanned ${formatDateTime(result.scannedAt)}` : ''}
            </Text>
          </div>
        </div>

        <div className="app__header-spacer" />

        <div className="app__header-actions">
          <IconButton
            icon={theme === 'dark' ? 'theme-light' : 'theme-dark'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            variant="minimal"
            onPress={onToggleTheme}
          />
          {isScanning ? (
            <Button variant="default" onPress={cancel}>
              Stop scan
            </Button>
          ) : null}
          <Button
            variant="minimal"
            onPress={() => {
              void logout().then(() => window.location.reload());
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="app__main">
        {isUnauthorized ? (
          <Alert status="error">
            <AlertText>
              <Heading size="small" level={2}>
                Your session expired
              </Heading>
              <Text size="small">Sign in again to keep reading scheduled changes.</Text>
            </AlertText>
          </Alert>
        ) : null}

        {error && !isUnauthorized ? (
          <Alert status="error" isDismissable>
            <AlertText>
              <Heading size="small" level={2}>
                The scan stopped early
              </Heading>
              <Text size="small">{error}</Text>
            </AlertText>
          </Alert>
        ) : null}

        {isScanning && progress ? <ScanProgressPanel progress={progress} /> : null}
        {result ? <ScanErrors errors={result.errors} /> : null}

        <StatTiles stats={stats} />

        <section className="card" aria-labelledby="filters-heading">
          <Heading id="filters-heading" size="small" level={2} className="visually-hidden">
            Filters
          </Heading>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            projects={result?.projects ?? []}
            environments={environments}
            categories={categories}
            onRefresh={rescan}
            isRefreshing={isScanning}
          />
        </section>

        <section className="card" aria-labelledby="volume-heading">
          <div className="card__header">
            <div className="card__title-group">
              <Heading id="volume-heading" size="small" level={2}>
                Scheduled changes per day
              </Heading>
              <Text size="small">Next three weeks, by execution date</Text>
            </div>
          </div>
          <UpcomingVolumeChart rows={filtered} now={now} />
        </section>

        <section className="card" aria-labelledby="agenda-heading">
          <div className="card__header">
            <div className="card__title-group">
              <Heading id="agenda-heading" size="small" level={2}>
                What happens next
              </Heading>
              <Text size="small">
                {filtered.length} change{filtered.length === 1 ? '' : 's'} in scope
              </Text>
            </div>
          </div>

          {filtered.length === 0 && !isScanning ? (
            <EmptyState>
              <Heading size="small" level={3}>
                Nothing scheduled
              </Heading>
              <Text size="small">
                {rows.length === 0
                  ? 'This account has no scheduled changes or future-dated approval requests.'
                  : 'No changes match the current filters.'}
              </Text>
            </EmptyState>
          ) : (
            <Agenda rows={filtered} now={now} />
          )}
        </section>

        {filtered.length > 0 ? (
          <section className="card" aria-labelledby="table-heading">
            <div className="card__header">
              <div className="card__title-group">
                <Heading id="table-heading" size="small" level={2}>
                  All changes
                </Heading>
                <Text size="small">Sortable table view of the same data</Text>
              </div>
            </div>
            <ChangeTable rows={filtered} now={now} />
          </section>
        ) : null}
      </main>

      <Separator />
      <footer className="app__footer">
        <Text size="small">
          Read-only view built on the LaunchDarkly REST API
          {result
            ? ` · ${result.requestCount.toLocaleString()} flag/environment pairs scanned`
            : ''}
        </Text>
      </footer>
    </div>
  );
}
