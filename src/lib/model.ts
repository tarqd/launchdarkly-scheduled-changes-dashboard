import { LD_APP_HOSTS } from '../../shared/constants';
import type {
  ApprovalRequest,
  ApprovalReviewStatus,
  FeatureFlagScheduledChange,
  Instruction,
  ScheduledChangeConflict,
} from '../api/types';
import { type InstructionCategory, summarizeInstructions } from './instructions';

/**
 * Scheduled work in LaunchDarkly arrives from two different endpoints with two
 * different shapes: per-flag/per-environment scheduled changes, and account-wide
 * approval requests that carry an execution date. The dashboard's whole value is
 * showing them side by side, so both are normalised into one row type here.
 */

export type ChangeSource = 'scheduled-change' | 'approval-request';

/** What a viewer actually needs to know about a row's state. */
export type ChangeState =
  | 'scheduled'
  | 'awaiting-approval'
  | 'approved'
  | 'declined'
  | 'conflicted'
  | 'overdue';

export interface ScheduledChangeRow {
  /** Stable, globally unique across both sources. */
  id: string;
  source: ChangeSource;
  projectKey: string;
  projectName: string;
  environmentKey: string;
  environmentName: string;
  flagKey: string;
  flagName: string;
  /** Epoch millis. Rows without one are dropped before they reach the UI. */
  executionDate: number;
  createdAt?: number;
  instructions: Instruction[];
  title: string;
  detailLines: string[];
  category: InstructionCategory;
  categories: InstructionCategory[];
  state: ChangeState;
  reviewStatus?: ApprovalReviewStatus;
  conflicts: ScheduledChangeConflict[];
  requestorId?: string;
  maintainerId?: string;
  description?: string;
  /** Deep link into the LaunchDarkly UI for this flag and environment. */
  href: string;
}

export function flagUrl(
  instance: 'us' | 'federal',
  projectKey: string,
  flagKey: string,
  environmentKey: string,
): string {
  const host = LD_APP_HOSTS[instance];
  return `${host}/projects/${encodeURIComponent(projectKey)}/flags/${encodeURIComponent(
    flagKey,
  )}/targeting?env=${encodeURIComponent(environmentKey)}&selected-env=${encodeURIComponent(
    environmentKey,
  )}`;
}

export interface ScheduleContext {
  instance: 'us' | 'federal';
  projectKey: string;
  projectName: string;
  environmentKey: string;
  environmentName: string;
  flagKey: string;
  flagName: string;
  now: number;
}

export function fromScheduledChange(
  change: FeatureFlagScheduledChange,
  context: ScheduleContext,
): ScheduledChangeRow {
  const summary = summarizeInstructions(change.instructions ?? []);
  const conflicts = change.conflicts ?? [];
  const state: ChangeState = conflicts.length
    ? 'conflicted'
    : change.executionDate < context.now
      ? 'overdue'
      : 'scheduled';

  return {
    id: `sc:${context.projectKey}:${context.environmentKey}:${context.flagKey}:${change._id}`,
    source: 'scheduled-change',
    projectKey: context.projectKey,
    projectName: context.projectName,
    environmentKey: context.environmentKey,
    environmentName: context.environmentName,
    flagKey: context.flagKey,
    flagName: context.flagName,
    executionDate: change.executionDate,
    createdAt: change._creationDate,
    instructions: change.instructions ?? [],
    title: summary.title,
    detailLines: summary.lines,
    category: summary.category,
    categories: summary.categories,
    state,
    conflicts,
    maintainerId: change._maintainerId,
    href: flagUrl(context.instance, context.projectKey, context.flagKey, context.environmentKey),
  };
}

/** `proj/my-project:env/production:flag/my-flag` -> the three keys. */
export function parseResourceId(resourceId: string | undefined): {
  projectKey?: string;
  environmentKey?: string;
  flagKey?: string;
} {
  if (!resourceId) return {};
  const parts = resourceId.split(':');
  const out: { projectKey?: string; environmentKey?: string; flagKey?: string } = {};
  for (const part of parts) {
    const [kind, value] = part.split('/');
    if (!value) continue;
    if (kind === 'proj') out.projectKey = value;
    else if (kind === 'env') out.environmentKey = value;
    else if (kind === 'flag') out.flagKey = value;
  }
  return out;
}

function approvalState(approval: ApprovalRequest, now: number): ChangeState {
  if (approval.conflicts?.length) return 'conflicted';
  if (approval.reviewStatus === 'declined') return 'declined';
  if (approval.reviewStatus === 'pending' || approval.status === 'pending') {
    return 'awaiting-approval';
  }
  if (approval.executionDate !== undefined && approval.executionDate < now) return 'overdue';
  if (approval.reviewStatus === 'approved') return 'approved';
  return 'scheduled';
}

export function fromApprovalRequest(
  approval: ApprovalRequest,
  options: { instance: 'us' | 'federal'; now: number; projectNames?: Map<string, string> },
): ScheduledChangeRow | null {
  if (approval.executionDate === undefined) return null;

  const parsed = parseResourceId(approval.resourceId);
  const projectKey = approval.project?.key ?? parsed.projectKey;
  const flagKey = approval.flag?.key ?? parsed.flagKey;
  const environmentKey = approval.environments?.[0]?.key ?? parsed.environmentKey;
  if (!projectKey || !flagKey || !environmentKey) return null;

  const summary = summarizeInstructions(approval.instructions ?? []);

  return {
    id: `ar:${approval._id}`,
    source: 'approval-request',
    projectKey,
    projectName: approval.project?.name ?? options.projectNames?.get(projectKey) ?? projectKey,
    environmentKey,
    environmentName: approval.environments?.[0]?.name ?? environmentKey,
    flagKey,
    flagName: approval.flag?.name ?? flagKey,
    executionDate: approval.executionDate,
    createdAt: approval.creationDate,
    instructions: approval.instructions ?? [],
    title: summary.title,
    detailLines: summary.lines,
    category: summary.category,
    categories: summary.categories,
    state: approvalState(approval, options.now),
    reviewStatus: approval.reviewStatus,
    conflicts: approval.conflicts ?? [],
    requestorId: approval.requestorId,
    description: approval.description,
    href: flagUrl(options.instance, projectKey, flagKey, environmentKey),
  };
}

/**
 * An approval request that edits a scheduled change and the scheduled change
 * itself both describe the same upcoming event. Prefer the approval row, which
 * carries the review state, and drop the duplicate.
 */
export function dedupeRows(rows: readonly ScheduledChangeRow[]): ScheduledChangeRow[] {
  const byIdentity = new Map<string, ScheduledChangeRow>();
  for (const row of rows) {
    const identity = `${row.projectKey}|${row.environmentKey}|${row.flagKey}|${row.executionDate}|${row.title}`;
    const existing = byIdentity.get(identity);
    if (
      !existing ||
      (existing.source === 'scheduled-change' && row.source === 'approval-request')
    ) {
      byIdentity.set(identity, row);
    }
  }
  return [...byIdentity.values()].sort((a, b) => a.executionDate - b.executionDate);
}

/** Which chart series a row belongs to. */
export function seriesOf(row: ScheduledChangeRow): 'scheduled' | 'awaitingApproval' {
  return row.state === 'awaiting-approval' ? 'awaitingApproval' : 'scheduled';
}
