import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffViewer } from '../components/DiffViewer.js';
import type { DiffFile, DiffHunk, DiffIssue } from '../components/DiffViewer.js';
import { colors } from '../theme.js';
import { t } from '@codeagora/shared/i18n/index.js';

// ============================================================================
// Types
// ============================================================================

interface EvidenceDoc {
  severity: string;
  filePath: string;
  lineRange: [number, number];
  issueTitle: string;
  suggestion?: string;
}

interface Props {
  diffContent: string;
  evidenceDocs: EvidenceDoc[];
  onBack: () => void;
}

// ============================================================================
// Inline diff parser (lightweight, no chunker import)
// ============================================================================

function parseDiffToFiles(diffContent: string): Array<{ filePath: string; hunks: DiffHunk[] }> {
  if (!diffContent.trim()) return [];

  // Split on diff --git boundaries
  const fileSections = diffContent.split(/^diff --git /m).filter(s => s.trim());

  return fileSections.map(section => {
    // Extract file path from "a/path b/path" header
    const headerMatch = section.match(/^a\/(.+?) b\//);
    const filePath = headerMatch ? headerMatch[1]! : 'unknown';

    const hunks: DiffHunk[] = [];

    // Split on @@ hunk headers
    const hunkParts = section.split(/^(@@[^\n]*@@[^\n]*)\n/m);

    // hunkParts layout: [pre-hunk text, hunkHeader, hunkBody, hunkHeader, hunkBody, ...]
    for (let i = 1; i < hunkParts.length - 1; i += 2) {
      const header = (hunkParts[i] ?? '').trim();
      const body = hunkParts[i + 1] ?? '';

      // Parse start line from @@ -start,count +start,count @@
      const lineMatch = header.match(/@@ -(\d+)/);
      const startLine = lineMatch ? parseInt(lineMatch[1]!, 10) : 1;

      // Extract scope name from hunk header (text after second @@)
      const scopeMatch = header.match(/@@ [^@]+ @@ (.+)/);
      const scopeName = scopeMatch ? scopeMatch[1]!.trim() : undefined;

      const lines = body.split('\n').filter(l => l.length > 0 || body.includes('\n'));
      // Filter out empty trailing lines from split
      const filteredLines = lines.filter((l, idx) => !(idx === lines.length - 1 && l === ''));

      hunks.push({ header, lines: filteredLines, startLine, scopeName });
    }

    return { filePath, hunks };
  });
}

// ============================================================================
// Component
// ============================================================================

export function ContextScreen({ diffContent, evidenceDocs, onBack }: Props): React.JSX.Element {
  useInput((input) => {
    if (input === 'q') {
      onBack();
    }
  });

  const diffFiles = useMemo<DiffFile[]>(() => {
    const parsed = parseDiffToFiles(diffContent);

    return parsed.map(({ filePath, hunks }) => {
      // Map evidence docs to issues for this file
      const issues: DiffIssue[] = evidenceDocs
        .filter(doc => {
          // Match by basename or full path suffix
          const docBase = doc.filePath.replace(/\\/g, '/');
          const fileBase = filePath.replace(/\\/g, '/');
          return fileBase.endsWith(docBase) || docBase.endsWith(fileBase) || fileBase === docBase;
        })
        .map(doc => ({
          line: doc.lineRange[0],
          severity: doc.severity,
          title: doc.issueTitle,
        }));

      return { filePath, hunks, issues };
    });
  }, [diffContent, evidenceDocs]);

  if (diffFiles.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.primary}>{t('context.title')}</Text>
        <Text color={colors.warning}>{t('context.noDiff')}</Text>
        <Box marginTop={1}>
          <Text dimColor>{t('context.back')}</Text>
        </Box>
      </Box>
    );
  }

  const filesLabel = diffFiles.length === 1
    ? t('context.files').replace('{count}', String(diffFiles.length))
    : t('context.filesPlural').replace('{count}', String(diffFiles.length));

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>{t('context.title')}</Text>
        <Text dimColor>  {filesLabel}</Text>
      </Box>
      <DiffViewer files={diffFiles} />
      <Box marginTop={1}>
        <Text dimColor>{t('context.back')}</Text>
      </Box>
    </Box>
  );
}
