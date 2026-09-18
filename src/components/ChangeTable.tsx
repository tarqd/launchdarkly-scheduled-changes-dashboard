import {
  Cell,
  Column,
  Link,
  ResizableTableContainer,
  Row,
  Table,
  TableBody,
  TableHeader,
  Text,
} from '@launchpad-ui/components';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '../lib/instructions';
import type { ScheduledChangeRow } from '../lib/model';
import { formatDateTime, relativeTime } from '../lib/time';
import { stateLabel } from './StateBadge';

/**
 * The table view. Every value in the charts above is reachable here as text,
 * which is what makes the colour encoding optional rather than load-bearing.
 */

type SortColumn = 'executionDate' | 'flag' | 'project' | 'environment' | 'state' | 'change';

interface SortState {
  column: SortColumn;
  direction: 'ascending' | 'descending';
}

const COLUMNS: { id: SortColumn; label: string; allowsSorting: boolean }[] = [
  { id: 'executionDate', label: 'Executes', allowsSorting: true },
  { id: 'flag', label: 'Flag', allowsSorting: true },
  { id: 'project', label: 'Project', allowsSorting: true },
  { id: 'environment', label: 'Environment', allowsSorting: true },
  { id: 'change', label: 'Change', allowsSorting: true },
  { id: 'state', label: 'Status', allowsSorting: true },
];

function sortValue(row: ScheduledChangeRow, column: SortColumn): string | number {
  switch (column) {
    case 'executionDate':
      return row.executionDate;
    case 'flag':
      return row.flagName.toLowerCase();
    case 'project':
      return row.projectName.toLowerCase();
    case 'environment':
      return row.environmentName.toLowerCase();
    case 'state':
      return stateLabel(row.state);
    case 'change':
      return row.title.toLowerCase();
  }
}

export function ChangeTable({
  rows,
  now = Date.now(),
}: {
  rows: readonly ScheduledChangeRow[];
  now?: number;
}) {
  const [sort, setSort] = useState<SortState>({
    column: 'executionDate',
    direction: 'ascending',
  });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = sortValue(a, sort.column);
      const right = sortValue(b, sort.column);
      if (left === right) return a.executionDate - b.executionDate;
      const order = left < right ? -1 : 1;
      return sort.direction === 'ascending' ? order : -order;
    });
    return copy;
  }, [rows, sort]);

  return (
    <div className="table-wrapper">
      <ResizableTableContainer>
        <Table
          aria-label="All scheduled changes"
          sortDescriptor={sort}
          onSortChange={(descriptor) =>
            setSort({
              column: descriptor.column as SortColumn,
              direction: descriptor.direction ?? 'ascending',
            })
          }
        >
          <TableHeader>
            {COLUMNS.map((column) => (
              <Column
                key={column.id}
                id={column.id}
                allowsSorting={column.allowsSorting}
                isRowHeader={column.id === 'executionDate'}
              >
                {column.label}
              </Column>
            ))}
          </TableHeader>
          <TableBody
            renderEmptyState={() => (
              <Text size="small">No scheduled changes match the current filters.</Text>
            )}
          >
            {sorted.map((row) => (
              <Row key={row.id} id={row.id}>
                <Cell className="cell--nowrap">
                  {formatDateTime(row.executionDate)}
                  <br />
                  <Text size="small" elementType="span">
                    {relativeTime(row.executionDate, now)}
                  </Text>
                </Cell>
                <Cell>
                  <Link href={row.href} target="_blank" rel="noreferrer">
                    {row.flagName}
                  </Link>
                  <br />
                  <Text size="small" elementType="code">
                    {row.flagKey}
                  </Text>
                </Cell>
                <Cell>{row.projectName}</Cell>
                <Cell>{row.environmentName}</Cell>
                <Cell className="cell--wrap">
                  {row.title}
                  <br />
                  <Text size="small" elementType="span">
                    {CATEGORY_LABELS[row.category]}
                    {row.source === 'approval-request' ? ' · approval request' : ''}
                  </Text>
                </Cell>
                <Cell className="cell--nowrap">{stateLabel(row.state)}</Cell>
              </Row>
            ))}
          </TableBody>
        </Table>
      </ResizableTableContainer>
    </div>
  );
}
