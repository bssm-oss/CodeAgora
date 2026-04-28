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
 *   - hand-rolled session cookie / JWT-library preference claims
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
    id: 'prototype-pollution-json-parse',
    label: 'prototype pollution claim against JSON/schema parsing',
    multiplier: 0.5,
    patterns: [
      /\bprototype\s+pollution\b[\s\S]{0,160}\b(?:json|parse|zod|schema)\b/i,
      /\b(?:json|parse|zod|schema)\b[\s\S]{0,160}\bprototype\s+pollution\b/i,
    ],
  },
  {
    id: 'weak-regex-extractor',
    label: 'generic weak regex extractor claim',
    multiplier: 0.4,
    patterns: [
      /\bweak\s+regex\b/i,
      /\bregex\s+(?:may\s+not|might\s+not|does\s+not|doesn't)\s+(?:reliably\s+)?match\b/i,
      /\bcode\s+block\s+detection\b/i,
      /\bfence(?:d)?\s+(?:code\s+)?block\s+(?:detection|extraction)\b/i,
      /\bmalformed\s+fence\s+detection\b/i,
      /\bregex\b[\s\S]{0,120}\bfence(?:d)?\b/i,
    ],
  },
  {
    id: 'malformed-json-parser-edge',
    label: 'malformed JSON parser edge-case claim',
    multiplier: 0.5,
    patterns: [
      /\bmalformed\s+(?:json|input|payload)\b[\s\S]{0,160}\b(?:parseable|starts?\s+with|fallback|extract)/i,
      /\bdoes(?:\s+not|n't)\s+distinguish\b[\s\S]{0,160}\bvalid\s+json\b/i,
    ],
  },
  {
    id: 'speculative-rendered-xss',
    label: 'speculative XSS from hypothetical rendering context',
    multiplier: 0.4,
    patterns: [
      /\bxss\b[\s\S]{0,200}\b(?:rendered|browser|dashboard|ui|html)\b/i,
      /\bxss\b[\s\S]{0,200}\bjson\s+payload\b/i,
      /\bimproper\s+json\s+payload\s+handling\b/i,
      /\bmalicious\s+javascript\b[\s\S]{0,200}\b(?:rendered|browser|dashboard|ui|html)\b/i,
      /\bmalicious\s+code\s+execution\b[\s\S]{0,200}\b(?:json|payload|downstream\s+consumers?)\b/i,
      /\bexecuted\s+if\s+the\s+output\s+is\s+rendered\b/i,
    ],
  },
  {
    id: 'hand-rolled-session-cookie',
    label: 'hand-rolled session cookie / JWT-library preference claim',
    multiplier: 0.5,
    patterns: [
      /\binsecure\s+session\s+cookie\s+implementation\b/i,
      /\bproper\s+jwt\s+library\b/i,
      /\bbase64url\b[\s\S]{0,200}\b(?:proper\s+jwt|secure\s+encoding|session\s+management|cookie\s+parsing)\b/i,
      /\bconstructs?\s+session\s+cookies?\b[\s\S]{0,200}\b(?:directly|manually|proper\s+jwt\s+library)\b/i,
    ],
  },
  {
    id: 'speculative-error-handling',
    label: 'speculative internal-failure error handling claim',
    multiplier: 0.5,
    patterns: [
      /\bpotential\s+information\s+disclosure\b[\s\S]{0,200}\berror\s+handling\b/i,
      /\bif\s+[\w.]+\(\)\s+fails\s+internally\b/i,
      /\bmalformed\s+request\s+or\s+system\s+error\b[\s\S]{0,160}\bleak(?:ing)?\s+internal\s+state\b/i,
      /\berrors?\s+(?:are\s+not|aren't)\s+handled\s+explicitly\b[\s\S]{0,160}\bleak(?:ing)?\s+internal\s+state\b/i,
    ],
  },
  {
    id: 'internal-enum-mismatch',
    label: 'internal enum mismatch / compatibility claim',
    multiplier: 0.5,
    patterns: [
      /\bseverity\s+enum\b[\s\S]{0,160}\b(?:mismatch|inconsisten|does(?:\s+not|n't)\s+match)\b/i,
      /\bDISMISSED\b[\s\S]{0,160}\b(?:not\s+a\s+valid|runtime\s+errors?|consuming\s+code)\b/i,
      /\bschema\s+validation\s+does(?:\s+not|n't)\s+match\s+actual\s+use\s+case\b/i,
      /\breasoning\b[\s\S]{0,120}\b(?:empty|missing)\b[\s\S]{0,120}\b(?:rejected|incorrectly)\b/i,
    ],
  },
  {
    id: 'zod-safeparse-data-access',
    label: 'impossible Zod safeParse data access speculation',
    multiplier: 0.4,
    patterns: [
      /\bzod\b[\s\S]{0,200}\b(?:safeParse|result\.success|result\.data)\b[\s\S]{0,200}\b(?:undefined|null|property\s+access|null\s+dereference)/i,
      /\bresult\.data\.(?:severity|reasoning)\b[\s\S]{0,200}\bresult\.success\b/i,
      /\bresult\.success\b[\s\S]{0,200}\bresult\.data\.(?:severity|reasoning)\b/i,
    ],
  },
  {
    id: 'missing-size-limit',
    label: 'missing payload/input size limit',
    multiplier: 0.6,
    patterns: [
      /\bno\s+maximum\s+(?:payload|input|response)\s+size\s+limit\b/i,
      /\bmissing\s+(?:payload|input|response)\s+size\s+limit\b/i,
      /\bunbounded\s+(?:payload|input|response)\b/i,
      /\blarge\s+json\s+payload\b/i,
      /\bmassive\s+json\s+payload\b/i,
      /\b(?:limit|validate)\s+the\s+size\b[\s\S]{0,160}\bjson\b/i,
      /\bjson\b[\s\S]{0,160}\b(?:size|length)\s+(?:limit|validation)\b/i,
      /\bdeeply\s+nested\b[\s\S]{0,160}\bjson\b/i,
      /\b(?:size|complexity)\s+limits?\b[\s\S]{0,160}\bjson\.parse\b/i,
      /\bjson\.parse\b[\s\S]{0,160}\b(?:size|complexity)\s+limits?\b/i,
    ],
  },
  {
    id: 'forced-decision-null-flow',
    label: 'forced-decision null-return flow speculation',
    multiplier: 0.4,
    patterns: [
      /\bparseForcedDecisionJson\b[\s\S]{0,220}\breturns\s+null\b[\s\S]{0,220}\bcalling\s+code\s+assumes\b/i,
      /\bextractModeratorJsonPayload\b[\s\S]{0,220}\breturns\s+null\b[\s\S]{0,220}\bruntime\s+errors?\b/i,
    ],
  },
  {
    id: 'json-parse-catch-masking',
    label: 'speculative broad-catch JSON.parse masking claim',
    multiplier: 0.5,
    patterns: [
      /\bbroad\s+catch\b[\s\S]{0,200}\b(?:json\.parse|json\s+parsing|parser[-\s]?related|memory\s+exhaustion)\b/i,
      /\bjson(?:\.parse|\s+parsing)\b[\s\S]{0,200}\b(?:mask(?:ing)?|memory\s+exhaustion|parser[-\s]?related\s+problems?)\b/i,
      /\bmemory\s+exhaustion\b[\s\S]{0,160}\b(?:json(?:\.parse|\s+parsing)|parser)\b/i,
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
      /\bwithout\s+(?:any\s+)?(?:try[/-]?catch|error\s+handling)\b/i,
    ],
  },
  {
    id: 'missing-validation',
    label: 'missing input validation / sanitization',
    multiplier: 0.7,
    patterns: [
      /\bincomplete\s+(?:input\s+)?(?:validation|sanitization|sanitisation)\b/i,
      /\bmissing\s+(?:input\s+)?(?:validation|sanitization|sanitisation)\b/i,
      /\b(?:no|without|lacks)\s+(?:input\s+)?(?:validation|sanitization|sanitisation)\b/i,
      /\bdoes\s+not\s+verify\b[\s\S]{0,120}\brequired\s+\w+\s+property\b/i,
      /\bdoes\s+not\s+validate\b[\s\S]{0,160}\b(?:required\s+fields?|valid\s+types?|input\s+parameters?|actor\s+object)\b/i,
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
    id: 'undeclared-type',
    label: 'undeclared type / missing import',
    multiplier: 0.4,
    patterns: [
      /\b(?:undeclared|undefined)\s+(?:type|interface|symbol|identifier)\b/i,
      /\b(?:not|never)\s+imported\b/i,
      /\b(?:missing|forgot(?:ten)?)\s+import\b/i,
      /\bwithout\s+importing\s+it\b/i,
      /\bcannot\s+find\s+name\b/i,
      /\btypescript\s+compilation\s+error\b/i,
    ],
  },
  {
    id: 'typescript-syntax-trivia',
    label: 'TypeScript syntax trivia false positive',
    multiplier: 0.4,
    patterns: [
      /\btrailing\s+comma\b[\s\S]{0,160}\b(?:last|sole)\s+parameter\b/i,
      /\bfunction\s+signature\b[\s\S]{0,160}\btrailing\s+comma\b/i,
      /\btypescript\b[\s\S]{0,160}\bdoes\s+not\s+permit\s+a\s+comma\b/i,
    ],
  },
  {
    id: 'sorting-comparator',
    label: 'generic incorrect sorting comparator claim',
    multiplier: 0.4,
    patterns: [
      /\bincorrect\s+sorting\b/i,
      /\bsorting\s+logic\s+(?:is\s+)?(?:incorrect|flawed|wrong)\b/i,
      /\bcomparator\s+(?:is\s+)?(?:incorrect|flawed|wrong)\b/i,
      /\bwrong\s+(?:top|order|ordering)\s+(?:users|items|results|entries)\b/i,
      /\bsort(?:ing)?\s+instability\b/i,
      /\bunstable\s+sort\s+comparison\b/i,
      /\bdoes\s+not\s+guarantee\s+stable\s+sort(?:ing)?\s+behavior\b/i,
      /\bstable\s+sort(?:ing)?\s+behavior\b[\s\S]{0,160}\b(?:inconsistent|engine|implementation)/i,
      /\bsort(?:ing)?\s+behavior\s+with\s+nan\b/i,
      /\bnan\s+scores?\b[\s\S]{0,120}\bsort/i,
      /\bsort\b[\s\S]{0,120}\bnan\s+scores?\b/i,
      /\bsort(?:ing)?\b[\s\S]{0,160}\bnan\b/i,
      /\bnan\b[\s\S]{0,160}\bsort(?:ing)?\b/i,
      /\bperformance\s+regression\b[\s\S]{0,160}\bsort\s+comparison\b/i,
      /\badditional\s+conditional\s+logic\b[\s\S]{0,160}\bsort\b/i,
      /\bunnecessary\s+string\s+comparison\b[\s\S]{0,160}\bsort/i,
      /\bsecondary\s+sorting\s+by\s+title\b[\s\S]{0,160}\bperformance\s+overhead\b/i,
      /\blocaleCompare\b[\s\S]{0,160}\b(?:non[-\s]?string|not\s+a\s+string|typeerror)\b/i,
      /\b(?:non[-\s]?string|not\s+a\s+string|typeerror)\b[\s\S]{0,160}\blocaleCompare\b/i,
    ],
  },
  {
    id: 'date-serialization-type-guard',
    label: 'typed Date serialization guard speculation',
    multiplier: 0.4,
    patterns: [
      /\btoISOString\(\)[\s\S]{0,200}\b(?:valid\s+date|date\s+instance|non[-\s]?date|typeerror)\b/i,
      /\b(?:valid\s+date|date\s+instance|non[-\s]?date|typeerror)\b[\s\S]{0,200}\btoISOString\(\)/i,
      /\bexpiresAt\b[\s\S]{0,200}\b(?:undefined|null|non[-\s]?date|invalid\s+date)\b/i,
    ],
  },
  {
    id: 'flat-kv-parser-speculation',
    label: 'generic flat key-value parser speculation',
    multiplier: 0.4,
    patterns: [
      /\bparseKVString\b[\s\S]{0,200}\b(?:injection-like|security\s+vulnerability|regex|memory\s+leak)\b/i,
      /\b(?:injection-like|security\s+vulnerability|regex|memory\s+leak)\b[\s\S]{0,200}\bparseKVString\b/i,
      /\bregex\b[\s\S]{0,160}\bmemory\s+leaks?\b/i,
      /\binjection-like\s+behavior\b/i,
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
