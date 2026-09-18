import { ApiError, get, getAllPages } from '../api/client';
import type {
  ApprovalRequest,
  Environment,
  FeatureFlagScheduledChange,
  FeatureFlagSummary,
  Paginated,
  Project,
} from '../api/types';
import {
  dedupeRows,
  fromApprovalRequest,
  fromScheduledChange,
  type ScheduledChangeRow,
} from './model';
import { mapPool } from './pool';

/**
 * LaunchDarkly has no "all scheduled changes" endpoint: scheduled changes are
 * read per flag *and* per environment. So the dashboard scans.
 *
 * Two things make that affordable:
 *  - account-wide approval requests come from one paginated endpoint, and
 *  - the per-flag fan-out runs at bounded concurrency through the Worker proxy,
 *    which keeps the token server-side and keeps each Worker invocation to a
 *    single subrequest.
 *
 * Narrowing the environment list is the big lever: cost is flags x environments,
 * so scanning only production is 4x cheaper than scanning every environment.
 */

export const DEFAULT_CONCURRENCY = 8;

export interface ScanScope {
  /** Project keys to scan. Empty means every project. */
  projectKeys: string[];
  /** Environment keys to scan within each project. Empty means every environment. */
  environmentKeys: string[];
  /** Include archived flags. Off by default: they cannot have pending changes. */
  includeArchived?: boolean;
  concurrency?: number;
}

export interface ScanProgress {
  phase: 'projects' | 'approvals' | 'flags' | 'scheduled-changes' | 'done';
  /** Units completed and total for the current phase, when countable. */
  completed: number;
  total: number;
  message: string;
}

export interface ScanResult {
  rows: ScheduledChangeRow[];
  projects: Project[];
  /** Project key -> environments, so the filter bar can offer real options. */
  environmentsByProject: Map<string, Environment[]>;
  /** Per flag x environment pair requests actually issued. */
  requestCount: number;
  /** Pairs that failed (usually 403 for an environment the member cannot read). */
  errors: ScanError[];
  scannedAt: number;
}

export interface ScanError {
  projectKey: string;
  environmentKey?: string;
  flagKey?: string;
  status?: number;
  message: string;
}

export interface ScanOptions {
  instance: 'us' | 'federal';
  scope: ScanScope;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  now?: number;
}

export async function listProjects(signal?: AbortSignal): Promise<Project[]> {
  return getAllPages<Project>('projects', {
    signal,
    query: { expand: 'environments', sort: 'name' },
    pageSize: 50,
  });
}

function environmentsOf(project: Project): Environment[] {
  return project.environments?.items ?? [];
}

async function listEnvironments(projectKey: string, signal?: AbortSignal): Promise<Environment[]> {
  return getAllPages<Environment>(`projects/${encodeURIComponent(projectKey)}/environments`, {
    signal,
    pageSize: 100,
  });
}

async function listFlags(
  projectKey: string,
  includeArchived: boolean,
  signal?: AbortSignal,
): Promise<FeatureFlagSummary[]> {
  return getAllPages<FeatureFlagSummary>(`flags/${encodeURIComponent(projectKey)}`, {
    signal,
    // No `env` param and no `summary=0`: this call only needs keys and names.
    query: { filter: includeArchived ? undefined : 'state:live', sort: 'key' },
    pageSize: 100,
    maxItems: 20_000,
  });
}

/**
 * Account-wide approval requests that are pending or scheduled. One endpoint,
 * so this is cheap and always worth doing even when the fan-out is narrowed.
 */
async function listApprovals(signal?: AbortSignal): Promise<ApprovalRequest[]> {
  return getAllPages<ApprovalRequest>('approval-requests', {
    signal,
    query: {
      filter: 'status anyOf ["pending","scheduled"]',
      expand: 'project,flag,environments',
    },
    pageSize: 200,
    maxItems: 2_000,
  });
}

interface Pair {
  project: Project;
  environment: Environment;
  flag: FeatureFlagSummary;
}

export async function scanScheduledChanges(options: ScanOptions): Promise<ScanResult> {
  const { instance, scope, signal, onProgress } = options;
  const now = options.now ?? Date.now();
  const concurrency = scope.concurrency ?? DEFAULT_CONCURRENCY;
  const errors: ScanError[] = [];
  const rows: ScheduledChangeRow[] = [];

  onProgress?.({ phase: 'projects', completed: 0, total: 1, message: 'Loading projects' });
  const allProjects = await listProjects(signal);
  const projects = scope.projectKeys.length
    ? allProjects.filter((project) => scope.projectKeys.includes(project.key))
    : allProjects;
  const projectNames = new Map(allProjects.map((project) => [project.key, project.name]));

  const environmentsByProject = new Map<string, Environment[]>();
  for (const project of allProjects) {
    const envs = environmentsOf(project);
    if (envs.length) environmentsByProject.set(project.key, envs);
  }

  onProgress?.({
    phase: 'approvals',
    completed: 0,
    total: 1,
    message: 'Loading approval requests',
  });
  try {
    for (const approval of await listApprovals(signal)) {
      const row = fromApprovalRequest(approval, { instance, now, projectNames });
      if (!row) continue;
      if (scope.projectKeys.length && !scope.projectKeys.includes(row.projectKey)) continue;
      if (scope.environmentKeys.length && !scope.environmentKeys.includes(row.environmentKey)) {
        continue;
      }
      rows.push(row);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    errors.push({
      projectKey: '*',
      status: error instanceof ApiError ? error.status : undefined,
      message: `Approval requests: ${(error as Error).message}`,
    });
  }

  // Build the flag x environment worklist.
  onProgress?.({
    phase: 'flags',
    completed: 0,
    total: projects.length,
    message: 'Loading flags',
  });

  const pairs: Pair[] = [];
  let projectsDone = 0;
  for (const project of projects) {
    let environments = environmentsByProject.get(project.key) ?? [];
    if (!environments.length) {
      try {
        environments = await listEnvironments(project.key, signal);
        environmentsByProject.set(project.key, environments);
      } catch (error) {
        if (signal?.aborted) throw error;
        errors.push({
          projectKey: project.key,
          status: error instanceof ApiError ? error.status : undefined,
          message: `Environments: ${(error as Error).message}`,
        });
        continue;
      }
    }
    const scopedEnvironments = scope.environmentKeys.length
      ? environments.filter((environment) => scope.environmentKeys.includes(environment.key))
      : environments;
    if (!scopedEnvironments.length) {
      projectsDone += 1;
      continue;
    }

    let flags: FeatureFlagSummary[];
    try {
      flags = await listFlags(project.key, scope.includeArchived ?? false, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push({
        projectKey: project.key,
        status: error instanceof ApiError ? error.status : undefined,
        message: `Flags: ${(error as Error).message}`,
      });
      projectsDone += 1;
      continue;
    }

    for (const environment of scopedEnvironments) {
      for (const flag of flags) pairs.push({ project, environment, flag });
    }
    projectsDone += 1;
    onProgress?.({
      phase: 'flags',
      completed: projectsDone,
      total: projects.length,
      message: `Loading flags (${projectsDone}/${projects.length} projects)`,
    });
  }

  onProgress?.({
    phase: 'scheduled-changes',
    completed: 0,
    total: pairs.length,
    message: `Reading scheduled changes (0/${pairs.length})`,
  });

  await mapPool(
    pairs,
    concurrency,
    async ({ project, environment, flag }) => {
      const path =
        `projects/${encodeURIComponent(project.key)}` +
        `/flags/${encodeURIComponent(flag.key)}` +
        `/environments/${encodeURIComponent(environment.key)}/scheduled-changes`;
      try {
        const response = await get<Paginated<FeatureFlagScheduledChange>>(path, { signal });
        for (const change of response.items ?? []) {
          rows.push(
            fromScheduledChange(change, {
              instance,
              now,
              projectKey: project.key,
              projectName: project.name,
              environmentKey: environment.key,
              environmentName: environment.name,
              flagKey: flag.key,
              flagName: flag.name,
            }),
          );
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        // A 404 just means "this flag has no scheduled changes here".
        if (error instanceof ApiError && error.status === 404) return;
        errors.push({
          projectKey: project.key,
          environmentKey: environment.key,
          flagKey: flag.key,
          status: error instanceof ApiError ? error.status : undefined,
          message: (error as Error).message,
        });
      }
    },
    (completed, total) => {
      onProgress?.({
        phase: 'scheduled-changes',
        completed,
        total,
        message: `Reading scheduled changes (${completed}/${total})`,
      });
    },
  );

  onProgress?.({ phase: 'done', completed: 1, total: 1, message: 'Done' });

  return {
    rows: dedupeRows(rows),
    projects: allProjects,
    environmentsByProject,
    requestCount: pairs.length,
    errors,
    scannedAt: now,
  };
}
