import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { ProgressEmitter, PipelineStage, ProgressEvent } from '../../pipeline/progress.js';

// ============================================================================
// Types
// ============================================================================

type StageStatus = 'pending' | 'running' | 'complete' | 'error';

interface StageState {
  status: StageStatus;
  message: string;
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

const STAGE_INDICATORS: Record<StageStatus, string> = {
  pending: '  ',
  running: '>>',
  complete: '✓ ',
  error: '✗ ',
};

const STAGE_COLORS: Record<StageStatus, string> = {
  pending: 'gray',
  running: 'yellow',
  complete: 'green',
  error: 'red',
};

// ============================================================================
// Component
// ============================================================================

export function PipelineProgress({ progress }: Props): React.JSX.Element {
  const [stages, setStages] = useState<Record<PipelineStage, StageState>>({
    init: { status: 'pending', message: '' },
    review: { status: 'pending', message: '' },
    discuss: { status: 'pending', message: '' },
    verdict: { status: 'pending', message: '' },
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
          next[stage] = { status: 'running', message: event.message };
        } else if (event.event === 'stage-update') {
          next[stage] = { status: 'running', message: event.message };
        } else if (event.event === 'stage-complete') {
          next[stage] = { status: 'complete', message: event.message };
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

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s}s`;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Pipeline Progress </Text>
        <Text color="gray">[{formatElapsed(elapsedSeconds)}]</Text>
      </Box>

      {PIPELINE_STAGES.map(({ key, label }) => {
        const state = stages[key];
        const status = state?.status ?? 'pending';
        const message = state?.message ?? '';
        const indicator = STAGE_INDICATORS[status];
        const color = STAGE_COLORS[status];
        const spinner = status === 'running' ? spinnerChar + ' ' : '  ';

        return (
          <Box key={key} marginBottom={0}>
            <Text color={color}>
              {indicator}{spinner}{label}
            </Text>
            {message !== '' && (
              <Text color="gray"> — {message}</Text>
            )}
          </Box>
        );
      })}

      {isDone && finalMessage !== '' && (
        <Box marginTop={1}>
          <Text color="green" bold>Done: {finalMessage}</Text>
        </Box>
      )}
    </Box>
  );
}
