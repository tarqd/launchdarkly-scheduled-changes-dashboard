import type { IconName } from '@launchpad-ui/icons';
import type { Instruction } from '../api/types';

/**
 * Semantic-patch instructions are the payload of every scheduled change, and
 * they are the one thing the LaunchDarkly UI does not show you in aggregate.
 * This module turns `{ kind: 'updateFallthroughVariationOrRollout', ... }` into
 * "Set default rollout to 25% / 75%" so a whole account fits on one screen.
 */

export type InstructionCategory =
  | 'kill-switch'
  | 'targeting'
  | 'rules'
  | 'rollout'
  | 'prerequisites'
  | 'variations'
  | 'metadata'
  | 'other';

export const CATEGORY_LABELS: Record<InstructionCategory, string> = {
  'kill-switch': 'On/off',
  targeting: 'Targeting',
  rules: 'Rules',
  rollout: 'Rollout',
  prerequisites: 'Prerequisites',
  variations: 'Variations',
  metadata: 'Metadata',
  other: 'Other',
};

/** Launchpad icon names, so a category reads without relying on colour. */
export const CATEGORY_ICONS: Record<InstructionCategory, IconName> = {
  'kill-switch': 'toggle-bolt',
  targeting: 'bullseye-arrow',
  rules: 'list-numbers',
  rollout: 'percentage',
  prerequisites: 'arrow-connect',
  variations: 'binary',
  metadata: 'text-box-search',
  other: 'checklist',
};

const CATEGORY_BY_KIND: Record<string, InstructionCategory> = {
  turnFlagOn: 'kill-switch',
  turnFlagOff: 'kill-switch',

  addTargets: 'targeting',
  removeTargets: 'targeting',
  replaceTargets: 'targeting',
  clearTargets: 'targeting',
  addUserTargets: 'targeting',
  removeUserTargets: 'targeting',
  replaceUserTargets: 'targeting',
  clearUserTargets: 'targeting',
  addExpireUserTargetDate: 'targeting',
  updateExpireUserTargetDate: 'targeting',
  removeExpireUserTargetDate: 'targeting',
  addExpiringTarget: 'targeting',
  updateExpiringTarget: 'targeting',
  removeExpiringTarget: 'targeting',

  addRule: 'rules',
  removeRule: 'rules',
  replaceRules: 'rules',
  reorderRules: 'rules',
  addClauses: 'rules',
  removeClauses: 'rules',
  updateClause: 'rules',
  addValuesToClause: 'rules',
  removeValuesFromClause: 'rules',
  updateRuleDescription: 'rules',
  updateRuleVariationOrRollout: 'rules',
  updateRuleTrackEvents: 'rules',

  updateFallthroughVariationOrRollout: 'rollout',
  updateOffVariation: 'rollout',
  updateDefaultVariation: 'rollout',
  updateTrackEvents: 'rollout',
  updateTrackEventsFallthrough: 'rollout',

  addPrerequisite: 'prerequisites',
  removePrerequisite: 'prerequisites',
  updatePrerequisite: 'prerequisites',
  replacePrerequisites: 'prerequisites',

  addVariation: 'variations',
  removeVariation: 'variations',
  updateVariation: 'variations',

  updateName: 'metadata',
  updateDescription: 'metadata',
  addTags: 'metadata',
  removeTags: 'metadata',
  makeFlagPermanent: 'metadata',
  makeFlagTemporary: 'metadata',
  updateMaintainerMember: 'metadata',
  updateMaintainerTeam: 'metadata',
  removeMaintainer: 'metadata',
  addCustomProperties: 'metadata',
  removeCustomProperties: 'metadata',
  replaceCustomProperties: 'metadata',
  archiveFlag: 'metadata',
  restoreFlag: 'metadata',
  deprecateFlag: 'metadata',
};

export function categoryOf(kind: string): InstructionCategory {
  return CATEGORY_BY_KIND[kind] ?? 'other';
}

/** `updateFallthroughVariationOrRollout` -> `Update fallthrough variation or rollout` */
export function humanizeKind(kind: string): string {
  const spaced = kind
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function count(value: unknown): number {
  return asArray(value).length;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Sum the context keys across a `targets`/`userTargets` array of variation buckets. */
function targetKeyCount(targets: unknown): number {
  return asArray(targets).reduce<number>((total, entry) => {
    if (entry && typeof entry === 'object') {
      const values =
        (entry as { values?: unknown; keys?: unknown }).values ??
        (entry as { keys?: unknown }).keys;
      return total + count(values);
    }
    return total;
  }, 0);
}

function describeRollout(instruction: Instruction): string | undefined {
  const weights = instruction.rolloutWeights;
  if (!weights || typeof weights !== 'object') return undefined;
  const entries = Object.values(weights as Record<string, unknown>)
    .filter((weight): weight is number => typeof weight === 'number')
    .map((weight) => `${Math.round(weight / 1000)}%`);
  return entries.length ? entries.join(' / ') : undefined;
}

/**
 * A one-line, human-readable summary of a single instruction.
 * Falls back to a de-camel-cased kind so an instruction LaunchDarkly adds later
 * still renders something truthful rather than blank.
 */
export function describeInstruction(instruction: Instruction): string {
  const { kind } = instruction;

  switch (kind) {
    case 'turnFlagOn':
      return 'Turn targeting on';
    case 'turnFlagOff':
      return 'Turn targeting off';

    case 'addTargets':
    case 'addUserTargets': {
      const n = count(instruction.values) || targetKeyCount(instruction.targets);
      return n ? `Add ${plural(n, 'target')}` : 'Add targets';
    }
    case 'removeTargets':
    case 'removeUserTargets': {
      const n = count(instruction.values) || targetKeyCount(instruction.targets);
      return n ? `Remove ${plural(n, 'target')}` : 'Remove targets';
    }
    case 'replaceTargets':
    case 'replaceUserTargets': {
      const n = targetKeyCount(instruction.targets ?? instruction.userTargets);
      return n ? `Replace targeting with ${plural(n, 'target')}` : 'Replace individual targeting';
    }
    case 'clearTargets':
    case 'clearUserTargets':
      return 'Clear all individual targets';

    case 'addExpireUserTargetDate':
    case 'addExpiringTarget':
      return 'Schedule a target to expire';
    case 'updateExpireUserTargetDate':
    case 'updateExpiringTarget':
      return 'Change when a target expires';
    case 'removeExpireUserTargetDate':
    case 'removeExpiringTarget':
      return 'Cancel a target expiry';

    case 'addRule': {
      const clauses = count(instruction.clauses);
      const rollout = describeRollout(instruction);
      const detail = [
        clauses ? plural(clauses, 'condition') : undefined,
        rollout ? `rollout ${rollout}` : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      return detail ? `Add a targeting rule (${detail})` : 'Add a targeting rule';
    }
    case 'removeRule':
      return 'Remove a targeting rule';
    case 'replaceRules': {
      const n = count(instruction.rules);
      return n ? `Replace all rules with ${plural(n, 'rule')}` : 'Replace all targeting rules';
    }
    case 'reorderRules':
      return 'Reorder targeting rules';
    case 'addClauses':
      return `Add ${plural(count(instruction.clauses) || 1, 'condition')} to a rule`;
    case 'removeClauses':
      return `Remove ${plural(count(instruction.clauseIds) || 1, 'condition')} from a rule`;
    case 'updateClause':
      return 'Update a rule condition';
    case 'addValuesToClause':
      return `Add ${plural(count(instruction.values) || 1, 'value')} to a rule condition`;
    case 'removeValuesFromClause':
      return `Remove ${plural(count(instruction.values) || 1, 'value')} from a rule condition`;
    case 'updateRuleDescription':
      return 'Update a rule description';
    case 'updateRuleVariationOrRollout': {
      const rollout = describeRollout(instruction);
      return rollout ? `Set a rule to roll out ${rollout}` : 'Change what a rule serves';
    }
    case 'updateRuleTrackEvents':
      return 'Change experiment tracking on a rule';

    case 'updateFallthroughVariationOrRollout': {
      const rollout = describeRollout(instruction);
      return rollout ? `Set default rollout to ${rollout}` : 'Change the default variation served';
    }
    case 'updateOffVariation':
      return 'Change the variation served when targeting is off';
    case 'updateDefaultVariation':
      return 'Change the flag default variations';
    case 'updateTrackEvents':
      return 'Change experiment tracking for the flag';
    case 'updateTrackEventsFallthrough':
      return 'Change experiment tracking on the default rule';

    case 'addPrerequisite': {
      const key = asString(instruction.key);
      return key ? `Add prerequisite flag "${key}"` : 'Add a prerequisite flag';
    }
    case 'removePrerequisite': {
      const key = asString(instruction.key);
      return key ? `Remove prerequisite flag "${key}"` : 'Remove a prerequisite flag';
    }
    case 'updatePrerequisite':
      return 'Update a prerequisite flag';
    case 'replacePrerequisites':
      return `Replace prerequisites with ${plural(count(instruction.prerequisites), 'flag')}`;

    case 'addVariation':
      return 'Add a variation';
    case 'removeVariation':
      return 'Remove a variation';
    case 'updateVariation':
      return 'Update a variation';

    case 'updateName': {
      const value = asString(instruction.value) ?? asString(instruction.name);
      return value ? `Rename the flag to "${value}"` : 'Rename the flag';
    }
    case 'updateDescription':
      return 'Update the flag description';
    case 'addTags':
      return `Add ${plural(count(instruction.values), 'tag')}`;
    case 'removeTags':
      return `Remove ${plural(count(instruction.values), 'tag')}`;
    case 'makeFlagPermanent':
      return 'Mark the flag permanent';
    case 'makeFlagTemporary':
      return 'Mark the flag temporary';
    case 'updateMaintainerMember':
    case 'updateMaintainerTeam':
      return 'Change the flag maintainer';
    case 'removeMaintainer':
      return 'Remove the flag maintainer';
    case 'archiveFlag':
      return 'Archive the flag';
    case 'restoreFlag':
      return 'Restore the flag from the archive';
    case 'deprecateFlag':
      return 'Deprecate the flag';

    default:
      return humanizeKind(kind);
  }
}

export interface InstructionSummary {
  /** The headline shown in the timeline and table. */
  title: string;
  /** Every instruction, one line each, for the detail view. */
  lines: string[];
  /** The dominant category, used for filtering and the category badge. */
  category: InstructionCategory;
  categories: InstructionCategory[];
}

/** Summarise a whole instruction list. Most changes carry exactly one. */
export function summarizeInstructions(instructions: readonly Instruction[]): InstructionSummary {
  const list = instructions.filter((instruction) => typeof instruction?.kind === 'string');
  if (list.length === 0) {
    return { title: 'No instructions', lines: [], category: 'other', categories: [] };
  }

  const lines = list.map(describeInstruction);
  const categories = [...new Set(list.map((instruction) => categoryOf(instruction.kind)))];
  const first = lines[0] as string;
  const title = list.length === 1 ? first : `${first} + ${list.length - 1} more`;

  return {
    title,
    lines,
    category: (categories[0] ?? 'other') as InstructionCategory,
    categories,
  };
}
