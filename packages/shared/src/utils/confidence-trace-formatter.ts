/**
 * Formatter for ConfidenceTrace — renders a finding's per-stage confidence
 * breakdown for debug output (CLI `agora trace` and downstream adapters).
 *
 * Shared so the penalty labels stay consistent across surfaces. Pure function:
 * takes an EvidenceDocument, returns formatted lines.
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

const STAGE_ORDER = ['raw', 'calibrated', 'filtered', 'corroborated', 'verified', 'final'] as const;

/**
 * Match a ratio to a known multiplier (within rounding tolerance).
 * Returns the label for the first matching multiplier, or null if unclear.
 */
function inferMultiplier(current: number, prev: number): { ratio: number; label: string } | null {
  // Guard against non-finite inputs (malformed trace → NaN/Infinity) —
  // an NaN ratio matches nothing below so we'd be safe, but we'd still
  // do wasted comparisons. Bail early. See #485 self-review (SUGGESTION).
  if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) return null;
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
          : stage === 'calibrated'
            ? 'disabled (reviewContext.calibrateReviewerConfidence=false)'
            : 'not recorded';
      rows.push(renderStage(stage, null, note));
      continue;
    }

    let note = '';
    if (stage === 'raw') {
      note = 'reviewer self-reported';
    } else if (prev === null) {
      note = 'recorded (prior stage absent)';
    } else if (stage === 'calibrated') {
      // Calibration uses model-specific multipliers (#467) — don't reuse
      // the hallucination-filter penalty labels from inferMultiplier which
      // would misattribute the ratio to "dissent" / "speculation" etc.
      if (prev > 0 && Number.isFinite(prev) && Number.isFinite(value)) {
        const ratio = value / prev;
        note = `×${ratio.toFixed(2)} (model calibration — L0 tier-based)`;
      } else {
        note = 'calibrated from raw';
      }
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
  // Defensive: TraceableDoc declares these fields as required but the CLI
  // reads untyped session JSON, which may be malformed or from an older
  // pipeline version. Fall back to placeholders instead of throwing on
  // missing / invalid fields. See #485 self-review.
  const filePath = typeof doc.filePath === 'string' && doc.filePath.length > 0
    ? doc.filePath : '<unknown file>';
  const issueTitle = typeof doc.issueTitle === 'string' && doc.issueTitle.length > 0
    ? doc.issueTitle : '<untitled>';
  const severity = typeof doc.severity === 'string' && doc.severity.length > 0
    ? doc.severity : '<unknown severity>';
  const hasValidRange = Array.isArray(doc.lineRange)
    && doc.lineRange.length === 2
    && Number.isFinite(doc.lineRange[0])
    && Number.isFinite(doc.lineRange[1]);
  const lineRange = !hasValidRange
    ? '?'
    : doc.lineRange[0] === doc.lineRange[1]
      ? `${doc.lineRange[0]}`
      : `${doc.lineRange[0]}-${doc.lineRange[1]}`;
  lines.push(`[${index}] ${filePath}:${lineRange} — ${issueTitle} (${severity})`);

  const rows = buildTraceRows(doc);
  const labelWidth = Math.max(...rows.map(r => r.label.length));
  for (const row of rows) {
    const label = row.label.padEnd(labelWidth);
    const value = row.value === null ? '—'.padStart(4) : `${row.value}%`.padStart(4);
    lines.push(`    ${label}  ${value}   ${row.note}`);
  }

  // Evidence quality (#468) — 0–1 score recorded alongside the filtered
  // stage. Rendered separately because it's a quality measure, not a
  // confidence stage. The derived multiplier (0.7 + 0.3 × score) is
  // already folded into `filtered`.
  const evidence = doc.confidenceTrace?.evidence;
  if (typeof evidence === 'number') {
    const pct = `${Math.round(evidence * 100)}%`.padStart(4);
    const mult = (0.7 + 0.3 * evidence).toFixed(2);
    const label = 'evidence'.padEnd(labelWidth);
    lines.push(`    ${label}  ${pct}   quality (×${mult} applied to filtered)`);
  }

  // Finding-class prior (#468 follow-up) — which empirically FP-heavy
  // class matched this finding, if any. The multiplier is already
  // folded into `filtered`; this line is purely for explainability.
  const classPrior = doc.confidenceTrace?.classPrior;
  if (typeof classPrior === 'string') {
    const label = 'class'.padEnd(labelWidth);
    lines.push(`    ${label}   —    prior: ${classPrior} (multiplier applied to filtered)`);
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
