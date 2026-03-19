/**
 * Review Output Formatters
 * Pure functions for formatting PipelineResult into various output formats.
 */

import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import { SEVERITY_ORDER } from '@codeagora/core/types/core.js';
import { severityColor, decisionColor, dim, bold } from '../utils/colors.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { formatAnnotated } from './annotated-output.js';

export type OutputFormat = 'text' | 'json' | 'md' | 'github' | 'annotated';

// ============================================================================
// Text format (default)
// ============================================================================

/**
 * Format a PipelineResult as plain text output.
 */
export function formatText(result: PipelineResult): string {
  const lines: string[] = [];

  if (result.status === 'error') {
    lines.push(t('review.failed', { error: result.error ?? 'unknown error' }));
    lines.push(dim(`  ${t('review.session', { date: result.date, sessionId: result.sessionId })}`));
    return lines.join('\n');
  }

  if (!result.summary) {
    // Fallback: no summary available
    lines.push(t('review.complete'));
    lines.push(`  ${t('review.session', { date: result.date, sessionId: result.sessionId })}`);
    lines.push(`  Output: .ca/sessions/${result.date}/${result.sessionId}/`);
    return lines.join('\n');
  }

  const s = result.summary;

  // Decision header
  const colorFn = decisionColor[s.decision] ?? bold;
  lines.push(`${colorFn(s.decision)}  ${dim(s.reasoning)}`);
  lines.push('');

  // Severity summary line
  const severityParts = SEVERITY_ORDER
    .filter((sev) => (s.severityCounts[sev] ?? 0) > 0)
    .map((sev) => {
      const fn = severityColor[sev] ?? ((x: string) => x);
      return fn(`${sev}: ${s.severityCounts[sev]}`);
    });
  if (severityParts.length > 0) {
    lines.push(severityParts.join('  '));
    lines.push('');
  }

  // Top issues (up to 5) — with confidence badge if available
  if (s.topIssues.length > 0) {
    lines.push(bold('Top Issues:'));
    for (const issue of s.topIssues.slice(0, 5)) {
      const fn = severityColor[issue.severity as keyof typeof severityColor] ?? ((x: string) => x);
      // Look up confidence from evidenceDocs by matching filePath + lineRange
      const matchingDoc = result.evidenceDocs?.find(
        (d) => d.filePath === issue.filePath &&
               d.lineRange[0] === issue.lineRange[0] &&
               d.issueTitle === issue.title
      );
      const confidenceBadge = matchingDoc?.confidence != null
        ? ` (${matchingDoc.confidence}%)`
        : '';
      const sevLabel = `${issue.severity}${confidenceBadge}`;
      const sev = fn(sevLabel.padEnd(16 + confidenceBadge.length));
      const loc = dim(`${issue.filePath}:${issue.lineRange[0]}`);
      lines.push(`  ${sev}  ${loc}  ${issue.title}`);
    }
    lines.push('');
  }

  // Discussion summary
  if (s.totalDiscussions > 0) {
    lines.push(
      dim(
        t('review.discussions', { total: s.totalDiscussions, resolved: s.resolved, escalated: s.escalated })
      )
    );
  }

  // Reviewer completion summary (Task 4)
  if (s.totalReviewers > 0) {
    const completed = s.totalReviewers - s.forfeitedReviewers;
    if (s.forfeitedReviewers > 0) {
      lines.push(
        dim(`Reviewers: ${completed}/${s.totalReviewers} completed (${s.forfeitedReviewers} skipped)`)
      );
    } else {
      lines.push(dim(`Reviewers: ${completed}/${s.totalReviewers} completed`));
    }
  }

  // Session reference
  lines.push(dim(t('review.session', { date: result.date, sessionId: result.sessionId })));

  return lines.join('\n');
}

// ============================================================================
// JSON format
// ============================================================================

/**
 * Format a PipelineResult as JSON.
 */
export function formatJson(result: PipelineResult): string {
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// Markdown format (PR comment style)
// ============================================================================

/**
 * Format a PipelineResult as Markdown suitable for PR comments.
 */
export function formatMarkdown(result: PipelineResult): string {
  const lines: string[] = [];

  lines.push('## CodeAgora Review');
  lines.push('');

  if (result.status === 'error') {
    lines.push(`**Error:** ${result.error ?? 'unknown error'}`);
    return lines.join('\n');
  }

  lines.push(`**Session:** ${result.date}/${result.sessionId}`);
  lines.push('');

  if (result.summary) {
    const s = result.summary;

    // Decision
    lines.push(`**Decision:** ${s.decision}`);
    lines.push('');
    lines.push(`> ${s.reasoning}`);
    lines.push('');

    // Severity table
    const tableRows = SEVERITY_ORDER
      .map((sev) => `| ${sev} | ${s.severityCounts[sev] ?? 0} |`)
      .join('\n');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');
    lines.push(tableRows);
    lines.push('');

    // Top issues
    if (s.topIssues.length > 0) {
      lines.push('**Top Issues:**');
      for (const issue of s.topIssues.slice(0, 5)) {
        lines.push(
          `- **[${issue.severity}]** \`${issue.filePath}:${issue.lineRange[0]}\` — ${issue.title}`
        );
      }
      lines.push('');
    }
  } else {
    lines.push('Review completed successfully.');
    lines.push('');
  }

  lines.push(`See full report: \`.ca/sessions/${result.date}/${result.sessionId}/\``);

  return lines.join('\n');
}

// ============================================================================
// GitHub format (checkbox + emoji style)
// ============================================================================

const SEVERITY_GITHUB: Record<string, { emoji: string; label: string }> = {
  HARSHLY_CRITICAL: { emoji: '🔴', label: 'Critical' },
  CRITICAL: { emoji: '🟠', label: 'Error' },
  WARNING: { emoji: '🟡', label: 'Warning' },
  SUGGESTION: { emoji: '🔵', label: 'Info' },
};

/**
 * Format a PipelineResult as GitHub-flavored Markdown with checkboxes and emojis.
 */
export function formatGithub(result: PipelineResult): string {
  const lines: string[] = [];

  lines.push('## 🔍 CodeAgora Review');
  lines.push('');

  if (result.status === 'error') {
    lines.push(`❌ **Error:** ${result.error ?? 'unknown error'}`);
    return lines.join('\n');
  }

  lines.push(`✅ **Review completed** — Session \`${result.date}/${result.sessionId}\``);
  lines.push('');

  // Severity groups with actual counts from summary
  for (const severity of SEVERITY_ORDER) {
    const count = result.summary?.severityCounts[severity] ?? 0;
    const { emoji, label } = SEVERITY_GITHUB[severity] ?? { emoji: '⚪', label: severity };
    lines.push(`### ${emoji} **${label}** / ${severity} (${count})`);
    lines.push('');
  }

  lines.push(`> Full report: \`.ca/sessions/${result.date}/${result.sessionId}/\``);

  return lines.join('\n');
}

// ============================================================================
// Unified dispatcher
// ============================================================================

/**
 * Format a PipelineResult using the requested output format.
 *
 * For the 'annotated' format, pass diffContent and evidenceDocs via options.
 * v1 limitation: if evidenceDocs is not provided, falls back to summary.topIssues
 * which only contains up to 5 issues.
 */
export function formatOutput(
  result: PipelineResult,
  format: OutputFormat,
  options?: { diffContent?: string; evidenceDocs?: EvidenceDocument[] }
): string {
  switch (format) {
    case 'text':
      return formatText(result);
    case 'json':
      return formatJson(result);
    case 'md':
      return formatMarkdown(result);
    case 'github':
      return formatGithub(result);
    case 'annotated': {
      const diff = options?.diffContent ?? '';
      // Use provided evidenceDocs; fall back to topIssues cast as EvidenceDocument[]
      const docs: EvidenceDocument[] = options?.evidenceDocs ??
        (result.summary?.topIssues as unknown as EvidenceDocument[] ?? []);
      return formatAnnotated(diff, docs);
    }
    default: {
      // Exhaustive check — TypeScript will warn if a case is missing
      const _exhaustive: never = format;
      return formatText(_exhaustive);
    }
  }
}
