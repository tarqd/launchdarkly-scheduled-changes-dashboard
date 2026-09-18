import { Heading, LinkIconButton, Text } from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '../lib/instructions';
import type { ScheduledChangeRow } from '../lib/model';
import { seriesOf } from '../lib/model';
import { SERIES_VAR } from '../lib/palette';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  type BucketId,
  bucketOf,
  formatDate,
  formatTime,
  formatWeekday,
  relativeTime,
} from '../lib/time';
import { CategoryBadge, StateBadge } from './StateBadge';

/**
 * The agenda is the actual single pane of glass: every upcoming change in
 * execution order, grouped into the buckets people plan around. The chart above
 * it answers "how much"; this answers "what, where, and does it need me".
 */

export interface AgendaProps {
  rows: readonly ScheduledChangeRow[];
  now?: number;
  /** Cap per bucket so one noisy day cannot push the rest off the screen. */
  maxPerBucket?: number;
}

function ChangeItem({ row, now }: { row: ScheduledChangeRow; now: number }) {
  const extraLines = row.detailLines.length > 1 ? row.detailLines : [];
  return (
    <li
      className="agenda__item"
      style={{ ['--agenda-accent' as string]: SERIES_VAR[seriesOf(row)] }}
    >
      <div className="agenda__when">
        <Text size="medium" bold elementType="span">
          {formatTime(row.executionDate)}
        </Text>
        <Text size="small" elementType="span">
          {formatWeekday(row.executionDate)} {formatDate(row.executionDate)}
        </Text>
        <Text size="small" elementType="span">
          {relativeTime(row.executionDate, now)}
        </Text>
      </div>

      <div className="agenda__body">
        <Heading size="small" level={4}>
          {row.title}
        </Heading>

        <div className="agenda__where">
          <Icon name="flag" size="small" aria-hidden="true" />
          <Text size="small" elementType="span">
            {row.flagName}
          </Text>
          <span className="dot" aria-hidden="true" />
          <Text size="small" elementType="span">
            {row.projectName}
          </Text>
          <span className="dot" aria-hidden="true" />
          <Text size="small" elementType="span">
            {row.environmentName}
          </Text>
        </div>

        <div className="agenda__badges">
          <StateBadge state={row.state} />
          <CategoryBadge
            label={CATEGORY_LABELS[row.category]}
            icon={CATEGORY_ICONS[row.category]}
          />
          {row.source === 'approval-request' ? (
            <Text size="small" elementType="span">
              via approval request
            </Text>
          ) : null}
        </div>

        {extraLines.length ? (
          <ul className="agenda__instructions">
            {extraLines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: instruction order is fixed by the API response; the list is never reordered or spliced
              <li key={`${row.id}-line-${index}`}>
                <Text size="small" elementType="span">
                  {line}
                </Text>
              </li>
            ))}
          </ul>
        ) : null}

        {row.conflicts.length ? (
          <Text size="small" elementType="span">
            Conflict: {row.conflicts[0]?.reason ?? 'conflicts with another scheduled change'}
          </Text>
        ) : null}
      </div>

      <div className="agenda__actions">
        <LinkIconButton
          icon="link-external"
          aria-label={`Open ${row.flagKey} in LaunchDarkly`}
          href={row.href}
          target="_blank"
          rel="noreferrer"
          variant="minimal"
        />
      </div>
    </li>
  );
}

export function Agenda({ rows, now = Date.now(), maxPerBucket = 25 }: AgendaProps) {
  const grouped = new Map<BucketId, ScheduledChangeRow[]>();
  for (const row of rows) {
    const bucket = bucketOf(row.executionDate, now);
    const list = grouped.get(bucket);
    if (list) list.push(row);
    else grouped.set(bucket, [row]);
  }

  const buckets = BUCKET_ORDER.filter((bucket) => (grouped.get(bucket)?.length ?? 0) > 0);

  return (
    <div className="agenda">
      {buckets.map((bucket) => {
        const all = grouped.get(bucket) ?? [];
        const shown = all.slice(0, maxPerBucket);
        return (
          <section key={bucket} aria-labelledby={`bucket-${bucket}`}>
            <div className="agenda__group-header">
              <Heading id={`bucket-${bucket}`} size="small" level={3}>
                {BUCKET_LABELS[bucket]}
              </Heading>
              <Text size="small" elementType="span">
                {all.length} change{all.length === 1 ? '' : 's'}
              </Text>
            </div>
            <ul className="agenda__list">
              {shown.map((row) => (
                <ChangeItem key={row.id} row={row} now={now} />
              ))}
            </ul>
            {all.length > shown.length ? (
              <Text size="small">
                {all.length - shown.length} more in this group — see the table below.
              </Text>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
