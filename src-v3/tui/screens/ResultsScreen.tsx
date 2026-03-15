import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PipelineResult } from '../../pipeline/orchestrator.js';

interface Props {
  result: PipelineResult;
}

type ViewMode = 'list' | 'detail';

function severityColor(severity: string): string {
  switch (severity) {
    case 'HARSHLY_CRITICAL': return 'red';
    case 'CRITICAL': return 'red';
    case 'WARNING': return 'yellow';
    case 'SUGGESTION': return 'cyan';
    default: return 'white';
  }
}

function decisionBgColor(decision: string): { color: string; bold: boolean } {
  switch (decision) {
    case 'ACCEPT': return { color: 'green', bold: true };
    case 'REJECT': return { color: 'red', bold: true };
    case 'NEEDS_HUMAN': return { color: 'yellow', bold: true };
    default: return { color: 'white', bold: false };
  }
}

export function ResultsScreen({ result }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const summary = result.summary;
  const issues = summary?.topIssues ?? [];

  useInput((input, key) => {
    if (viewMode === 'list') {
      if (input === 'j' || key.downArrow) {
        setSelectedIndex(i => Math.min(i + 1, issues.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (key.return && issues.length > 0) {
        setViewMode('detail');
      }
    } else {
      if (key.escape || input === 'q') {
        setViewMode('list');
      }
    }
  });

  if (!summary) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Results</Text>
        <Text color="yellow">No summary available for this result.</Text>
      </Box>
    );
  }

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
      <Box flexDirection="column" padding={1}>
        <Text bold>Issue Details</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text bold>Severity: </Text>
            <Text color={severityColor(issue.severity)} bold>
              {issue.severity}
            </Text>
          </Box>
          <Box>
            <Text bold>File: </Text>
            <Text>{issue.filePath}</Text>
            <Text color="gray">:{issue.lineRange[0]}</Text>
            {issue.lineRange[1] !== issue.lineRange[0] && (
              <Text color="gray">-{issue.lineRange[1]}</Text>
            )}
          </Box>
          <Box marginTop={1}>
            <Text bold>Title: </Text>
            <Text>{issue.title}</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Escape/q: back to list</Text>
        </Box>
      </Box>
    );
  }

  // List view
  const { color: decColor, bold: decBold } = decisionBgColor(summary.decision);

  const severityEntries = Object.entries(summary.severityCounts);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Decision header */}
      <Box>
        <Text bold>Decision: </Text>
        <Text color={decColor} bold={decBold}>
          {summary.decision}
        </Text>
      </Box>
      <Box marginTop={0}>
        <Text dimColor>{summary.reasoning}</Text>
      </Box>

      {/* Severity summary */}
      {severityEntries.length > 0 && (
        <Box marginTop={1}>
          {severityEntries.map(([sev, count], idx) => (
            <Box key={sev} marginRight={2}>
              <Text color={severityColor(sev)}>{sev}</Text>
              <Text>: {count}</Text>
              {idx < severityEntries.length - 1 && <Text>  </Text>}
            </Box>
          ))}
        </Box>
      )}

      {/* Issue list */}
      <Box marginTop={1} flexDirection="column">
        {issues.length === 0 ? (
          <Text color="green">No issues found.</Text>
        ) : (
          issues.map((issue, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box key={`${issue.filePath}:${issue.lineRange[0]}:${idx}`}>
                {isSelected ? (
                  <Text color="cyan" bold>
                    {'> '}
                  </Text>
                ) : (
                  <Text>{'  '}</Text>
                )}
                <Text color={severityColor(issue.severity)} bold={isSelected}>
                  [{issue.severity}]
                </Text>
                <Text bold={isSelected}>
                  {' '}
                  {issue.filePath}:{issue.lineRange[0]} — {issue.title}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          {issues.length > 0 ? 'Enter: details | ' : ''}j/k: scroll | q: back
        </Text>
      </Box>
    </Box>
  );
}
