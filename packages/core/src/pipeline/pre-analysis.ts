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
