/**
 * L1 Parser - Evidence Document Parser
 * Parses reviewer responses into structured evidence documents
 */

import type { EvidenceDocument, Severity } from '../types/core.js';
import { fuzzyMatchFilePath } from '@codeagora/shared/utils/diff.js';

// ============================================================================
// Evidence Document Parser
// ============================================================================

const EVIDENCE_BLOCK_REGEX = /## Issue:\s*(.+?)\n[\s\S]*?### 문제\n([\s\S]*?)### 근거\n([\s\S]*?)### 심각도\n([\s\S]*?)### 제안\n([\s\S]*?)(?=\n## Issue:|$)/gi;

/**
 * Parse reviewer response into evidence documents
 */
export function parseEvidenceResponse(
  response: string,
  diffFilePaths?: string[]
): EvidenceDocument[] {
  const documents: EvidenceDocument[] = [];
  const matches = Array.from(response.matchAll(EVIDENCE_BLOCK_REGEX));

  for (const match of matches) {
    try {
      const [_, title, problem, evidenceText, severityText, suggestion] = match;

      const evidence = evidenceText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.match(/^\d+\./))
        .map((line) => line.replace(/^\d+\.\s*/, ''));

      let severity = parseSeverity(severityText.trim());
      const fileInfo = extractFileInfo(problem, diffFilePaths);

      // Escalate severity to CRITICAL minimum when file path is unknown
      if (fileInfo.filePath === 'unknown') {
        if (severity === 'SUGGESTION' || severity === 'WARNING') {
          severity = 'CRITICAL';
        }
        // CRITICAL and HARSHLY_CRITICAL are preserved as-is
      }

      documents.push({
        issueTitle: title.trim(),
        problem: problem.trim(),
        evidence,
        severity,
        suggestion: suggestion.trim(),
        filePath: fileInfo.filePath,
        lineRange: fileInfo.lineRange,
      });
    } catch (_error) {
      // Skip malformed evidence blocks
      continue;
    }
  }

  // Only treat as "no issues" when no evidence blocks were parsed AND
  // the response explicitly says so (not just contains the phrase in passing)
  if (documents.length === 0) {
    const lowerResponse = response.toLowerCase().trim();
    if (
      lowerResponse.includes('no issues found') ||
      lowerResponse.includes('no problems found') ||
      /^(the\s+)?(code\s+)?looks\s+good/m.test(lowerResponse)
    ) {
      return [];
    }
  }

  return documents;
}

// ============================================================================
// Helpers
// ============================================================================

function parseSeverity(severityText: string): Severity {
  const normalized = severityText.toUpperCase().trim();

  if (normalized.includes('HARSHLY_CRITICAL') || normalized.includes('HARSHLY CRITICAL')) {
    return 'HARSHLY_CRITICAL';
  }
  if (normalized.includes('CRITICAL')) {
    return 'CRITICAL';
  }
  if (normalized.includes('WARNING')) {
    return 'WARNING';
  }
  return 'SUGGESTION';
}

function extractFileInfo(
  problemText: string,
  diffFilePaths?: string[]
): {
  filePath: string;
  lineRange: [number, number];
} {
  // Try multiple patterns in order of specificity
  const patterns = [
    // Primary format: "In file.ts:10-20" or "In file.ts:10"
    /In\s+([a-zA-Z0-9_/.-]+\.[a-z]+):(\d+)(?:-(\d+))?/i,

    // With comma: "In file.ts, line 10" or "In file.ts,10"
    /In\s+([a-zA-Z0-9_/.-]+\.[a-z]+),?\s*(?:line\s+)?(\d+)(?:-(\d+))?/i,

    // Without "In": "file.ts:10-20" or "file.ts:10"
    /([a-zA-Z0-9_/.-]+\.[a-z]+):(\d+)(?:-(\d+))?/,

    // Space separated: "file.ts line 10"
    /([a-zA-Z0-9_/.-]+\.[a-z]+)\s+line\s+(\d+)(?:-(\d+))?/i,
  ];

  for (const pattern of patterns) {
    const fileMatch = problemText.match(pattern);

    if (fileMatch) {
      const filePath = fileMatch[1];
      const lineStart = parseInt(fileMatch[2], 10);
      const lineEnd = fileMatch[3] ? parseInt(fileMatch[3], 10) : lineStart;

      return {
        filePath,
        lineRange: [lineStart, lineEnd],
      };
    }
  }

  // Fallback: Try fuzzy matching if diff file paths are provided
  if (diffFilePaths && diffFilePaths.length > 0) {
    const matchedPath = fuzzyMatchFilePath(problemText, diffFilePaths);

    if (matchedPath) {
      console.warn(
        `[Parser] Used fuzzy matching: "${problemText.substring(0, 50)}..." -> ${matchedPath}`
      );

      // Try to extract line numbers with context clues (avoid matching years/error codes)
      const linePatterns = [
        /(?:line\s+)(\d+)(?:\s*-\s*(\d+))?/i,
        /:(\d+)(?:-(\d+))?/,
        /(?:lines?\s+)(\d+)(?:\s*(?:-|to)\s*(\d+))?/i,
      ];
      let lineStart = 1;
      let lineEnd = 1;
      for (const lp of linePatterns) {
        const lm = problemText.match(lp);
        if (lm) {
          lineStart = parseInt(lm[1], 10);
          lineEnd = lm[2] ? parseInt(lm[2], 10) : lineStart;
          break;
        }
      }

      return {
        filePath: matchedPath,
        lineRange: [lineStart, lineEnd],
      };
    }
  }

  // Final fallback: log warning
  console.warn(
    '[Parser] Failed to extract file info from problem text:',
    problemText.substring(0, 100)
  );

  return {
    filePath: 'unknown',
    lineRange: [0, 0],
  };
}
