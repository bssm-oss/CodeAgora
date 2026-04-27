/**
 * Confidence value at each pipeline stage.
 *
 * Every field is written ONCE (append-only semantics) and never mutated after
 * assignment. This type replaces the single `confidence` field that previously
 * changed meaning across five different pipeline stages.
 *
 * Stage ordering (matches packages/core/src/pipeline/orchestrator.ts):
 *   parser → hallucination-filter → L1 corroboration → suggestion-verifier → L2 adjust
 */

import { z } from 'zod';

export const ConfidenceTraceSchema = z.object({
  /**
   * Raw confidence parsed from reviewer output (e.g., "(85%)").
   * Set by: packages/core/src/l1/parser.ts
   * Range: 0–100, or undefined if the reviewer did not emit a confidence value.
   */
  raw: z.number().min(0).max(100).optional(),

  /**
   * Confidence after model-specific calibration (#467).
   * Set by: packages/core/src/l1/reviewer.ts via calibration.ts
   * Equals raw × tier-based multiplier when opt-in
   * (`reviewContext.calibrateReviewerConfidence: true`) or when
   * `config.calibrationMultiplier` is set explicitly. Absent when
   * calibration is disabled (default) — downstream stages then see
   * the raw value directly in `doc.confidence`.
   */
  calibrated: z.number().min(0).max(100).optional(),

  /**
   * Confidence after hallucination-filter penalties.
   * Set by: packages/core/src/pipeline/hallucination-filter.ts
   * Equals raw × 0.5 when code-quote fabrication or self-contradiction detected;
   * otherwise equals raw (pass-through).
   */
  filtered: z.number().min(0).max(100).optional(),

  /**
   * Confidence after L1 corroboration (agreement-weighted blend).
   * Set by: packages/core/src/pipeline/confidence.ts via orchestrator.ts
   * Formula: round(filtered × 0.6 + agreementRate × 0.4), scaled by agreeing count.
   */
  corroborated: z.number().min(0).max(100).optional(),

  /**
   * Confidence after suggestion-verifier (CRITICAL+ only, tsc transpile check).
   * Set by: packages/core/src/pipeline/suggestion-verifier.ts
   * Equals corroborated × 0.5 when suggestion fails to compile; otherwise
   * absent (downstream consumers fall back to `corroborated`).
   */
  verified: z.number().min(0).max(100).optional(),

  /**
   * Final confidence after L2 discussion adjustment.
   * Set by: packages/core/src/pipeline/stage-executors.ts adjustConfidenceFromDiscussion
   * This is the authoritative value for downstream consumers (triage, formatter,
   * GitHub mapper, CLI, MCP). For docs that did not enter L2, this mirrors
   * `verified ?? corroborated`.
   */
  final: z.number().min(0).max(100).optional(),

  /**
   * Evidence quality score (#468). Not a confidence stage — a 0–1 quality
   * measure recorded by the hallucination filter (check 6) alongside the
   * `filtered` confidence. Reflects three equally weighted sub-scores:
   * evidence list length, problem text length, and specificity-marker
   * density. The derived multiplier (0.7 + 0.3 × evidence) is folded
   * into the `filtered` value — this field is kept for trace-viewer
   * introspection and future calibration tuning.
   */
  evidence: z.number().min(0).max(1).optional(),

  /**
   * Finding-class prior id (#468 follow-up). Check 7 in the
   * hallucination filter tags the finding with a class id like "redos"
   * / "may-throw" / "missing-validation" / "zero-width" /
   * "generic-potential" when an empirically FP-heavy pattern matches
   * the issue title or problem. The class's multiplier is already
   * folded into `filtered`; this field exists only so the trace
   * viewer can label *why* filtered dropped. Absent when no class matched.
   */
  classPrior: z.string().optional(),
});

export type ConfidenceTrace = z.infer<typeof ConfidenceTraceSchema>;
