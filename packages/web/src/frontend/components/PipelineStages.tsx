/**
 * PipelineStages — Horizontal pipeline stage progression display.
 * Shows 5 stages: Init -> Review -> Discuss -> Verdict -> Complete
 */

import React from 'react';
import type { StageState, PipelineStage } from '../hooks/usePipelineEvents.js';
import { ProgressBar } from './ProgressBar.js';
import type { ProgressBarVariant } from './ProgressBar.js';

interface PipelineStagesProps {
  stages: StageState[];
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  init: 'Init',
  review: 'Review',
  discuss: 'Discuss',
  verdict: 'Verdict',
  complete: 'Complete',
};

const STAGE_ICONS: Record<string, string> = {
  pending: '\u25CB',
  active: '\u25CF',
  complete: '\u2713',
  error: '\u2717',
};

function getProgressVariant(status: string): ProgressBarVariant {
  switch (status) {
    case 'complete':
      return 'complete';
    case 'error':
      return 'error';
    default:
      return 'active';
  }
}

export function PipelineStages({ stages }: PipelineStagesProps): React.JSX.Element {
  return (
    <div className="pipeline-stages">
      {stages.map((stage, idx) => {
        const statusClass = `stage--${stage.status}`;
        const icon = STAGE_ICONS[stage.status] ?? STAGE_ICONS.pending;

        return (
          <React.Fragment key={stage.name}>
            <div className={`stage ${statusClass}`}>
              <div className="stage-header">
                <span className={`stage-icon stage-icon--${stage.status}`}>
                  {icon}
                </span>
                <span className="stage-label">
                  {STAGE_LABELS[stage.name] ?? stage.name}
                </span>
              </div>
              <ProgressBar
                progress={stage.progress}
                variant={getProgressVariant(stage.status)}
                showLabel={stage.status !== 'pending'}
              />
              {stage.message && (
                <p className="stage-message">{stage.message}</p>
              )}
            </div>
            {idx < stages.length - 1 && (
              <span className="stage-connector">{'\u2192'}</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
