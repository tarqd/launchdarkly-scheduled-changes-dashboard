import { Alert, AlertText, Heading, Meter, ProgressBar, Text } from '@launchpad-ui/components';
import type { ScanError, ScanProgress } from '../lib/scan';

const PHASE_LABELS: Record<ScanProgress['phase'], string> = {
  projects: 'Loading projects',
  approvals: 'Loading approval requests',
  flags: 'Loading flags',
  'scheduled-changes': 'Reading scheduled changes',
  done: 'Done',
};

export function ScanProgressPanel({ progress }: { progress: ScanProgress }) {
  const determinate = progress.total > 1;
  const percent = determinate ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="card stack" role="status" aria-live="polite">
      <div className="row">
        <ProgressBar
          aria-label={PHASE_LABELS[progress.phase]}
          isIndeterminate={!determinate}
          value={percent}
        />
        <Heading size="small" level={2}>
          {PHASE_LABELS[progress.phase]}
        </Heading>
      </div>
      {determinate ? (
        <Meter
          aria-label={`${progress.completed} of ${progress.total} complete`}
          value={percent}
          minValue={0}
          maxValue={100}
        />
      ) : null}
      <Text size="small">{progress.message}</Text>
    </div>
  );
}

/**
 * A scan over a whole account will usually hit a few environments the signed-in
 * member cannot read. That is expected, not a failure, so it is reported as a
 * warning with the count rather than blocking the results.
 */
export function ScanErrors({ errors }: { errors: readonly ScanError[] }) {
  if (!errors.length) return null;

  const forbidden = errors.filter((error) => error.status === 403).length;
  const other = errors.length - forbidden;
  const sample = errors.slice(0, 3);

  return (
    <Alert status="warning" isDismissable>
      <AlertText>
        <Heading size="small" level={2}>
          {errors.length} request{errors.length === 1 ? '' : 's'} could not be read
        </Heading>
        <Text size="small">
          {forbidden > 0 ? `${forbidden} were denied by your LaunchDarkly permissions. ` : ''}
          {other > 0 ? `${other} failed for another reason. ` : ''}
          Results below are complete for everything that could be read.
        </Text>
        <ul className="login__points">
          {sample.map((error, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed slice of a finished scan; nothing is inserted or reordered afterwards
            <li key={`${error.projectKey}-${error.environmentKey ?? ''}-${index}`}>
              <Text size="small" elementType="span">
                {[error.projectKey, error.environmentKey, error.flagKey]
                  .filter(Boolean)
                  .join(' / ')}
                : {error.message}
              </Text>
            </li>
          ))}
        </ul>
      </AlertText>
    </Alert>
  );
}
