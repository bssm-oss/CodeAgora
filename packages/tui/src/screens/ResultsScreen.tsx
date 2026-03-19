import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import { Panel } from '../components/Panel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { DetailRow } from '../components/DetailRow.js';
import {
  colors,
  icons,
  severityColor,
  severityIcon,
  decisionColor,
  getTerminalSize,
  LIST_WIDTH_RATIO,
  DETAIL_WIDTH_RATIO,
  MIN_COLS,
} from '../theme.js';

// ============================================================================
// Types
// ============================================================================

interface Props {
  result: PipelineResult;
  onHome?: () => void;
  onViewContext?: () => void;
}

type ViewMode = 'list' | 'detail';

type Issue = NonNullable<NonNullable<PipelineResult['summary']>['topIssues']>[number];

// ============================================================================
// Helpers
// ============================================================================

function lineRangeStr(issue: Issue): string {
  if (issue.lineRange[1] !== issue.lineRange[0]) {
    return `${issue.lineRange[0]}-${issue.lineRange[1]}`;
  }
  return String(issue.lineRange[0]);
}

// ============================================================================
// Sub-components
// ============================================================================

function SeverityBar({ severityCounts }: { severityCounts: Record<string, number> }): React.JSX.Element {
  const entries = Object.entries(severityCounts).filter(([, count]) => count > 0);
  if (entries.length === 0) return <Box />;

  return (
    <Box marginBottom={1}>
      {entries.map(([sev, count], idx) => (
        <Box key={sev} marginRight={idx < entries.length - 1 ? 2 : 0}>
          <Text color={severityColor(sev)}>{severityIcon(sev)}{count} {sev}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ResultsScreen({ result, onHome: _onHome, onViewContext }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const summary = result.summary;
  const issues: Issue[] = summary?.topIssues ?? [];

  const { cols } = getTerminalSize();
  const totalCols = Math.max(cols, MIN_COLS);
  const listWidth = Math.floor(totalCols * LIST_WIDTH_RATIO);
  const detailWidth = Math.floor(totalCols * DETAIL_WIDTH_RATIO);
  // List viewport height: rows minus header/footer/border
  const listHeight = Math.max(6, issues.length);

  useInput((input, key) => {
    if (viewMode === 'list') {
      if (input === 'j' || key.downArrow) {
        setSelectedIndex(i => Math.min(i + 1, issues.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (key.return && issues.length > 0) {
        setViewMode('detail');
      } else if (input === 'v' && onViewContext) {
        onViewContext();
      }
    } else {
      if (key.escape || input === 'q') {
        setViewMode('list');
      }
    }
  });

  // ---- No summary ----
  if (!summary) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Results</Text>
        <Text color={colors.warning}>No summary available for this result.</Text>
      </Box>
    );
  }

  const decColor = decisionColor(summary.decision);

  // ---- Detail view ----
  if (viewMode === 'detail') {
    const issue = issues[selectedIndex];
    if (!issue) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text>No issue selected.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        {/* Decision header */}
        <Box paddingX={1} marginBottom={1}>
          <Text bold>Decision: </Text>
          <Text color={decColor} bold>{summary.decision}</Text>
        </Box>

        <Panel title="Issue Detail" width={totalCols}>
          <Box marginBottom={1}>
            <Text color={severityColor(issue.severity)} bold>
              {severityIcon(issue.severity)} {issue.severity}
            </Text>
          </Box>
          <DetailRow label="File" value={issue.filePath} color={colors.primary} labelWidth={12} />
          <DetailRow label="Lines" value={lineRangeStr(issue)} color={colors.muted} labelWidth={12} />
          <DetailRow label="Title" value={issue.title} highlight labelWidth={12} />
          {'suggestion' in issue && typeof (issue as Record<string, unknown>)['suggestion'] === 'string' ? (
            <DetailRow
              label="Suggestion"
              value={(issue as Record<string, unknown>)['suggestion'] as string}
              color={colors.secondary}
              labelWidth={12}
            />
          ) : null}
        </Panel>

        <Box paddingX={1} marginTop={1}>
          <Text dimColor>Escape/q: back to list</Text>
        </Box>
      </Box>
    );
  }

  // ---- List view ----
  return (
    <Box flexDirection="column">
      {/* Decision header */}
      <Box paddingX={1} marginBottom={0}>
        <Text bold>Decision: </Text>
        <Text color={decColor} bold>{summary.decision}</Text>
        <Text color={colors.muted}>{'  '}{summary.reasoning}</Text>
      </Box>

      {/* Severity count summary bar */}
      <Box paddingX={1} marginBottom={1}>
        <SeverityBar severityCounts={summary.severityCounts} />
      </Box>

      {/* Master-detail layout */}
      <Box flexDirection="row">
        {/* Left: issue list */}
        <Panel title="Issues" width={listWidth}>
          <ScrollableList
            items={issues}
            selectedIndex={selectedIndex}
            height={listHeight}
            emptyMessage="No issues found."
            renderItem={(issue, _idx, isSelected) => (
              <Box flexDirection="column">
                <Box>
                  <Text color={severityColor(issue.severity)}>
                    {severityIcon(issue.severity)}{' '}
                  </Text>
                  <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                    {issue.filePath}:{issue.lineRange[0]}
                  </Text>
                </Box>
                <Box paddingLeft={2}>
                  <Text color={colors.muted}>{issue.title}</Text>
                </Box>
              </Box>
            )}
          />
        </Panel>

        {/* Right: detail panel */}
        <Panel title="Detail" width={detailWidth}>
          {issues.length === 0 ? (
            <Text color={colors.success}>{icons.check} No issues found.</Text>
          ) : (() => {
            const issue = issues[selectedIndex];
            if (!issue) return <Text dimColor>Select an issue</Text>;
            return (
              <Box flexDirection="column">
                <Box marginBottom={1}>
                  <Text color={severityColor(issue.severity)} bold>
                    {severityIcon(issue.severity)} {issue.severity}
                  </Text>
                </Box>
                <DetailRow label="File" value={issue.filePath} color={colors.primary} labelWidth={12} />
                <DetailRow label="Lines" value={lineRangeStr(issue)} color={colors.muted} labelWidth={12} />
                <DetailRow label="Title" value={issue.title} highlight labelWidth={12} />
                {'suggestion' in issue && typeof (issue as Record<string, unknown>)['suggestion'] === 'string' ? (
                  <DetailRow
                    label="Suggestion"
                    value={(issue as Record<string, unknown>)['suggestion'] as string}
                    color={colors.secondary}
                    labelWidth={12}
                  />
                ) : null}
              </Box>
            );
          })()}
        </Panel>
      </Box>

      {/* Footer */}
      <Box paddingX={1} marginTop={0}>
        <Text dimColor>
          j/k scroll{'  '}Enter detail{'  '}
          {onViewContext ? 'v context  ' : ''}q: back
        </Text>
      </Box>
    </Box>
  );
}
