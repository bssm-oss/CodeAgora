import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { ProgressEmitter } from '@codeagora/core/pipeline/progress.js';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
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
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setStatusMessage('Running pipeline...');
      const result = await runPipeline({ diffPath }, progress);
      if (cancelled) return;
      if (result.status === 'error') {
        setStatusMessage(`Error: ${result.error ?? 'Unknown error'}`);
        setHasError(true);
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
      setHasError(true);
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
        <Text color={hasError ? 'red' : 'gray'}>{statusMessage}</Text>
      </Box>
      {hasError && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>q: back to home</Text>
        </Box>
      )}
    </Box>
  );
}
