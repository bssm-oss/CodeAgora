/**
 * Formatter for ConfidenceTrace — renders a finding's per-stage confidence
 * breakdown for debug output (CLI `agora trace` + TUI detail pane).
 *
 * Shared across CLI and TUI so the penalty labels stay consistent across
 * surfaces. Pure function: takes an EvidenceDocument, returns formatted lines.
 */

import type { ConfidenceTrace } from '../types/confidence-trace.js';

/**
 * Minimum shape this formatter needs. Kept structurally compatible with
 * core's EvidenceDocument so callers can pass the full doc without mapping.
 */
export interface TraceableDoc {
  issueTitle: string;
  severity: string;
  filePath: string;
  lineRange: [number, number];
  confidence?: number;
  confidenceTrace?: ConfidenceTrace;
}

interface StageRow {
  label: string;
  value: number | null;
  note: string;
}

const STAGE_ORDER = ['raw', 'filtered', 'corroborated', 'verified', 'final'] as const;

/**
 * Match a ratio to a known multiplier (within rounding tolerance).
 * Returns the label for the first matching multiplier, or null if unclear.
 */
function inferMultiplier(current: number, prev: number): { ratio: number; label: string } | null {
  if (prev === 0) return null;
  const ratio = current / prev;
  const KNOWN: Array<[number, string]> = [
    [1.0, 'pass-through'],
    [0.8, '×0.8 (sparse regime, 1 active reviewer)'],
    [0.7, '×0.7 (speculation penalty)'],
    [0.5, '×0.5 (strong penalty: dissent / code-quote / contradiction)'],
    [0.375, '×0.375 (dissent × lonely high-severity)'],
    [0.35, '×0.35 (speculation × strong penalty stacked)'],
    [0.525, '×0.525 (large-diff dissent × lonely high-severity)'],
    [1.2, '×1.2 (strong corroboration boost)'],
  ];
  for (const [m, label] of KNOWN) {
    if (Math.abs(ratio - m) < 0.03) {
      return { ratio: m, label };
    }
  }
  return null;
}

function renderStage(label: string, value: number | null, note: string): StageRow {
  return { label, value, note };
}

/**
 * Build the per-stage breakdown for a single doc's confidenceTrace.
 * Returns StageRow[] so callers can render with their own styling.
 */
export function buildTraceRows(doc: TraceableDoc): StageRow[] {
  const trace = doc.confidenceTrace ?? {};
  const rows: StageRow[] = [];

  // Track the "last known value" to compute stage-to-stage deltas
  let prev: number | null = null;

  for (const stage of STAGE_ORDER) {
    const value = trace[stage];
    if (value === undefined) {
      const note = stage === 'verified'
        ? 'skipped (below CRITICAL threshold or passed)'
        : stage === 'final'
          ? 'not populated (pre-#319 session)'
          : 'not recorded';
      rows.push(renderStage(stage, null, note));
      continue;
    }

    let note = '';
    if (stage === 'raw') {
      note = 'reviewer self-reported';
    } else if (prev === null) {
      note = 'recorded (prior stage absent)';
    } else {
      const inferred = inferMultiplier(value, prev);
      if (inferred) {
        note = inferred.label;
      } else {
        const delta = value - prev;
        const sign = delta >= 0 ? '+' : '';
        note = `${sign}${delta} (L2 adjustment or custom penalty — see stage-executors / confidence)`;
      }
    }

    rows.push(renderStage(stage, value, note));
    prev = value;
  }

  return rows;
}

/**
 * Classify a finding into its triage tab based on the final confidence.
 * Mirrors the logic used by UI surfaces. Exported so trace output can show
 * where this finding lands.
 */
export function classifyTriageTab(doc: TraceableDoc): 'must-fix' | 'verify' | 'ignore' {
  const conf = doc.confidenceTrace?.final ?? doc.confidence ?? 50;
  if (conf < 20) return 'ignore';
  const isCritical = doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL';
  const isWarning = doc.severity === 'WARNING';
  if (isCritical && conf > 50) return 'must-fix';
  if ((isCritical && conf <= 50) || (isWarning && conf > 50)) return 'verify';
  return 'ignore';
}

/**
 * Render a single finding's trace as a list of formatted lines (no ANSI).
 * Callers add their own indent / color as needed.
 */
export function formatFindingTrace(doc: TraceableDoc, index: number): string[] {
  const lines: string[] = [];
  const lineRange = doc.lineRange[0] === doc.lineRange[1]
    ? `${doc.lineRange[0]}`
    : `${doc.lineRange[0]}-${doc.lineRange[1]}`;
  lines.push(`[${index}] ${doc.filePath}:${lineRange} — ${doc.issueTitle} (${doc.severity})`);

  const rows = buildTraceRows(doc);
  const labelWidth = Math.max(...rows.map(r => r.label.length));
  for (const row of rows) {
    const label = row.label.padEnd(labelWidth);
    const value = row.value === null ? '—'.padStart(4) : `${row.value}%`.padStart(4);
    lines.push(`    ${label}  ${value}   ${row.note}`);
  }

  const tab = classifyTriageTab(doc);
  lines.push(`    → ${tab} tab`);
  return lines;
}

/**
 * Render a whole session's findings (summary mode).
 */
export function formatSessionTrace(docs: TraceableDoc[]): string[] {
  const lines: string[] = [];
  if (docs.length === 0) {
    lines.push('No findings in this session.');
    return lines;
  }
  docs.forEach((doc, i) => {
    lines.push(...formatFindingTrace(doc, i + 1));
    lines.push('');
  });
  return lines;
}
