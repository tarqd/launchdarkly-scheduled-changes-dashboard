import { Tag, TagGroup, TagList } from '@launchpad-ui/components';
import { Icon, type IconName } from '@launchpad-ui/icons';
import type { ChangeState } from '../lib/model';

/**
 * State is a *status*, not a series: it uses LaunchPad's reserved status
 * variants and always ships an icon plus a word, so it never reads by colour
 * alone.
 */

type TagVariant = 'default' | 'info' | 'success' | 'warning' | 'error';

const STATE_META: Record<ChangeState, { label: string; variant: TagVariant; icon: IconName }> = {
  scheduled: { label: 'Scheduled', variant: 'info', icon: 'calendar-schedule' },
  'awaiting-approval': { label: 'Awaiting approval', variant: 'warning', icon: 'approval-pending' },
  approved: { label: 'Approved', variant: 'success', icon: 'approval-approved' },
  declined: { label: 'Declined', variant: 'error', icon: 'approval-denied' },
  conflicted: { label: 'Conflict', variant: 'error', icon: 'alert-rhombus' },
  overdue: { label: 'Past due', variant: 'error', icon: 'clock-alert' },
};

export function stateLabel(state: ChangeState): string {
  return STATE_META[state].label;
}

export function StateBadge({ state }: { state: ChangeState }) {
  const meta = STATE_META[state];
  return (
    <TagGroup aria-label="Status">
      <TagList>
        <Tag id={state} variant={meta.variant} size="small">
          <Icon name={meta.icon} size="tiny" aria-hidden="true" /> {meta.label}
        </Tag>
      </TagList>
    </TagGroup>
  );
}

export function CategoryBadge({ label, icon }: { label: string; icon: IconName }) {
  return (
    <TagGroup aria-label="Change type">
      <TagList>
        <Tag id={label} variant="default" size="small">
          <Icon name={icon} size="tiny" aria-hidden="true" /> {label}
        </Tag>
      </TagList>
    </TagGroup>
  );
}
