import React, { useState } from 'react';
import type { AggregatedIssue } from '../utils/review-helpers.js';
import { severityClassMap, severityLabelMap } from '../utils/review-helpers.js';

// ============================================================================
// Types
// ============================================================================

interface Props {
  evidenceDocs: AggregatedIssue[];
}

type TriageTab = 'must-fix' | 'verify' | 'suggestions';

// ============================================================================
// Triage logic (inlined from @codeagora/shared/utils/triage)
// ============================================================================

function classifyIssue(issue: AggregatedIssue): TriageTab {
  const conf = issue.confidenceTrace?.final ?? issue.confidence ?? 50;
  if (conf < 20) return 'suggestions';
  const isCritical = issue.severity === 'CRITICAL' || issue.severity === 'HARSHLY_CRITICAL';
  const isWarning = issue.severity === 'WARNING';
  if (isCritical && conf > 50) return 'must-fix';
  if ((isCritical && conf <= 50) || (isWarning && conf > 50)) return 'verify';
  return 'suggestions';
}

// ============================================================================
// Component
// ============================================================================

export function TriageTabs({ evidenceDocs }: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TriageTab>('must-fix');

  const mustFix = evidenceDocs.filter(d => classifyIssue(d) === 'must-fix');
  const verify = evidenceDocs.filter(d => classifyIssue(d) === 'verify');
  const suggestions = evidenceDocs.filter(d => classifyIssue(d) === 'suggestions');

  const counts: Record<TriageTab, number> = {
    'must-fix': mustFix.length,
    'verify': verify.length,
    'suggestions': suggestions.length,
  };

  const activeIssues: AggregatedIssue[] =
    activeTab === 'must-fix' ? mustFix
    : activeTab === 'verify' ? verify
    : suggestions;

  return (
    <div>
      {/* Tab bar */}
      <div className="triage-tabs">
        {(['must-fix', 'verify', 'suggestions'] as TriageTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            className={`triage-tab${activeTab === tab ? ' triage-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab} ({counts[tab]})
          </button>
        ))}
      </div>

      {/* Issue list */}
      {activeIssues.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', padding: '16px 0' }}>
          No {activeTab} issues.
          {activeTab === 'must-fix' && ' 🚀 Ready to ship!'}
        </p>
      ) : (
        <div className="review-detail__issues">
          {activeIssues.map((issue, idx) => (
            <div
              key={`${issue.filePath}-${issue.lineRange[0]}-${idx}`}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '12px',
                background: 'var(--color-bg-secondary)',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span className={`severity-badge ${severityClassMap[issue.severity]}`}>
                  {severityLabelMap[issue.severity]}
                </span>
                {(() => {
                  const conf = issue.confidenceTrace?.final ?? issue.confidence;
                  return conf !== undefined ? (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {conf}% confidence
                    </span>
                  ) : null;
                })()}
                <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                  {issue.filePath}:{issue.lineRange[0]}-{issue.lineRange[1]}
                </span>
                {issue.reviewers.length > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {issue.reviewers.length} reviewer{issue.reviewers.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Title */}
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>{issue.issueTitle}</div>

              {/* Suggestion */}
              {issue.suggestion && (
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                  <strong>Fix:</strong> {issue.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
