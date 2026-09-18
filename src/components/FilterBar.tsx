import {
  Button,
  Checkbox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
  Select,
  SelectValue,
} from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';
import type { Environment, Project } from '../api/types';
import { CATEGORY_LABELS, type InstructionCategory } from '../lib/instructions';
import type { ChangeState } from '../lib/model';

/** Every filter the dashboard offers, in one row above the charts. */
export interface Filters {
  projectKey: string;
  environmentKey: string;
  state: ChangeState | 'all';
  category: InstructionCategory | 'all';
  search: string;
  hideExecuted: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  projectKey: 'all',
  environmentKey: 'all',
  state: 'all',
  category: 'all',
  search: '',
  hideExecuted: true,
};

const STATES: { id: ChangeState | 'all'; label: string }[] = [
  { id: 'all', label: 'Any status' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'awaiting-approval', label: 'Awaiting approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'conflicted', label: 'Conflict' },
  { id: 'overdue', label: 'Past due' },
  { id: 'declined', label: 'Declined' },
];

export interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  projects: Project[];
  environments: Environment[];
  /** Distinct categories present in the current result set. */
  categories: InstructionCategory[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function FilterBar({
  filters,
  onChange,
  projects,
  environments,
  categories,
  onRefresh,
  isRefreshing,
}: FilterBarProps) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const projectItems = [
    { id: 'all', label: `All projects (${projects.length})` },
    ...projects.map((project) => ({ id: project.key, label: project.name })),
  ];
  const environmentItems = [
    { id: 'all', label: 'All environments' },
    ...environments.map((environment) => ({ id: environment.key, label: environment.name })),
  ];
  const categoryItems = [
    { id: 'all' as const, label: 'Any change type' },
    ...categories.map((category) => ({ id: category, label: CATEGORY_LABELS[category] })),
  ];

  return (
    <div className="filters">
      <div className="filters__search">
        <SearchField value={filters.search} onChange={(value) => set('search', value)}>
          <Label>Search</Label>
          <Input placeholder="Flag key, name, or instruction" />
        </SearchField>
      </div>

      <PickerField
        label="Project"
        value={filters.projectKey}
        items={projectItems}
        onChange={(value) => onChange({ ...filters, projectKey: value, environmentKey: 'all' })}
      />
      <PickerField
        label="Environment"
        value={filters.environmentKey}
        items={environmentItems}
        onChange={(value) => set('environmentKey', value)}
      />
      <PickerField
        label="Status"
        value={filters.state}
        items={STATES}
        onChange={(value) => set('state', value as ChangeState | 'all')}
      />
      <PickerField
        label="Change type"
        value={filters.category}
        items={categoryItems}
        onChange={(value) => set('category', value as InstructionCategory | 'all')}
      />

      {/*
        A checkbox, not a Switch: Switch is reserved for flag-style on/off state
        in LaunchDarkly's UI, and this is an ordinary filter option.
      */}
      <div className="filters__field filters__checkbox">
        <Checkbox
          isSelected={filters.hideExecuted}
          onChange={(isSelected) => set('hideExecuted', isSelected)}
        >
          Hide past due
        </Checkbox>
      </div>

      <div className="filters__spacer" />

      <Button variant="default" onPress={onRefresh} isDisabled={isRefreshing}>
        <Icon
          name={isRefreshing ? 'clock-history' : 'arrow-undo'}
          size="small"
          aria-hidden="true"
        />
        {isRefreshing ? 'Scanning…' : 'Rescan'}
      </Button>
    </div>
  );
}

interface PickerFieldProps {
  label: string;
  value: string;
  items: { id: string; label: string }[];
  onChange: (value: string) => void;
}

function PickerField({ label, value, items, onChange }: PickerFieldProps) {
  return (
    <div className="filters__field">
      <Select selectedKey={value} onSelectionChange={(key) => onChange(String(key))}>
        <Label>{label}</Label>
        <Button>
          <SelectValue />
          <Icon name="chevron-down" size="small" aria-hidden="true" />
        </Button>
        <Popover>
          <ListBox items={items}>
            {(item: { id: string; label: string }) => (
              <ListBoxItem id={item.id}>{item.label}</ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </Select>
    </div>
  );
}
