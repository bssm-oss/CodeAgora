/**
 * L1 Parser - Evidence Document Parser
 * Parses reviewer responses into structured evidence documents
 */

import { z } from 'zod';
import type { EvidenceDocument, Severity } from '../types/core.js';
import { SeveritySchema } from '../types/core.js';
import { fuzzyMatchFilePath } from '@codeagora/shared/utils/diff.js';

// ============================================================================
// Evidence Document Parser
// ============================================================================

const EVIDENCE_BLOCK_REGEX = /## Issue:\s*(.+?)\n[\s\S]*?### (?:Problem|문제)\n([\s\S]*?)### (?:Evidence|근거)\n([\s\S]*?)### (?:Severity|심각도)\n([\s\S]*?)### (?:Suggestion|제안)\n([\s\S]*?)(?=\n## Issue:|$)/gi;

/**
 * Patterns that explicitly signal "no issues" — used both to short-circuit
 * parsing and (via isExplicitNoIssues) to suppress spurious parse-failure logs.
 *
 * Anchored to common phrasings seen in reviewer outputs across model families:
 *   - "No (significant|real|critical|major) issues|problems|concerns found/here"
 *   - "Nothing to (flag|report|fix|review|worry about)"
 *   - "(The code) looks (good|fine|ok|okay|clean|correct)"
 *   - "All (good|ok|clear)"
 *   - "LGTM" / "ship it"
 *   - Korean: "문제 없음", "이슈 없음", "괜찮"
 */
const NO_ISSUES_PATTERNS: RegExp[] = [
  /\bno\s+(?:significant|real|critical|major|obvious|notable|serious)?\s*(?:issues?|problems?|concerns?|bugs?)\b/i,
  /\bnothing\s+(?:to\s+)?(?:flag|report|fix|review|worry)\b/i,
  /\b(?:the\s+)?(?:code|diff|change)?\s*looks\s+(?:good|fine|ok|okay|clean|correct)\b/i,
  /\ball\s+(?:good|ok|okay|clear)\b/i,
  /\blgtm\b/i,
  /\bship\s+it\b/i,
  /문제\s*없/,
  /이슈\s*없/,
  /괜찮/,
];

/**
 * Returns true if `response` explicitly signals "no issues found" —
 * i.e. the parser returning [] is an intentional empty result, not a parse failure.
 * Used by L1 reviewer to suppress the unparseable-response warning log.
 */
export function isExplicitNoIssues(response: string): boolean {
  const trimmed = response.trim();
  if (trimmed.length === 0) return false;
  // Strip leading markdown header(s) like "## No Issues" / "### Result" so
  // patterns match the prose body even when prefixed with a heading.
  const normalized = trimmed.replace(/^\s*#{1,6}\s+[^\n]*\n+/, '');
  return NO_ISSUES_PATTERNS.some((p) => p.test(normalized) || p.test(trimmed));
}

// ============================================================================
// JSON output mode (#463)
//
// Cheap models often follow JSON format more reliably than markdown structure.
// When a reviewer is configured with `outputFormat: 'json'` the prompt asks
// for a JSON payload matching ReviewerJsonFindingSchema, and this parser
// accepts it (alongside the markdown path via auto-detection).
// ============================================================================

const ReviewerJsonFindingSchema = z.object({
  title: z.string().min(1),
  filePath: z.string().min(1),
  lineRange: z.tuple([z.number(), z.number()]),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(100).optional(),
  problem: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  suggestion: z.string().default(''),
});

const ReviewerJsonEnvelopeSchema = z.union([
  z.object({ findings: z.array(z.unknown()) }),
  z.array(z.unknown()),
]);

/**
 * Extract JSON substring from a response when the entire response is either
 * raw JSON (starts with `{`/`[`) or a single ```json fenced block.
 * Deliberately strict: we do NOT pick up embedded code fences that might
 * just be quoted evidence inside a markdown-formatted review.
 */
function extractJsonPayload(response: string): string | null {
  const trimmed = response.trim();
  // Whole response wrapped in a single ```json ... ``` (or unlabeled ```) block
  const fullFence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fullFence && fullFence[1]) return fullFence[1].trim();
  // Raw JSON start — response is unwrapped JSON object/array
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  return null;
}

/**
 * Parse a JSON reviewer response into EvidenceDocument[].
 * Accepts either `{ "findings": [...] }` or a bare `[...]` array.
 * Individual findings that fail schema validation are dropped silently —
 * graceful degradation matters more than strict all-or-nothing semantics.
 *
 * Returns null when the response is not recognizable as JSON at all
 * (caller can then fall back to markdown parsing).
 */
export function parseJsonEvidenceResponse(
  response: string,
): EvidenceDocument[] | null {
  const payload = extractJsonPayload(response);
  if (payload === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  const envelope = ReviewerJsonEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) return null;

  const rawFindings = Array.isArray(envelope.data)
    ? envelope.data
    : envelope.data.findings;

  const documents: EvidenceDocument[] = [];
  for (const raw of rawFindings) {
    const finding = ReviewerJsonFindingSchema.safeParse(raw);
    if (!finding.success) continue;
    const f = finding.data;
    documents.push({
      issueTitle: f.title,
      problem: f.problem,
      evidence: f.evidence,
      severity: f.severity,
      suggestion: f.suggestion,
      filePath: f.filePath,
      lineRange: f.lineRange,
      ...(f.confidence !== undefined && { confidence: f.confidence }),
      ...(f.confidence !== undefined && {
        confidenceTrace: { raw: f.confidence },
      }),
    });
  }
  return documents;
}

/**
 * Parse reviewer response into evidence documents.
 *
 * Auto-detects JSON (via leading `{`/`[` or code fence) and routes to the
 * JSON parser first; falls back to markdown parsing if JSON is malformed
 * or absent. This way callers don't need to know which output format the
 * reviewer used.
 */
export function parseEvidenceResponse(
  response: string,
  diffFilePaths?: string[]
): EvidenceDocument[] {
  // Phase 1: try JSON (#463). Returns null only if response isn't JSON-shaped
  // at all; an empty findings array is a valid "no issues" signal and short-
  // circuits straight to [].
  const jsonDocs = parseJsonEvidenceResponse(response);
  if (jsonDocs !== null) return jsonDocs;

  // Phase 2: markdown protocol (default).
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

      const { severity: parsedSeverity, confidence: reviewerConfidence } = parseSeverity(severityText.trim());
      const severity = parsedSeverity;
      const fileInfo = extractFileInfo(problem, diffFilePaths);

      documents.push({
        issueTitle: title.trim(),
        problem: problem.trim(),
        evidence,
        severity,
        suggestion: suggestion.trim(),
        filePath: fileInfo.filePath,
        lineRange: fileInfo.lineRange,
        ...(reviewerConfidence !== undefined && { confidence: reviewerConfidence }),
        // ConfidenceTrace: record raw reviewer-emitted confidence (stage 1 of 5).
        // See packages/shared/src/types/confidence-trace.ts for stage semantics.
        ...(reviewerConfidence !== undefined && {
          confidenceTrace: { raw: reviewerConfidence },
        }),
      });
    } catch (_error) {
      // Skip malformed evidence blocks
      continue;
    }
  }

  // No evidence blocks parsed: let callers decide via isExplicitNoIssues()
  // whether this was an intentional empty result vs a parse failure.
  return documents;
}

// ============================================================================
// Helpers
// ============================================================================

interface SeverityResult {
  severity: Severity;
  confidence?: number;
}

function parseSeverity(severityText: string): SeverityResult {
  const normalized = severityText.toUpperCase().trim();

  const confidenceMatch = severityText.match(/\((\d+)%\)/);
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : undefined;

  let severity: Severity;
  if (normalized.includes('HARSHLY_CRITICAL') || normalized.includes('HARSHLY CRITICAL')) {
    severity = 'HARSHLY_CRITICAL';
  } else if (normalized.includes('CRITICAL')) {
    severity = 'CRITICAL';
  } else if (normalized.includes('WARNING')) {
    severity = 'WARNING';
  } else {
    severity = 'SUGGESTION';
  }

  return { severity, confidence };
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
