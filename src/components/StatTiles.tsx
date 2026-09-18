import { Focusable, Heading, Text, Tooltip, TooltipTrigger } from '@launchpad-ui/components';
import { Icon, type IconName } from '@launchpad-ui/icons';
import type { ScheduledChangeRow } from '../lib/model';
import { DAY, startOfDay } from '../lib/time';

/**
 * The headline numbers. A KPI row of stat tiles rather than a chart, because
 * each of these is a single current value.
 */

export interface Stats {
  total: number;
  next24h: number;
  next7d: number;
  awaitingApproval: number;
  conflicted: number;
  overdue: number;
}

export function computeStats(rows: readonly ScheduledChangeRow[], now = Date.now()): Stats {
  const in24h = now + DAY;
  const in7d = startOfDay(now) + 7 * DAY;
  const stats: Stats = {
    total: rows.length,
    next24h: 0,
    next7d: 0,
    awaitingApproval: 0,
    conflicted: 0,
    overdue: 0,
  };
  for (const row of rows) {
    if (row.executionDate < now) stats.overdue += 1;
    else if (row.executionDate <= in24h) stats.next24h += 1;
    if (row.executionDate >= now && row.executionDate <= in7d) stats.next7d += 1;
    if (row.state === 'awaiting-approval') stats.awaitingApproval += 1;
    if (row.conflicts.length) stats.conflicted += 1;
  }
  return stats;
}

interface TileProps {
  label: string;
  value: number;
  icon: IconName;
  hint: string;
  hero?: boolean;
}

function Tile({ label, value, icon, hint, hero }: TileProps) {
  return (
    <div className="card stat">
      <span className="stat__label">
        <Icon name={icon} size="small" aria-hidden="true" />
        <TooltipTrigger>
          <Focusable>
            <Text size="small" elementType="span">
              {label}
            </Text>
          </Focusable>
          <Tooltip>{hint}</Tooltip>
        </TooltipTrigger>
      </span>
      <span className={hero ? 'stat__value stat__value--hero' : 'stat__value'}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export function StatTiles({ stats }: { stats: Stats }) {
  return (
    <section aria-labelledby="stats-heading" className="stack">
      <Heading id="stats-heading" size="small" level={2} className="visually-hidden">
        Summary
      </Heading>
      <div className="stats">
        <Tile
          label="Upcoming changes"
          value={stats.total}
          icon="calendar-schedule"
          hint="Every scheduled change and future-dated approval request in scope."
          hero
        />
        <Tile
          label="Next 24 hours"
          value={stats.next24h}
          icon="clock"
          hint="Changes that will execute within the next day."
        />
        <Tile
          label="Next 7 days"
          value={stats.next7d}
          icon="calendar"
          hint="Changes that will execute within the next week."
        />
        <Tile
          label="Awaiting approval"
          value={stats.awaitingApproval}
          icon="approval-pending"
          hint="Scheduled work that will not execute until someone reviews it."
        />
        <Tile
          label="Conflicts"
          value={stats.conflicted}
          icon="alert-rhombus"
          hint="LaunchDarkly has flagged these as conflicting with another change."
        />
        <Tile
          label="Past due"
          value={stats.overdue}
          icon="clock-alert"
          hint="The execution date has passed but the change is still listed as pending."
        />
      </div>
    </section>
  );
}
