import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { ProgressEmitter } from '@codeagora/core/pipeline/progress.js';
import type { ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import { PipelineProgress } from '../components/PipelineProgress.js';
import { ReviewerCard } from '../components/ReviewerCard.js';

// ============================================================================
// Types
// ============================================================================

interface Props {
  diffPath: string;
  onComplete: (result: PipelineResult) => void;
  onError: (error: string) => void;
}

interface ReviewerState {
  status: 'running' | 'done' | 'failed';
  issueCount: number;
  elapsed: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract issue count from stage-update message: "r1: 3 issue(s) found (2/5)" */
function parseIssueCount(message: string): number {
  const match = message.match(/:\s*(\d+)\s+issue/);
  return match ? parseInt(match[1], 10) : 0;
}

// ============================================================================
// Component
// ============================================================================

export function PipelineScreen({ diffPath, onComplete, onError }: Props): React.JSX.Element {
  const [progress] = useState(() => new ProgressEmitter());
  const [statusMessage, setStatusMessage] = useState('Starting pipeline...');
  const [hasError, setHasError] = useState(false);
  const [reviewerStates, setReviewerStates] = useState<Map<string, ReviewerState>>(new Map());

  // Subscribe to progress events to update reviewer cards
  useEffect(() => {
    function handleProgress(event: ProgressEvent): void {
      if (event.stage !== 'review') return;
      const reviewerId = event.details?.reviewerId;
      if (!reviewerId) return;

      setReviewerStates(prev => {
        const next = new Map(prev);
        if (event.event === 'stage-update') {
          next.set(reviewerId, {
            status: 'done',
            issueCount: parseIssueCount(event.message),
            elapsed: 0,
          });
        } else if (event.event === 'stage-error') {
          next.set(reviewerId, {
            status: 'failed',
            issueCount: 0,
            elapsed: 0,
          });
        }
        return next;
      });
    }

    progress.onProgress(handleProgress);
    return () => {
      progress.off('progress', handleProgress);
    };
  }, [progress]);

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

  const reviewerEntries = Array.from(reviewerStates.entries());

  return (
    <Box flexDirection="column">
      {/* Reviewer cards — shown horizontally as reviewers complete */}
      {reviewerEntries.length > 0 && (
        <Box flexDirection="row" paddingX={1} marginBottom={1} flexWrap="wrap">
          {reviewerEntries.map(([id, state]) => (
            <ReviewerCard
              key={id}
              reviewerId={id}
              provider=""
              model=""
              status={state.status}
              issueCount={state.issueCount}
              elapsed={state.elapsed}
            />
          ))}
        </Box>
      )}

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
