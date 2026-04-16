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
import { buildSarifReport, serializeSarif } from '@codeagora/github/sarif.js';
import { triageDocs, formatTriageCounts } from '@codeagora/shared/utils/triage.js';
import { lookupCwe } from '@codeagora/shared/data/cwe-mapping.js';

export type OutputFormat = 'text' | 'json' | 'md' | 'github' | 'annotated' | 'html' | 'junit' | 'sarif';

// ============================================================================
// Text format (default)
// ============================================================================

/** Options for formatting output. */
export interface FormatOptions {
  /** Show full issue details (problem, evidence, suggestion). Default: false. */
  verbose?: boolean;
  /** Raw diff content (for annotated format). */
  diffContent?: string;
  /** Evidence documents override (for annotated format). */
  evidenceDocs?: EvidenceDocument[];
}

/**
 * Format a PipelineResult as plain text output.
 */
export function formatText(result: PipelineResult, options?: FormatOptions): string {
  const lines: string[] = [];

  if (result.status === 'error') {
    lines.push(t('review.failed', { error: result.error ?? 'unknown error' }));
    lines.push(dim(`  ${t('review.session', { date: result.date, sessionId: result.sessionId })}`));
    return lines.join('\n');
  }

  if (!result.summary) {
    lines.push(t('review.complete'));
    lines.push(`  ${t('review.session', { date: result.date, sessionId: result.sessionId })}`);
    return lines.join('\n');
  }

  const s = result.summary;
  const docs = result.evidenceDocs ?? [];
  const triage = triageDocs(docs);

  // ── Verdict Box ──────────────────────────────────────────
  const decEmoji = s.decision === 'ACCEPT' ? '\u2705' : s.decision === 'REJECT' ? '\uD83D\uDD34' : '\uD83D\uDFE1';
  const colorFn = decisionColor[s.decision] ?? bold;
  const triageStr = formatTriageCounts(triage.counts);
  const reviewerStr = s.totalReviewers > 0
    ? `${s.totalReviewers - s.forfeitedReviewers} reviewers`
    : '';
  const debateStr = s.totalDiscussions > 0 ? `${s.totalDiscussions} debates` : '';
  const metaParts = [reviewerStr, debateStr].filter(Boolean).join(' \u00B7 ');

  lines.push('');
  lines.push(`  \u250C${ '\u2500'.repeat(47) }\u2510`);
  lines.push(`  \u2502  ${colorFn(`${decEmoji} ${s.decision}`)}  \u00B7  ${triageStr}${ ' '.repeat(Math.max(0, 30 - triageStr.length)) }\u2502`);
  if (metaParts) {
    lines.push(`  \u2502  ${dim(metaParts)}${ ' '.repeat(Math.max(0, 45 - metaParts.length)) }\u2502`);
  }
  lines.push(`  \u2514${ '\u2500'.repeat(47) }\u2518`);
  lines.push('');

  // ── Issue rendering helper ──
  const renderIssue = (doc: EvidenceDocument, verbose: boolean) => {
    const fn = severityColor[doc.severity as keyof typeof severityColor] ?? ((x: string) => x);
    const confStr = doc.confidence != null ? ` ${doc.confidence}%` : '';
    const lineLabel = doc.lineRange[0] === doc.lineRange[1]
      ? `${doc.lineRange[0]}`
      : `${doc.lineRange[0]}-${doc.lineRange[1]}`;
    const loc = `${doc.filePath}:${lineLabel}`;

    lines.push(`    ${fn(`${doc.severity}${confStr}`)}   ${dim(loc)}`);
    const cwe = lookupCwe(doc.issueTitle);
    const cweStr = cwe ? dim(` [CWE-${cwe.id}]`) : '';
    lines.push(`    ${bold(doc.issueTitle)}${cweStr}`);

    if (verbose) {
      lines.push(`    \u2506 ${doc.problem}`);
      if (doc.evidence.length > 0) {
        for (const ev of doc.evidence) {
          lines.push(`    \u2506 ${dim(ev)}`);
        }
      }
      lines.push(`    \u2506 Fix: ${doc.suggestion}`);
    } else {
      // Show one-line problem summary
      const shortProblem = doc.problem.length > 80 ? doc.problem.slice(0, 77) + '...' : doc.problem;
      lines.push(`    \u2506 ${dim(shortProblem)}`);
    }
    lines.push('');
  };

  // ── Must Fix ──
  if (triage.mustFix.length > 0) {
    lines.push(`  \u2500\u2500 must-fix ${ '\u2500'.repeat(40) }`);
    lines.push('');
    for (const doc of triage.mustFix) {
      renderIssue(doc, !!options?.verbose);
    }
  }

  // ── Verify ──
  if (triage.verify.length > 0) {
    lines.push(`  \u2500\u2500 verify ${ '\u2500'.repeat(42) }`);
    lines.push('');
    for (const doc of triage.verify) {
      renderIssue(doc, !!options?.verbose);
    }
  }

  // ── Suggestions (collapsed by default) ──
  if (triage.ignore.length > 0) {
    if (options?.verbose) {
      lines.push(`  \u2500\u2500 suggestions ${ '\u2500'.repeat(37) }`);
      lines.push('');
      for (const doc of triage.ignore) {
        renderIssue(doc, true);
      }
    } else {
      lines.push(dim(`  \u2500\u2500 ${triage.ignore.length} suggestion(s) (--verbose to expand) \u2500\u2500`));
      lines.push('');
    }
  }

  // ── Zero issues celebration ──
  if (docs.length === 0 && s.decision === 'ACCEPT') {
    lines.push(`  ${bold('No issues found across all reviewers. Ship it!')} \uD83D\uDE80`);
    lines.push('');
  }

  // ── Reasoning ──
  lines.push(dim(`  ${s.reasoning}`));
  lines.push('');

  // ── Session footer ──
  lines.push(dim(`  Session ${result.date}/${result.sessionId}`));

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
export function formatMarkdown(result: PipelineResult, options?: FormatOptions): string {
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

    // Verbose mode: show all evidence documents with full detail
    if (options?.verbose && result.evidenceDocs && result.evidenceDocs.length > 0) {
      lines.push('### Detailed Issues');
      lines.push('');
      for (const doc of result.evidenceDocs) {
        const confidenceBadge = doc.confidence != null ? ` (${doc.confidence}%)` : '';
        const lineLabel = doc.lineRange[0] === doc.lineRange[1]
          ? `${doc.lineRange[0]}`
          : `${doc.lineRange[0]}-${doc.lineRange[1]}`;
        lines.push(`#### **[${doc.severity}]**${confidenceBadge} ${doc.issueTitle} — \`${doc.filePath}:${lineLabel}\``);
        lines.push('');
        lines.push(`**Problem:** ${doc.problem}`);
        lines.push('');
        if (doc.evidence.length > 0) {
          lines.push('**Evidence:**');
          for (const ev of doc.evidence) {
            lines.push(`- ${ev}`);
          }
          lines.push('');
        }
        lines.push(`**Suggestion:** ${doc.suggestion}`);
        lines.push('');
      }
    } else if (s.topIssues.length > 0) {
      // Default: top issues summary
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
// HTML format (self-contained)
// ============================================================================

const SEVERITY_HTML_COLORS: Record<string, string> = {
  HARSHLY_CRITICAL: '#dc2626',
  CRITICAL: '#ea580c',
  WARNING: '#ca8a04',
  SUGGESTION: '#2563eb',
};

const DECISION_HTML_COLORS: Record<string, string> = {
  ACCEPT: '#16a34a',
  REJECT: '#dc2626',
  NEEDS_HUMAN: '#ca8a04',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatHtml(result: PipelineResult): string {
  const lines: string[] = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="en">');
  lines.push('<head>');
  lines.push('<meta charset="UTF-8">');
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push('<title>CodeAgora Review</title>');
  lines.push('<style>');
  lines.push('body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; background: #f9fafb; color: #111827; }');
  lines.push('h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }');
  lines.push('.badge { display: inline-block; padding: 4px 12px; border-radius: 4px; color: #fff; font-weight: 600; }');
  lines.push('.severity-HARSHLY_CRITICAL { background: #dc2626; }');
  lines.push('.severity-CRITICAL { background: #ea580c; }');
  lines.push('.severity-WARNING { background: #ca8a04; }');
  lines.push('.severity-SUGGESTION { background: #2563eb; }');
  lines.push('.summary { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }');
  lines.push('.severity-dist { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0; }');
  lines.push('.severity-dist span { padding: 2px 8px; border-radius: 4px; font-size: 0.9em; }');
  lines.push('table { width: 100%; border-collapse: collapse; margin: 16px 0; background: #fff; }');
  lines.push('th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }');
  lines.push('th { background: #f3f4f6; font-weight: 600; }');
  lines.push('.error { color: #dc2626; }');
  lines.push('.meta { color: #6b7280; font-size: 0.85em; margin-top: 16px; }');
  lines.push('</style>');
  lines.push('</head>');
  lines.push('<body>');
  lines.push('<h1>CodeAgora Review</h1>');

  if (result.status === 'error') {
    const safeError = escapeHtml(result.error ?? 'unknown error');
    lines.push(`<div class="summary"><p class="error"><strong>Error:</strong> ${safeError}</p></div>`);
    lines.push(`<p class="meta">Session: ${escapeHtml(result.date)}/${escapeHtml(result.sessionId)}</p>`);
    lines.push('</body>');
    lines.push('</html>');
    return lines.join('\n');
  }

  if (!result.summary) {
    lines.push('<div class="summary"><p>Review completed successfully.</p></div>');
    lines.push(`<p class="meta">Session: ${escapeHtml(result.date)}/${escapeHtml(result.sessionId)}</p>`);
    lines.push('</body>');
    lines.push('</html>');
    return lines.join('\n');
  }

  const s = result.summary;
  const decColor = DECISION_HTML_COLORS[s.decision] ?? '#6b7280';
  lines.push('<div class="summary">');
  lines.push(`<p><span class="badge" style="background:${decColor}">${escapeHtml(s.decision)}</span></p>`);
  lines.push(`<p>${escapeHtml(s.reasoning)}</p>`);

  const sevParts = SEVERITY_ORDER
    .filter((sev) => (s.severityCounts[sev] ?? 0) > 0)
    .map((sev) => {
      const color = SEVERITY_HTML_COLORS[sev] ?? '#6b7280';
      return `<span style="color:${color};border:1px solid ${color}">${escapeHtml(sev)}: ${s.severityCounts[sev]}</span>`;
    });
  if (sevParts.length > 0) {
    lines.push(`<div class="severity-dist">${sevParts.join('')}</div>`);
  }

  if (s.totalReviewers > 0) {
    const completed = s.totalReviewers - s.forfeitedReviewers;
    lines.push(`<p>Reviewers: ${completed}/${s.totalReviewers} completed</p>`);
  }
  lines.push('</div>');

  const docs = result.evidenceDocs ?? [];
  if (docs.length > 0) {
    lines.push('<h2>Issues</h2>');
    lines.push('<table>');
    lines.push('<thead><tr><th>Severity</th><th>Location</th><th>Title</th><th>Problem</th><th>Suggestion</th></tr></thead>');
    lines.push('<tbody>');
    for (const doc of docs) {
      const sevClass = `severity-${doc.severity}`;
      lines.push('<tr>');
      lines.push(`<td><span class="badge ${sevClass}">${escapeHtml(doc.severity)}</span></td>`);
      lines.push(`<td>${escapeHtml(doc.filePath)}:${doc.lineRange[0]}</td>`);
      lines.push(`<td>${escapeHtml(doc.issueTitle)}</td>`);
      lines.push(`<td>${escapeHtml(doc.problem)}</td>`);
      lines.push(`<td>${escapeHtml(doc.suggestion)}</td>`);
      lines.push('</tr>');
    }
    lines.push('</tbody>');
    lines.push('</table>');
  } else if (s.topIssues.length > 0) {
    lines.push('<h2>Top Issues</h2>');
    lines.push('<table>');
    lines.push('<thead><tr><th>Severity</th><th>Location</th><th>Title</th></tr></thead>');
    lines.push('<tbody>');
    for (const issue of s.topIssues.slice(0, 5)) {
      const sevClass = `severity-${issue.severity}`;
      lines.push('<tr>');
      lines.push(`<td><span class="badge ${sevClass}">${escapeHtml(issue.severity)}</span></td>`);
      lines.push(`<td>${escapeHtml(issue.filePath)}:${issue.lineRange[0]}</td>`);
      lines.push(`<td>${escapeHtml(issue.title)}</td>`);
      lines.push('</tr>');
    }
    lines.push('</tbody>');
    lines.push('</table>');
  }

  lines.push(`<p class="meta">Session: ${escapeHtml(result.date)}/${escapeHtml(result.sessionId)}</p>`);
  lines.push('</body>');
  lines.push('</html>');
  return lines.join('\n');
}

// ============================================================================
// JUnit XML format
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatJunit(result: PipelineResult): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  if (result.status === 'error') {
    lines.push('<testsuites>');
    lines.push(`<testsuite name="codeagora" tests="1" failures="1" errors="0">`);
    lines.push(`<testcase name="pipeline" classname="codeagora">`);
    lines.push(`<failure message="${escapeXml(result.error ?? 'unknown error')}" type="Error">${escapeXml(result.error ?? 'unknown error')}</failure>`);
    lines.push('</testcase>');
    lines.push('</testsuite>');
    lines.push('</testsuites>');
    return lines.join('\n');
  }

  const docs = result.evidenceDocs ?? [];
  const failureCount = docs.length;

  lines.push('<testsuites>');
  lines.push(`<testsuite name="codeagora" tests="${docs.length || 0}" failures="${failureCount}" errors="0">`);

  for (const doc of docs) {
    const evidenceText = doc.evidence.length > 0
      ? `Evidence:\n${doc.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n`
      : '';
    const suggestionText = doc.suggestion ? `Suggestion: ${doc.suggestion}` : '';
    const bodyText = `${evidenceText}${suggestionText}`.trim();

    lines.push(`<testcase name="${escapeXml(doc.issueTitle)}" classname="${escapeXml(doc.filePath)}">`);
    lines.push(`<failure message="${escapeXml(doc.problem)}" type="${escapeXml(doc.severity)}">${escapeXml(bodyText)}</failure>`);
    lines.push('</testcase>');
  }

  lines.push('</testsuite>');
  lines.push('</testsuites>');
  return lines.join('\n');
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Map a topIssues entry to an EvidenceDocument for the annotated formatter.
 * topIssues uses `title`; EvidenceDocument uses `issueTitle`.
 */
function toEvidenceDoc(issue: {
  severity: string;
  filePath: string;
  lineRange: [number, number];
  title: string;
}): EvidenceDocument {
  return {
    issueTitle: issue.title,
    problem: '',
    evidence: [],
    severity: issue.severity as EvidenceDocument['severity'],
    suggestion: '',
    filePath: issue.filePath,
    lineRange: issue.lineRange,
  };
}

// ============================================================================
// Unified dispatcher
// ============================================================================

function formatSarif(result: PipelineResult): string {
  const docs: EvidenceDocument[] = result.summary?.topIssues.map(toEvidenceDoc) ?? [];
  const report = buildSarifReport(docs, result.sessionId ?? 'unknown', result.date ?? 'unknown');
  return serializeSarif(report);
}

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
  options?: FormatOptions
): string {
  switch (format) {
    case 'text':
      return formatText(result, options);
    case 'json':
      return formatJson(result);
    case 'md':
      return formatMarkdown(result, options);
    case 'github':
      return formatGithub(result);
    case 'annotated': {
      const diff = options?.diffContent ?? '';
      // Use provided evidenceDocs; fall back to topIssues mapped explicitly to EvidenceDocument[]
      const docs: EvidenceDocument[] = options?.evidenceDocs ??
        (result.summary?.topIssues.map(toEvidenceDoc) ?? []);
      return formatAnnotated(diff, docs);
    }
    case 'html':
      return formatHtml(result);
    case 'junit':
      return formatJunit(result);
    case 'sarif':
      return formatSarif(result);
    default: {
      // Exhaustive check — TypeScript will warn if a case is missing
      const _exhaustive: never = format;
      return formatText(_exhaustive);
    }
  }
}
