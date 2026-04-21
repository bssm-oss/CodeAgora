/**
 * Finding-class priors (#468 follow-up, ref: research notes 2026-04-20).
 *
 * Some claim categories are empirically FP-heavy in LLM code review
 * output. The 2026-04-20 n=3+3 baseline runs against
 * `fp-moderator-regex` and `quota-manager-dual` surfaced these classes
 * repeatedly even after the other six hallucination checks:
 *
 *   - ReDoS / catastrophic backtracking (regex safety concern-trolling)
 *   - "may throw" / uncaught exception (against code with try/catch)
 *   - "missing input validation" (against typed internal helpers)
 *   - zero-width / invisible character in string literal
 *   - generic "potential" security concern phrasing
 *
 * Each class gets a single multiplier applied once to the filtered
 * confidence. The stacking with other checks is intentional — a finding
 * that also trips speculation (×0.7) or evidence (×0.7–1.0) compounds
 * toward ignore-tab routing, which is the goal.
 *
 * This is NOT a correctness claim. Real bugs in these classes exist
 * (ReDoS CVEs are published weekly). The prior captures observed base
 * rates in this pipeline with its current reviewer pool. Moving to a
 * different reviewer mix can invalidate these numbers; the
 * `FINDING_CLASS_PRIORS` table is the one place to re-tune.
 */

import type { EvidenceDocument } from '../types/core.js';

export interface FindingClassPrior {
  /** Stable identifier for the class — used in trace output. */
  id: string;
  /** Patterns matched against issueTitle + problem (case-insensitive). */
  patterns: RegExp[];
  /** Multiplier ∈ [0, 1] applied to filtered confidence. */
  multiplier: number;
  /** Short human-readable label. */
  label: string;
}

/**
 * Ordered table of priors. First match wins — order from most-specific
 * to most-general so generic catch-alls don't eat specific cases.
 */
export const FINDING_CLASS_PRIORS: FindingClassPrior[] = [
  {
    id: 'redos',
    label: 'ReDoS / catastrophic backtracking',
    multiplier: 0.6,
    patterns: [
      /\bredos\b/i,
      /\bcatastrophic\s+backtracking\b/i,
      /\bregular\s+expression\s+denial\s+of\s+service\b/i,
      /\bregex\s+(?:denial\s+of\s+service|dos)\b/i,
      /\bexponential\s+(?:time|backtracking)\b/i,
    ],
  },
  {
    id: 'zero-width',
    label: 'zero-width / invisible unicode character',
    multiplier: 0.5,
    patterns: [
      /\bzero[-\s]?width\s+(?:space|character|char)\b/i,
      /\binvisible\s+(?:character|char|unicode)\b/i,
      /\b(?:hidden|embedded)\s+unicode\s+(?:character|char)\b/i,
      /\bu\+200b\b/i,
    ],
  },
  {
    id: 'may-throw',
    label: '"may throw" uncaught exception',
    multiplier: 0.7,
    patterns: [
      /\bmay\s+throw\b/i,
      /\bmight\s+throw\b/i,
      /\buncaught\s+(?:exception|error|syntaxerror|typeerror)\b/i,
      /\bunhandled\s+(?:exception|error|rejection|promise)\b/i,
      /\bwithout\s+(?:any\s+)?(?:try[/\-]?catch|error\s+handling)\b/i,
    ],
  },
  {
    id: 'missing-validation',
    label: 'missing input validation / sanitization',
    multiplier: 0.7,
    patterns: [
      /\bmissing\s+(?:input\s+)?(?:validation|sanitization|sanitisation)\b/i,
      /\b(?:no|without|lacks)\s+(?:input\s+)?(?:validation|sanitization|sanitisation)\b/i,
      /\bunsanitized\s+(?:input|parameter|argument)\b/i,
      /\bunvalidated\s+(?:input|parameter|argument|user\s+input)\b/i,
    ],
  },
  {
    id: 'missing-null-guard',
    label: 'missing null / undefined guard',
    multiplier: 0.7,
    patterns: [
      /\bmissing\s+null(?:[/\-\s]?(?:undefined))?\s+(?:guard|check)\b/i,
      /\b(?:no|without|lacks)\s+null(?:[/\-\s]?(?:undefined))?\s+(?:guard|check)\b/i,
      /\bnull\s*\/\s*undefined\s+check\b/i,
      /\bundefined\s+reference\b/i,
    ],
  },
  {
    id: 'generic-potential',
    label: 'generic "potential" security concern',
    multiplier: 0.85,
    patterns: [
      /\bpotential\s+(?:security|vulnerability|risk|issue|concern)\b/i,
      /\bcould\s+(?:be\s+)?(?:exploited|vulnerable|unsafe)\b/i,
    ],
  },
];

export interface MatchedClass {
  id: string;
  label: string;
  multiplier: number;
}

/**
 * Match the first applicable class. Returns null when no prior matches.
 * Priors are conservative — if you're surprised by a match, tighten the
 * pattern instead of loosening it.
 */
export function matchFindingClass(doc: EvidenceDocument): MatchedClass | null {
  const haystack = `${doc.issueTitle}\n${doc.problem}`;
  for (const prior of FINDING_CLASS_PRIORS) {
    for (const pattern of prior.patterns) {
      if (pattern.test(haystack)) {
        return { id: prior.id, label: prior.label, multiplier: prior.multiplier };
      }
    }
  }
  return null;
}
