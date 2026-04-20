import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';
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
type TriageTab = 'must-fix' | 'verify' | 'suggestions';

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

/** Classify an issue for triage */
function classifyIssue(issue: Issue): TriageTab {
  const conf = (issue as unknown as { confidence?: number }).confidence ?? 50;
  if (conf < 20) return 'suggestions';
  const isCritical = issue.severity === 'CRITICAL' || issue.severity === 'HARSHLY_CRITICAL';
  const isWarning = issue.severity === 'WARNING';
  if (isCritical && conf > 50) return 'must-fix';
  if ((isCritical && conf <= 50) || (isWarning && conf > 50)) return 'verify';
  return 'suggestions';
}

const TRIAGE_TABS: TriageTab[] = ['must-fix', 'verify', 'suggestions'];

function nextTab(current: TriageTab): TriageTab {
  const idx = TRIAGE_TABS.indexOf(current);
  return TRIAGE_TABS[(idx + 1) % TRIAGE_TABS.length] ?? current;
}

function prevTab(current: TriageTab): TriageTab {
  const idx = TRIAGE_TABS.indexOf(current);
  return TRIAGE_TABS[(idx - 1 + TRIAGE_TABS.length) % TRIAGE_TABS.length] ?? current;
}

function copyToClipboard(text: string): void {
  try {
    const proc = spawn('pbcopy');
    proc.stdin.write(text);
    proc.stdin.end();
  } catch {
    // Clipboard not available
  }
}

function exportToJson(result: PipelineResult): string {
  const filename = `codeagora-export-${Date.now()}.json`;
  writeFileSync(filename, JSON.stringify(result, null, 2));
  return filename;
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
  const [triageTab, setTriageTab] = useState<TriageTab>('must-fix');
  const [statusMsg, setStatusMsg] = useState('');

  const summary = result.summary;
  const allIssues: Issue[] = summary?.topIssues ?? [];

  // Filter issues by current triage tab
  const filteredIssues = allIssues.filter(iss => classifyIssue(iss) === triageTab);

  const { cols, rows } = getTerminalSize();
  const totalCols = Math.max(cols, MIN_COLS);
  const listWidth = Math.floor(totalCols * LIST_WIDTH_RATIO);
  const detailWidth = Math.floor(totalCols * DETAIL_WIDTH_RATIO);
  const listHeight = Math.max(6, Math.min(filteredIssues.length, rows - 12));

  useInput((input, key) => {
    if (viewMode === 'list') {
      if (input === 'j' || key.downArrow) {
        setSelectedIndex(i => Math.min(i + 1, filteredIssues.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (key.return && filteredIssues.length > 0) {
        setViewMode('detail');
      } else if (input === 'v' && onViewContext) {
        onViewContext();
      } else if (key.tab && !key.shift) {
        setTriageTab(nextTab(triageTab));
        setSelectedIndex(0);
      } else if (key.tab && key.shift) {
        setTriageTab(prevTab(triageTab));
        setSelectedIndex(0);
      } else if (input === 'c') {
        const issue = filteredIssues[selectedIndex];
        if (issue) {
          const text = `[${issue.severity}] ${issue.filePath}:${lineRangeStr(issue)}\n${issue.title}`;
          copyToClipboard(text);
          setStatusMsg('Copied to clipboard');
          setTimeout(() => setStatusMsg(''), 2000);
        }
      } else if (input === 'e') {
        try {
          const filename = exportToJson(result);
          setStatusMsg(`Exported: ${filename}`);
          setTimeout(() => setStatusMsg(''), 3000);
        } catch {
          setStatusMsg('Export failed');
          setTimeout(() => setStatusMsg(''), 2000);
        }
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
    const issue = filteredIssues[selectedIndex];
    if (!issue) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text>No issue selected.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
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
  const tricounts = {
    'must-fix': allIssues.filter(i => classifyIssue(i) === 'must-fix').length,
    'verify': allIssues.filter(i => classifyIssue(i) === 'verify').length,
    'suggestions': allIssues.filter(i => classifyIssue(i) === 'suggestions').length,
  };

  return (
    <Box flexDirection="column">
      {/* Decision header */}
      <Box paddingX={1} marginBottom={0}>
        <Text bold>Decision: </Text>
        <Text color={decColor} bold>{summary.decision}</Text>
        <Text color={colors.muted}>{'  '}{summary.reasoning}</Text>
      </Box>

      {/* Severity count summary bar */}
      <Box paddingX={1} marginBottom={0}>
        <SeverityBar severityCounts={summary.severityCounts} />
      </Box>

      {/* Triage tab bar */}
      <Box paddingX={1} marginBottom={1}>
        {TRIAGE_TABS.map((tab, idx) => (
          <Box key={tab} marginRight={idx < TRIAGE_TABS.length - 1 ? 1 : 0}>
            <Text
              bold={triageTab === tab}
              color={triageTab === tab ? colors.primary : colors.muted}
              underline={triageTab === tab}
            >
              [{tab}:{tricounts[tab]}]
            </Text>
          </Box>
        ))}
      </Box>

      {/* Empty tab: celebrate if no must-fix */}
      {filteredIssues.length === 0 && triageTab === 'must-fix' && (
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.success} bold>Ship it! 🚀 No must-fix issues.</Text>
        </Box>
      )}

      {/* Master-detail layout */}
      <Box flexDirection="row">
        {/* Left: issue list */}
        <Panel title={`Issues (${triageTab})`} width={listWidth}>
          <ScrollableList
            items={filteredIssues}
            selectedIndex={selectedIndex}
            height={listHeight}
            emptyMessage={`No ${triageTab} issues.`}
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
          {filteredIssues.length === 0 ? (
            <Text color={colors.success}>{icons.check} No issues.</Text>
          ) : (() => {
            const issue = filteredIssues[selectedIndex];
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

      {/* Status message (copy/export feedback) */}
      {statusMsg !== '' && (
        <Box paddingX={1} marginTop={0}>
          <Text color={colors.success}>{statusMsg}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box paddingX={1} marginTop={0}>
        <Text dimColor>
          j/k scroll{'  '}Tab/Shift+Tab tabs{'  '}Enter detail{'  '}c copy{'  '}e export
          {onViewContext ? '  v context' : ''}{'  '}q: back
        </Text>
      </Box>
    </Box>
  );
}
