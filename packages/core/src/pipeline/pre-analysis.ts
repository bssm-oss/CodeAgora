/**
 * Pre-Analysis Orchestrator
 * Runs all analyzer modules in parallel before L1 reviewers to enrich
 * the diff context with semantic classification, diagnostics, impact
 * analysis, external rules, and path-based notes.
 *
 * All analyzers run with graceful degradation — failures return empty defaults.
 */

import type { Config } from '../types/config.js';
import { classifyDiffFiles, type FileClassification } from './analyzers/diff-classifier.js';
import { runTscDiagnostics, type TscDiagnostic } from './analyzers/tsc-runner.js';
import { analyzeChangeImpact, type ImpactEntry } from './analyzers/impact-analyzer.js';
import { loadExternalRules } from './analyzers/external-rules.js';
import { matchPathRules, type PathRule } from './analyzers/path-rules.js';

// Re-export types for consumers
export type { FileClassification } from './analyzers/diff-classifier.js';
export type { TscDiagnostic } from './analyzers/tsc-runner.js';
export type { ImpactEntry } from './analyzers/impact-analyzer.js';
export type { PathRule } from './analyzers/path-rules.js';

// ============================================================================
// Enriched Context
// ============================================================================

export interface EnrichedDiffContext {
  fileClassifications: Map<string, FileClassification>;
  tscDiagnostics: TscDiagnostic[];
  impactAnalysis: Map<string, ImpactEntry>;
  externalRules: string[];
  pathRuleNotes: string[];
}

type RiskBucket = 'AUTH_ACCESS_CONTROL' | 'SECURITY_BOUNDARY' | 'DATA_INTEGRITY';

interface RiskFocusBucket {
  bucket: RiskBucket;
  priority: 'HIGH' | 'MEDIUM';
  signals: string[];
}

// ============================================================================
// Timeout Wrapper
// ============================================================================

/**
 * Wrap a promise with a timeout. Returns the fallback value on timeout.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run all pre-analysis modules in parallel and return enriched context.
 *
 * Each analyzer has a 15-second timeout and returns an empty default on failure.
 * The combined result provides reviewers with additional context for more
 * accurate and targeted reviews.
 *
 * @param repoPath - Git repo root path
 * @param diffContent - Full unified diff string
 * @param config - Pipeline config (for pathRules)
 * @param changedFiles - List of changed file paths extracted from diff
 * @returns Enriched diff context
 */
export async function analyzeBeforeReview(
  repoPath: string,
  diffContent: string,
  config: Config,
  changedFiles: string[],
): Promise<EnrichedDiffContext> {
  const TIMEOUT_MS = 15_000;

  // Extract path rules from config
  const pathRules: PathRule[] = config.reviewContext?.pathRules ?? [];

  // Run all analyzers in parallel with individual timeouts
  const [
    classificationsResult,
    tscResult,
    impactResult,
    rulesResult,
    pathNotesResult,
  ] = await Promise.allSettled([
    // 1. Diff classification (sync, but wrap for uniformity)
    withTimeout(
      Promise.resolve(classifyDiffFiles(diffContent)),
      TIMEOUT_MS,
      new Map<string, FileClassification>(),
    ),
    // 2. TypeScript diagnostics
    withTimeout(
      runTscDiagnostics(repoPath, changedFiles),
      TIMEOUT_MS,
      [] as TscDiagnostic[],
    ),
    // 3. Impact analysis
    withTimeout(
      analyzeChangeImpact(repoPath, diffContent),
      TIMEOUT_MS,
      new Map<string, ImpactEntry>(),
    ),
    // 4. External rules
    withTimeout(
      loadExternalRules(repoPath),
      TIMEOUT_MS,
      [] as string[],
    ),
    // 5. Path rules (sync, but wrap for uniformity)
    withTimeout(
      Promise.resolve(matchPathRules(changedFiles, pathRules)),
      TIMEOUT_MS,
      [] as string[],
    ),
  ]);

  return {
    fileClassifications:
      classificationsResult.status === 'fulfilled'
        ? classificationsResult.value
        : new Map<string, FileClassification>(),
    tscDiagnostics:
      tscResult.status === 'fulfilled' ? tscResult.value : [],
    impactAnalysis:
      impactResult.status === 'fulfilled'
        ? impactResult.value
        : new Map<string, ImpactEntry>(),
    externalRules:
      rulesResult.status === 'fulfilled' ? rulesResult.value : [],
    pathRuleNotes:
      pathNotesResult.status === 'fulfilled' ? pathNotesResult.value : [],
  };
}

// ============================================================================
// Prompt Formatting
// ============================================================================

/**
 * Format enriched context into a prompt section for reviewers.
 * Returns empty string if no enrichment data is available.
 */
export function buildEnrichedSection(ctx: EnrichedDiffContext): string {
  const sections: string[] = [];

  const riskFocusSection = buildRiskFocusSection(ctx);
  if (riskFocusSection) {
    sections.push(riskFocusSection);
  }

  // 1. File classifications
  if (ctx.fileClassifications.size > 0) {
    const lines = [...ctx.fileClassifications.entries()]
      .map(([file, cls]) => `- [${cls.toUpperCase()}] ${file}`)
      .join('\n');
    sections.push(`## File Classifications\n${lines}`);
  }

  // 2. TypeScript diagnostics
  if (ctx.tscDiagnostics.length > 0) {
    const lines = ctx.tscDiagnostics
      .slice(0, 20) // Cap at 20 to avoid token bloat
      .map((d) => `- ${d.file}:${d.line} — error TS${d.code}: ${d.message}`)
      .join('\n');
    sections.push(`## TypeScript Diagnostics\n${lines}`);
  }

  // 3. Impact analysis
  if (ctx.impactAnalysis.size > 0) {
    const lines = [...ctx.impactAnalysis.entries()]
      .map(([, entry]) => {
        const level =
          entry.callerCount >= 10
            ? 'HIGH'
            : entry.callerCount >= 5
              ? 'MEDIUM'
              : 'LOW';
        return `- ${entry.symbol}() — ${entry.callerCount} importers (${level})`;
      })
      .join('\n');
    sections.push(`## Change Impact\n${lines}`);
  }

  // 4. External rules
  if (ctx.externalRules.length > 0) {
    sections.push(`## Project Rules\n${ctx.externalRules.join('\n\n')}`);
  }

  // 5. Path rule notes
  if (ctx.pathRuleNotes.length > 0) {
    const lines = ctx.pathRuleNotes.map((n) => `- ${n}`).join('\n');
    sections.push(`## Path-Specific Review Notes\n${lines}`);
  }

  if (sections.length === 0) return '';

  return `\n## Pre-Analysis Context\n\n${sections.join('\n\n')}\n`;
}

const AUTH_RE = /\b(auth|login|logout|session|token|jwt|oauth|permission|role|rbac|acl|tenant|admin)\b/i;
const SECURITY_RE = /\b(security|sanitize|validation|sql|query|secret|credential|password|crypto|encrypt|decrypt|csrf|xss|ssrf|exec|command|shell|upload|webhook|http|api|network|file system)\b/i;
const DATA_RE = /\b(data|db|database|migration|schema|transaction|payment|billing|invoice|order|balance|ledger|persist|storage|rollback|idempot|consisten|write|delete|upsert|cache|queue)\b/i;
const GUARDRAIL_RE = /\b(readiness|threshold|guard|gate|policy|contract|invariant|monotonic|limit|boundary)\b/i;

function clipSignal(text: string, maxLength: number = 96): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function pushUniqueSignal(target: string[], signal: string, limit: number = 3): void {
  if (target.includes(signal) || target.length >= limit) return;
  target.push(signal);
}

function createRiskBucket(
  bucket: RiskBucket,
): { bucket: RiskBucket; score: number; signals: string[] } {
  return { bucket, score: 0, signals: [] };
}

function addRiskSignal(
  bucket: { score: number; signals: string[] },
  signal: string,
  score: number,
): void {
  bucket.score += score;
  pushUniqueSignal(bucket.signals, signal);
}

function buildRiskFocusBuckets(ctx: EnrichedDiffContext): RiskFocusBucket[] {
  const auth = createRiskBucket('AUTH_ACCESS_CONTROL');
  const security = createRiskBucket('SECURITY_BOUNDARY');
  const dataIntegrity = createRiskBucket('DATA_INTEGRITY');

  for (const [filePath, classification] of ctx.fileClassifications.entries()) {
    const fileSignal = `touched \`${filePath}\` (${classification})`;
    if (AUTH_RE.test(filePath)) addRiskSignal(auth, fileSignal, 2);
    if (SECURITY_RE.test(filePath)) addRiskSignal(security, fileSignal, 2);
    if (DATA_RE.test(filePath)) addRiskSignal(dataIntegrity, fileSignal, 2);
    if (GUARDRAIL_RE.test(filePath)) {
      addRiskSignal(
        dataIntegrity,
        `semantic guardrail file \`${filePath}\` — re-check thresholds, gates, and default behavior`,
        classification === 'config' ? 3 : 2,
      );
    }
  }

  for (const diag of ctx.tscDiagnostics.slice(0, 10)) {
    const diagText = `${diag.file}:${diag.line} TS${diag.code} ${diag.message}`;
    const signal = `diagnostic: ${clipSignal(diagText)}`;
    if (AUTH_RE.test(diagText)) addRiskSignal(auth, signal, 1);
    if (SECURITY_RE.test(diagText)) addRiskSignal(security, signal, 1);
    if (DATA_RE.test(diagText)) addRiskSignal(dataIntegrity, signal, 1);
    if (GUARDRAIL_RE.test(diagText)) {
      addRiskSignal(dataIntegrity, signal, 1);
    }
  }

  for (const [, entry] of ctx.impactAnalysis.entries()) {
    const blastRadiusSignal = `high-blast export \`${entry.symbol}()\` with ${entry.callerCount} importers`;
    const importersText = entry.importers.slice(0, 3).join(' ');
    const impactText = `${entry.symbol} ${importersText}`;

    if (AUTH_RE.test(impactText)) addRiskSignal(auth, blastRadiusSignal, entry.callerCount >= 10 ? 3 : 2);
    if (SECURITY_RE.test(impactText)) addRiskSignal(security, blastRadiusSignal, entry.callerCount >= 10 ? 3 : 2);
    if (DATA_RE.test(impactText) || entry.callerCount >= 8) {
      addRiskSignal(dataIntegrity, blastRadiusSignal, entry.callerCount >= 10 ? 3 : 2);
    }
  }

  const noteSources = [
    ...ctx.externalRules.map((rule) => ({ prefix: 'rule', text: rule })),
    ...ctx.pathRuleNotes.map((note) => ({ prefix: 'note', text: note })),
  ];

  for (const source of noteSources) {
    const signal = `${source.prefix}: ${clipSignal(source.text)}`;
    if (AUTH_RE.test(source.text)) addRiskSignal(auth, signal, 2);
    if (SECURITY_RE.test(source.text)) addRiskSignal(security, signal, 2);
    if (DATA_RE.test(source.text)) addRiskSignal(dataIntegrity, signal, 2);
    if (GUARDRAIL_RE.test(source.text)) {
      addRiskSignal(dataIntegrity, signal, 2);
    }
  }

  return [auth, security, dataIntegrity]
    .filter((bucket) => bucket.score > 0 && bucket.signals.length > 0)
    .map((bucket) => ({
      bucket: bucket.bucket,
      priority: bucket.score >= 4 ? 'HIGH' : 'MEDIUM',
      signals: bucket.signals,
    }));
}

function buildRiskFocusSection(ctx: EnrichedDiffContext): string {
  const buckets = buildRiskFocusBuckets(ctx);
  if (buckets.length === 0) return '';

  const guidance: Record<RiskBucket, string> = {
    AUTH_ACCESS_CONTROL:
      're-check authn/authz gates, privilege escalation, tenant scoping, and token/session invalidation',
    SECURITY_BOUNDARY:
      're-check input flows into SQL/shell/file/network surfaces, secret handling, and missing sanitization',
    DATA_INTEGRITY:
      're-check transactions, idempotency, partial writes, race conditions, and rollback safety',
  };

  const lines = buckets.map((bucket) => {
    const signals = bucket.signals.join('; ');
    return `- \`${bucket.bucket}\` [${bucket.priority}] — ${guidance[bucket.bucket]}\n  Signals: ${signals}`;
  });

  return [
    '## Risk-Focus Pass',
    'Do one short second pass on the flagged buckets before finalizing findings. Use these cues to improve recall, not to speculate.',
    lines.join('\n'),
  ].join('\n');
}
