import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface DiffHunk {
  header: string;
  lines: string[];
  startLine: number;
  scopeName?: string;
}

export interface DiffIssue {
  line: number;
  severity: string;
  title: string;
}

export interface DiffFile {
  filePath: string;
  hunks: DiffHunk[];
  issues: DiffIssue[];
}

interface Props {
  files: DiffFile[];
}

// ============================================================================
// Helpers
// ============================================================================

const VIEWPORT_HEIGHT = 20;

function severityColor(severity: string): string {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL' || s === 'HARSHLY_CRITICAL') return 'red';
  if (s === 'WARNING') return 'yellow';
  if (s === 'SUGGESTION') return 'cyan';
  return 'white';
}

type RenderedLine =
  | { type: 'hunk-header'; text: string }
  | { type: 'hunk-collapsed'; count: number }
  | { type: 'diff-line'; text: string; prefix: string }
  | { type: 'issue-badge'; severity: string; title: string };

function buildLines(file: DiffFile, collapsed: boolean): RenderedLine[] {
  const issuesByLine = new Map<number, DiffIssue[]>();
  for (const issue of file.issues) {
    const arr = issuesByLine.get(issue.line) ?? [];
    arr.push(issue);
    issuesByLine.set(issue.line, arr);
  }

  const result: RenderedLine[] = [];

  for (const hunk of file.hunks) {
    // Determine if hunk has issues
    const hunkIssueLines = new Set(
      file.issues
        .filter(iss => {
          // Issues within hunk range
          const end = hunk.startLine + hunk.lines.length;
          return iss.line >= hunk.startLine && iss.line < end;
        })
        .map(i => i.line)
    );

    const headerText = hunk.scopeName
      ? `${hunk.header}  [${hunk.scopeName}]`
      : hunk.header;

    result.push({ type: 'hunk-header', text: headerText });

    if (collapsed && hunkIssueLines.size === 0) {
      result.push({ type: 'hunk-collapsed', count: hunk.lines.length });
      continue;
    }

    let lineNum = hunk.startLine;
    for (const rawLine of hunk.lines) {
      const prefix = rawLine[0] ?? ' ';
      result.push({ type: 'diff-line', text: rawLine, prefix });

      // After lines that have issues, inject badges
      const issues = issuesByLine.get(lineNum);
      if (issues) {
        for (const iss of issues) {
          result.push({ type: 'issue-badge', severity: iss.severity, title: iss.title });
        }
      }

      if (prefix !== '-') lineNum++;
    }
  }

  return result;
}

// ============================================================================
// Component
// ============================================================================

export function DiffViewer({ files }: Props): React.JSX.Element {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      setScrollOffset(o => o + 1);
    } else if (input === 'k' || key.upArrow) {
      setScrollOffset(o => Math.max(0, o - 1));
    } else if (key.tab && !key.shift) {
      setActiveFileIndex(i => (i + 1) % Math.max(1, files.length));
      setScrollOffset(0);
    } else if (key.tab && key.shift) {
      setActiveFileIndex(i => (i - 1 + Math.max(1, files.length)) % Math.max(1, files.length));
      setScrollOffset(0);
    } else if (input === 'c') {
      setCollapsed(c => !c);
      setScrollOffset(0);
    }
  });

  if (files.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No diff files to display.</Text>
      </Box>
    );
  }

  const safeIndex = Math.min(activeFileIndex, files.length - 1);
  const activeFile = files[safeIndex]!;
  const lines = buildLines(activeFile, collapsed);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + VIEWPORT_HEIGHT);
  const canScrollDown = scrollOffset + VIEWPORT_HEIGHT < lines.length;

  return (
    <Box flexDirection="column">
      {/* File tabs */}
      <Box flexDirection="row" marginBottom={1}>
        {files.map((f, idx) => {
          const name = path.basename(f.filePath);
          const isActive = idx === safeIndex;
          return (
            <Box key={f.filePath} marginRight={1}>
              {isActive ? (
                <Text bold color="cyan">[{name}]</Text>
              ) : (
                <Text dimColor> {name} </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Diff content */}
      <Box flexDirection="column">
        {visibleLines.map((line, idx) => {
          if (line.type === 'hunk-header') {
            return (
              <Box key={idx}>
                <Text dimColor>{line.text}</Text>
              </Box>
            );
          }
          if (line.type === 'hunk-collapsed') {
            return (
              <Box key={idx}>
                <Text dimColor>... {line.count} lines (no issues)</Text>
              </Box>
            );
          }
          if (line.type === 'diff-line') {
            const prefix = line.prefix;
            if (prefix === '+') {
              return (
                <Box key={idx}>
                  <Text color="green">{line.text}</Text>
                </Box>
              );
            }
            if (prefix === '-') {
              return (
                <Box key={idx}>
                  <Text color="red">{line.text}</Text>
                </Box>
              );
            }
            return (
              <Box key={idx}>
                <Text dimColor>{line.text}</Text>
              </Box>
            );
          }
          if (line.type === 'issue-badge') {
            return (
              <Box key={idx}>
                <Text color={severityColor(line.severity)} bold>
                  {'  '}[{line.severity}] {line.title}
                </Text>
              </Box>
            );
          }
          return null;
        })}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Tab: next file | j/k: scroll | c: {collapsed ? 'expand' : 'collapse'} hunks
          {canScrollDown ? ' | more below' : ''}
        </Text>
      </Box>
    </Box>
  );
}
