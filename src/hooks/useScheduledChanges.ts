import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  type ScanProgress,
  type ScanResult,
  type ScanScope,
  scanScheduledChanges,
} from '../lib/scan';

export interface ScheduledChangesState {
  result: ScanResult | null;
  progress: ScanProgress | null;
  error: string | null;
  isUnauthorized: boolean;
  isScanning: boolean;
}

const IDLE: ScheduledChangesState = {
  result: null,
  progress: null,
  error: null,
  isUnauthorized: false,
  isScanning: false,
};

/**
 * Owns the scan lifecycle: one in flight at a time, cancelled on unmount or
 * when a new scan starts, with progress surfaced for the UI.
 */
export function useScheduledChanges(instance: 'us' | 'federal') {
  const [state, setState] = useState<ScheduledChangesState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const scan = useCallback(
    async (scope: ScanScope) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((current) => ({
        ...current,
        isScanning: true,
        error: null,
        isUnauthorized: false,
        progress: { phase: 'projects', completed: 0, total: 1, message: 'Starting' },
      }));

      try {
        const result = await scanScheduledChanges({
          instance,
          scope,
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) setState((current) => ({ ...current, progress }));
          },
        });
        if (controller.signal.aborted) return;
        setState({
          result,
          progress: null,
          error: null,
          isUnauthorized: false,
          isScanning: false,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          isScanning: false,
          progress: null,
          isUnauthorized: error instanceof ApiError && error.isUnauthorized,
          error: (error as Error).message,
        }));
      }
    },
    [instance],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((current) => ({ ...current, isScanning: false, progress: null }));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, scan, cancel };
}
