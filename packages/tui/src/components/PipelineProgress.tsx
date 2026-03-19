import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { ProgressEmitter, PipelineStage, ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import { Panel } from './Panel.js';
import { colors, icons } from '../theme.js';

// ============================================================================
// Types
// ============================================================================

type StageStatus = 'pending' | 'running' | 'complete' | 'error';

interface StageState {
  status: StageStatus;
  message: string;
  completed?: number;
  total?: number;
}

interface Props {
  progress: ProgressEmitter;
}

// ============================================================================
// Constants
// ============================================================================

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

const PIPELINE_STAGES: Array<{ key: PipelineStage; label: string }> = [
  { key: 'init', label: 'Init' },
  { key: 'review', label: 'Reviewers' },
  { key: 'discuss', label: 'Discussion' },
  { key: 'verdict', label: 'Verdict' },
];

// ============================================================================
// Helpers
// ============================================================================

function stageIcon(status: StageStatus): string {
  switch (status) {
    case 'complete': return icons.check;     // ✓
    case 'running':  return '>>';
    case 'error':    return icons.cross;     // ✗
    default:         return icons.disabled;  // ○
  }
}

function stageColor(status: StageStatus): string {
  switch (status) {
    case 'complete': return colors.success;
    case 'running':  return colors.warning;
    case 'error':    return colors.error;
    default:         return colors.muted;
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}

// ============================================================================
// Component
// ============================================================================

export function PipelineProgress({ progress }: Props): React.JSX.Element {
  const [stages, setStages] = useState<Record<PipelineStage, StageState>>({
    init:     { status: 'pending', message: '' },
    review:   { status: 'pending', message: '' },
    discuss:  { status: 'pending', message: '' },
    verdict:  { status: 'pending', message: '' },
    complete: { status: 'pending', message: '' },
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [finalMessage, setFinalMessage] = useState('');
  const [startTime] = useState(() => Date.now());

  // Subscribe to progress events
  useEffect(() => {
    function handleProgress(event: ProgressEvent): void {
      setStages(prev => {
        const next = { ...prev };
        const stage = event.stage;
        if (event.event === 'stage-start') {
          next[stage] = {
            status: 'running',
            message: event.message,
            completed: event.details?.completed,
            total: event.details?.total,
          };
        } else if (event.event === 'stage-update') {
          next[stage] = {
            status: 'running',
            message: event.message,
            completed: event.details?.completed,
            total: event.details?.total,
          };
        } else if (event.event === 'stage-complete') {
          next[stage] = {
            status: 'complete',
            message: event.message,
            completed: event.details?.completed,
            total: event.details?.total,
          };
        } else if (event.event === 'stage-error') {
          next[stage] = { status: 'error', message: event.message };
        } else if (event.event === 'pipeline-complete') {
          next[stage] = { status: 'complete', message: event.message };
          setIsDone(true);
          setFinalMessage(event.message);
        }
        return next;
      });
    }

    progress.onProgress(handleProgress);
    return () => {
      progress.off('progress', handleProgress);
    };
  }, [progress]);

  // Elapsed time counter
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Spinner animation
  useEffect(() => {
    if (isDone) return;
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 150);
    return () => clearInterval(interval);
  }, [isDone]);

  const spinnerChar = SPINNER_FRAMES[spinnerFrame] ?? '|';

  return (
    <Panel title="Pipeline Progress">
      {/* Header row: elapsed + cancel hint */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={colors.muted}>{formatElapsed(elapsedSeconds)} elapsed</Text>
        <Text color={colors.muted}>Ctrl+c to cancel</Text>
      </Box>

      {/* Stage rows */}
      {PIPELINE_STAGES.map(({ key, label }) => {
        const state = stages[key];
        const status = state?.status ?? 'pending';
        const message = state?.message ?? '';
        const ico = stageIcon(status);
        const col = stageColor(status);

        // Build reviewer count string for the review stage when details are available
        let countHint = '';
        if (key === 'review' && status === 'running') {
          const { completed, total } = state ?? {};
          if (total !== undefined && completed !== undefined) {
            countHint = `Reviewers: ${completed}/${total} complete`;
          }
        }

        return (
          <Box key={key} marginBottom={0}>
            <Text color={col}>{ico} </Text>
            {status === 'running' ? (
              <Text color={col} bold>{label}</Text>
            ) : (
              <Text color={col}>{label}</Text>
            )}
            {status === 'running' && (
              <Text color={colors.muted}> {spinnerChar}</Text>
            )}
            {countHint !== '' ? (
              <Text color={colors.muted}>  {countHint}</Text>
            ) : message !== '' ? (
              <Text color={colors.muted}> — {message}</Text>
            ) : null}
          </Box>
        );
      })}

      {/* Done message */}
      {isDone && finalMessage !== '' && (
        <Box marginTop={1}>
          <Text color={colors.success} bold>Done: {finalMessage}</Text>
        </Box>
      )}
    </Panel>
  );
}
