import { describe, expect, it } from 'vitest';
import {
  categoryOf,
  describeInstruction,
  humanizeKind,
  summarizeInstructions,
} from '../src/lib/instructions';

describe('describeInstruction', () => {
  it('reads kill-switch instructions in plain language', () => {
    expect(describeInstruction({ kind: 'turnFlagOn' })).toBe('Turn targeting on');
    expect(describeInstruction({ kind: 'turnFlagOff' })).toBe('Turn targeting off');
  });

  it('counts targets from either payload shape', () => {
    expect(describeInstruction({ kind: 'addTargets', values: ['a', 'b', 'c'] })).toBe(
      'Add 3 targets',
    );
    expect(
      describeInstruction({
        kind: 'replaceTargets',
        targets: [{ values: ['a', 'b'] }, { values: ['c'] }],
      }),
    ).toBe('Replace targeting with 3 targets');
  });

  it('uses the singular for one item', () => {
    expect(describeInstruction({ kind: 'removeTargets', values: ['only-one'] })).toBe(
      'Remove 1 target',
    );
  });

  it('renders rollout weights as percentages', () => {
    expect(
      describeInstruction({
        kind: 'updateFallthroughVariationOrRollout',
        rolloutWeights: { v1: 25000, v2: 75000 },
      }),
    ).toBe('Set default rollout to 25% / 75%');
  });

  it('falls back to a readable kind for unknown instructions', () => {
    expect(describeInstruction({ kind: 'someBrandNewInstruction' })).toBe(
      'Some brand new instruction',
    );
  });

  it('names prerequisite flags when the payload carries a key', () => {
    expect(describeInstruction({ kind: 'addPrerequisite', key: 'billing-v2' })).toBe(
      'Add prerequisite flag "billing-v2"',
    );
  });
});

describe('humanizeKind', () => {
  it('splits camelCase into a sentence', () => {
    expect(humanizeKind('updateRuleVariationOrRollout')).toBe('Update rule variation or rollout');
  });
});

describe('categoryOf', () => {
  it('maps known kinds to their category', () => {
    expect(categoryOf('turnFlagOn')).toBe('kill-switch');
    expect(categoryOf('addRule')).toBe('rules');
    expect(categoryOf('addTags')).toBe('metadata');
  });

  it('defaults unknown kinds to other', () => {
    expect(categoryOf('notARealKind')).toBe('other');
  });
});

describe('summarizeInstructions', () => {
  it('summarises a single instruction without a suffix', () => {
    const summary = summarizeInstructions([{ kind: 'turnFlagOn' }]);
    expect(summary.title).toBe('Turn targeting on');
    expect(summary.lines).toHaveLength(1);
    expect(summary.category).toBe('kill-switch');
  });

  it('counts the remainder when several instructions are batched', () => {
    const summary = summarizeInstructions([
      { kind: 'turnFlagOn' },
      { kind: 'addTargets', values: ['a'] },
      { kind: 'addTags', values: ['beta'] },
    ]);
    expect(summary.title).toBe('Turn targeting on + 2 more');
    expect(summary.lines).toEqual(['Turn targeting on', 'Add 1 target', 'Add 1 tag']);
    expect(summary.categories).toEqual(['kill-switch', 'targeting', 'metadata']);
  });

  it('handles an empty instruction list', () => {
    expect(summarizeInstructions([]).title).toBe('No instructions');
  });

  it('ignores malformed entries', () => {
    const summary = summarizeInstructions([
      { kind: 'turnFlagOff' },
      // A response that drifts from the schema should not blank the row.
      {} as { kind: string },
    ]);
    expect(summary.title).toBe('Turn targeting off');
  });
});
