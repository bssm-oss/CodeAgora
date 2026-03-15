import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { ProgressEmitter } from '../../pipeline/progress.js';
import { runPipeline } from '../../pipeline/orchestrator.js';
import type { PipelineResult } from '../../pipeline/orchestrator.js';
import { PipelineProgress } from '../components/PipelineProgress.js';

// ============================================================================
// Types
// ============================================================================

interface Props {
  diffPath: string;
  onComplete: (result: PipelineResult) => void;
  onError: (error: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function PipelineScreen({ diffPath, onComplete, onError }: Props): React.JSX.Element {
  const [progress] = useState(() => new ProgressEmitter());
  const [statusMessage, setStatusMessage] = useState('Starting pipeline...');

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setStatusMessage('Running pipeline...');
      const result = await runPipeline({ diffPath }, progress);
      if (cancelled) return;
      if (result.status === 'error') {
        setStatusMessage(`Error: ${result.error ?? 'Unknown error'}`);
        onError(result.error ?? 'Unknown error');
      } else {
        setStatusMessage('Pipeline complete');
        onComplete(result);
      }
    }

    run().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Error: ${message}`);
      onError(message);
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffPath]);

  return (
    <Box flexDirection="column">
      <PipelineProgress progress={progress} />
      <Box paddingX={1}>
        <Text color="gray">{statusMessage}</Text>
      </Box>
    </Box>
  );
}
