/**
 * Golden bug fixture schema (#472)
 *
 * A golden-bug fixture describes a diff for which we know the ground-truth
 * findings. It powers the FN measurement framework (`scripts/bench-fn.mjs`):
 *
 *   - `expectedFindings = []` → FP regression case (review should report nothing)
 *   - `expectedFindings` populated → recall case (review should catch listed bugs)
 *
 * Fixtures live at `benchmarks/golden-bugs/<id>/{diff.patch, expected.json}`.
 * The JSON file matches `GoldenBugFixtureSchema`.
 */

import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const ExpectedFindingSchema = z.object({
  filePath: z.string().min(1),
  lineRange: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  /**
   * Allowed deviation (in lines) around `lineRange` when matching. Defaults
   * to 10 to stay consistent with the hallucination filter's ±10 window.
   */
  lineTolerance: z.number().int().min(0).max(100).optional(),
  /** Minimum severity the review must raise to count as a hit. */
  minSeverity: SeveritySchema,
  /**
   * Short phrase describing the bug. Not used for matching — purely for
   * human readability when the runner prints misses.
   */
  rationale: z.string().min(1),
  /**
   * Optional keyword that must appear (case-insensitive) in the review's
   * `issueTitle` or `problem`. Use sparingly — over-specific keywords make
   * the benchmark brittle.
   */
  keyword: z.string().min(1).optional(),
});
export type ExpectedFinding = z.infer<typeof ExpectedFindingSchema>;

export const GoldenBugFixtureSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  title: z.string().min(1),
  /**
   * Where this fixture came from: CVE id, commit SHA + repo, or internal
   * reference. Purely informational.
   */
  source: z.string().min(1),
  /**
   * Free-text category for grouping reports (e.g., "cve", "hotfix",
   * "fp-regression"). Not enumerated so new categories can be added
   * without a schema bump.
   */
  category: z.string().min(1),
  /**
   * Empty list means "review should report nothing" — FP regression case.
   * Non-empty list means the review must surface each entry (recall case).
   */
  expectedFindings: z.array(ExpectedFindingSchema),
  notes: z.string().optional(),
});
export type GoldenBugFixture = z.infer<typeof GoldenBugFixtureSchema>;

export const DEFAULT_LINE_TOLERANCE = 10;
