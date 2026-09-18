import { Heading, Text } from '@launchpad-ui/components';
import { useMemo, useState } from 'react';
import { type ScheduledChangeRow, seriesOf } from '../lib/model';
import { SERIES_VAR } from '../lib/palette';
import { DAY, formatDate, formatWeekday, startOfDay } from '../lib/time';

/**
 * Change volume per day: the "when is the load" question, which is magnitude
 * over time. Two stacked series (will execute / still needs an approval), each
 * named in the legend and in the tooltip, so identity never rests on colour.
 *
 * Hand-rolled SVG rather than a charting library: it is ~40 marks, it inherits
 * LaunchPad tokens directly, and it keeps the bundle to the design system.
 */

const SERIES_KEYS = ['scheduled', 'awaitingApproval'] as const;
type SeriesKey = (typeof SERIES_KEYS)[number];

const SERIES_LABEL: Record<SeriesKey, string> = {
  scheduled: 'Scheduled',
  awaitingApproval: 'Awaiting approval',
};

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 34, left: 40 };
/**
 * viewBox units, not CSS pixels: the SVG scales to its container, so this is
 * sized to land near the 24px mark cap on a full-width desktop card.
 */
const MAX_BAR_WIDTH = 16;
const SEGMENT_GAP = 2;
const BAR_RADIUS = 4;

interface DayBucket {
  day: number;
  scheduled: number;
  awaitingApproval: number;
  total: number;
}

export interface UpcomingVolumeChartProps {
  rows: readonly ScheduledChangeRow[];
  /** How many days forward to plot. */
  days?: number;
  now?: number;
}

/** Nice round axis maximum, so ticks land on whole numbers. */
function axisMax(peak: number): number {
  if (peak <= 4) return Math.max(2, peak);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= peak) return candidate;
  }
  return 10 * magnitude;
}

/**
 * A column with square corners at the baseline and rounded corners at the data
 * end, drawn as a path so only the top two corners are rounded.
 */
function columnPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ');
}

interface StackSegment {
  key: SeriesKey;
  y: number;
  height: number;
}

/**
 * Stacked segment geometry. Boundaries are computed in value space so the whole
 * column still measures `scale(total)`; the 2px surface gap is then carved out
 * of the *upper* segment rather than added on top, which would overstate it.
 */
function stackSegments(
  bucket: DayBucket,
  baseline: number,
  scale: (value: number) => number,
): StackSegment[] {
  let cumulative = 0;
  return SERIES_KEYS.filter((key) => bucket[key] > 0).map((key, index) => {
    const from = cumulative;
    cumulative += bucket[key];
    const y = baseline - scale(cumulative);
    const bottom = baseline - scale(from) - (index > 0 ? SEGMENT_GAP : 0);
    return { key, y, height: Math.max(bottom - y, 1) };
  });
}

export function UpcomingVolumeChart({
  rows,
  days = 21,
  now = Date.now(),
}: UpcomingVolumeChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const buckets = useMemo<DayBucket[]>(() => {
    const first = startOfDay(now);
    const empty: DayBucket[] = Array.from({ length: days }, (_, index) => ({
      day: first + index * DAY,
      scheduled: 0,
      awaitingApproval: 0,
      total: 0,
    }));
    const byDay = new Map(empty.map((bucket) => [bucket.day, bucket]));
    for (const row of rows) {
      const bucket = byDay.get(startOfDay(row.executionDate));
      if (!bucket) continue;
      bucket[seriesOf(row)] += 1;
      bucket.total += 1;
    }
    return empty;
  }, [rows, days, now]);

  const peak = Math.max(...buckets.map((bucket) => bucket.total), 0);
  const beyondRange = rows.filter(
    (row) => row.executionDate >= startOfDay(now) + days * DAY,
  ).length;

  if (peak === 0) {
    return (
      <Text size="small">
        Nothing is scheduled in the next {days} days
        {beyondRange > 0
          ? `, but ${beyondRange} change${beyondRange === 1 ? '' : 's'} sit further out.`
          : '.'}
      </Text>
    );
  }

  const max = axisMax(peak);
  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const band = plotWidth / buckets.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, band * 0.6);
  const baseline = PADDING.top + plotHeight;
  const scale = (value: number) => (value / max) * plotHeight;

  const ticks = [0, max / 2, max].filter((tick, index, all) => all.indexOf(tick) === index);

  // The chart's own label and the table view are the non-visual channels, so the
  // label carries the distribution rather than just naming the chart.
  const totalInWindow = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const awaitingInWindow = buckets.reduce((sum, bucket) => sum + bucket.awaitingApproval, 0);
  const chartLabel =
    `Scheduled changes per day for the next ${days} days: ${totalInWindow} in total, ` +
    `${awaitingInWindow} of them awaiting approval, peaking at ${peak} on a single day. ` +
    'Every change is listed individually in the table below.';

  const hoveredBucket = hovered === null ? null : buckets[hovered];

  /*
   * One pointer handler for the whole plot, mapping the cursor's x position to a
   * band. The alternative — a transparent hit rect per band — means one extra
   * node per day and, since those rects are not focusable, no benefit to anyone
   * navigating by keyboard. The chart's label and the table view carry the data
   * for readers who are not hovering.
   */
  function onMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const viewX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
    const index = Math.floor((viewX - PADDING.left) / band);
    setHovered(index >= 0 && index < buckets.length ? index : null);
  }

  /*
   * The tooltip sits beside the hovered column, vertically centred on it, and
   * flips to the column's left in the right half of the chart. Placing it above
   * the mark works until a tall column pushes it off the top of the plot, and
   * placing it below covers the very bars it is describing.
   */
  const tooltipAnchor =
    hovered === null || !hoveredBucket
      ? null
      : {
          leftPercent: ((PADDING.left + hovered * band + band / 2) / VIEW_WIDTH) * 100,
          topPercent: ((baseline - scale(hoveredBucket.total) / 2) / VIEW_HEIGHT) * 100,
          flip: hovered > buckets.length / 2,
        };

  return (
    <div className="chart">
      <ul className="chart__legend" aria-label="Series">
        {SERIES_KEYS.map((key) => (
          <li className="chart__legend-item" key={key}>
            <span
              className="chart__swatch"
              style={{ backgroundColor: SERIES_VAR[key] }}
              aria-hidden="true"
            />
            <Text size="small" elementType="span">
              {SERIES_LABEL[key]}
            </Text>
          </li>
        ))}
      </ul>

      <svg
        className="chart__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={chartLabel}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        {ticks.map((tick) => {
          const y = baseline - scale(tick);
          return (
            <g key={tick}>
              <line
                className="chart__gridline"
                x1={PADDING.left}
                x2={VIEW_WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text className="chart__tick" x={PADDING.left - 8} y={y + 4} textAnchor="end">
                {Math.round(tick).toLocaleString()}
              </text>
            </g>
          );
        })}

        {buckets.map((bucket, index) => {
          const x = PADDING.left + index * band + (band - barWidth) / 2;
          const isToday = index === 0;
          const showTick = index === 0 || index % 3 === 0 || index === buckets.length - 1;
          const segments = stackSegments(bucket, baseline, scale);

          return (
            <g key={bucket.day}>
              {segments.map((segment, segmentIndex) => {
                const isTopSegment = segmentIndex === segments.length - 1;
                return (
                  <path
                    key={segment.key}
                    d={
                      isTopSegment
                        ? columnPath(x, segment.y, barWidth, segment.height, BAR_RADIUS)
                        : `M ${x} ${segment.y} h ${barWidth} v ${segment.height} h ${-barWidth} Z`
                    }
                    fill={SERIES_VAR[segment.key]}
                  />
                );
              })}

              {showTick ? (
                <text
                  className={isToday ? 'chart__tick' : 'chart__tick chart__tick--muted'}
                  x={x + barWidth / 2}
                  y={baseline + 15}
                  textAnchor="middle"
                >
                  {isToday ? 'Today' : formatDate(bucket.day)}
                </text>
              ) : null}
            </g>
          );
        })}

        <line
          className="chart__gridline"
          x1={PADDING.left}
          x2={VIEW_WIDTH - PADDING.right}
          y1={baseline}
          y2={baseline}
        />
      </svg>

      {hoveredBucket && tooltipAnchor ? (
        <div
          className="chart__tooltip"
          data-flip={tooltipAnchor.flip || undefined}
          style={{
            left: `${tooltipAnchor.leftPercent}%`,
            top: `${tooltipAnchor.topPercent}%`,
          }}
        >
          <Heading size="small" level={3}>
            {formatWeekday(hoveredBucket.day)} {formatDate(hoveredBucket.day)}
          </Heading>
          {SERIES_KEYS.map((key) => (
            <div className="chart__tooltip-row" key={key}>
              <span className="chart__tooltip-key">
                <span
                  className="chart__swatch"
                  style={{ backgroundColor: SERIES_VAR[key] }}
                  aria-hidden="true"
                />
                <Text size="small" elementType="span">
                  {SERIES_LABEL[key]}
                </Text>
              </span>
              <span className="chart__tooltip-value">{hoveredBucket[key]}</span>
            </div>
          ))}
        </div>
      ) : null}

      {beyondRange > 0 ? (
        <Text size="small">
          {beyondRange} change{beyondRange === 1 ? '' : 's'} scheduled beyond this window.
        </Text>
      ) : null}
    </div>
  );
}
