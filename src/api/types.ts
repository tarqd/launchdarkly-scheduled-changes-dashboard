/**
 * The slices of the LaunchDarkly REST API this dashboard reads.
 * Hand-written rather than generated: the app touches ~6 endpoints.
 */

export interface Link {
  href?: string;
  type?: string;
}

export type Links = Record<string, Link | undefined>;

export interface Paginated<T> {
  items: T[];
  totalCount?: number;
  _links?: Links;
}

export interface Environment {
  _id?: string;
  key: string;
  name: string;
  color?: string;
  critical?: boolean;
}

export interface Project {
  _id?: string;
  key: string;
  name: string;
  tags?: string[];
  environments?: Paginated<Environment>;
}

export interface FeatureFlagSummary {
  key: string;
  name: string;
  description?: string;
  kind?: string;
  tags?: string[];
  temporary?: boolean;
  archived?: boolean;
  _maintainer?: Member;
  maintainerId?: string;
  _links?: Links;
}

export interface Member {
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

/** One `{ kind, ... }` semantic-patch instruction. Payload shape varies by kind. */
export interface Instruction {
  kind: string;
  [key: string]: unknown;
}

export interface ScheduledChangeConflict {
  reason?: string;
  _id?: string;
  [key: string]: unknown;
}

export interface FeatureFlagScheduledChange {
  _id: string;
  _creationDate: number;
  _maintainerId?: string;
  _maintainerServiceTokenId?: string;
  _version: number;
  executionDate: number;
  instructions: Instruction[];
  conflicts?: ScheduledChangeConflict[];
  _links?: Links;
}

export type ApprovalStatus = 'pending' | 'scheduled' | 'failed' | 'completed';
export type ApprovalReviewStatus = 'approved' | 'declined' | 'pending';

export interface ApprovalReview {
  _id?: string;
  kind?: ApprovalReviewStatus;
  memberId?: string;
  creationDate?: number;
  comment?: string;
}

export interface ApprovalRequest {
  _id: string;
  _version?: number;
  creationDate?: number;
  requestorId?: string;
  description?: string;
  status?: ApprovalStatus;
  reviewStatus?: ApprovalReviewStatus;
  /** Present when the approval is a scheduled (future-dated) change. */
  executionDate?: number;
  operatingOnId?: string;
  instructions?: Instruction[];
  reviews?: ApprovalReview[];
  notifyMemberIds?: string[];
  appliedDate?: number;
  appliedByMemberId?: string;
  allReviews?: ApprovalReview[];
  conflicts?: ScheduledChangeConflict[];
  resourceId?: string;
  resourceKind?: string;
  /** Populated by `expand=project,flag,environments`. */
  project?: { key: string; name?: string };
  flag?: { key: string; name?: string };
  environments?: Environment[];
  _links?: Links;
}

export interface CallerIdentity {
  authenticated: boolean;
  instance?: 'us' | 'federal';
  accountId?: string;
  memberId?: string;
  email?: string;
  name?: string;
  sessionExpiresAt?: number;
}
