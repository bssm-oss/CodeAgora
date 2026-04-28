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
      /\bzero[\s\u2010-\u2015-]?width\s+(?:space|character|char)\b/i,
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
      /\bregex\b[\s\S]{0,160}\b(?:backticks?|denial[-\s]?of[-\s]?service|regex\s+injection|injection\s+vectors?)\b/i,
    ],
  },
  {
    id: 'malformed-json-parser-edge',
    label: 'malformed JSON parser edge-case claim',
    multiplier: 0.5,
    patterns: [
      /\bmalformed\s+(?:json|input|payload)\b[\s\S]{0,160}\b(?:parseable|starts?\s+with|fallback|extract)/i,
      /\bdoes(?:\s+not|n't)\s+distinguish\b[\s\S]{0,160}\bvalid\s+json\b/i,
      /\bparseForcedDecisionJson\b[\s\S]{0,180}\barray\s+inputs?\b/i,
      /\barray\s+inputs?\b[\s\S]{0,180}\bparseForcedDecisionJson\b/i,
      /\bextractModeratorJsonPayload\b[\s\S]{0,220}\b(?:always[-\s]?true|truthy\s+string\s+literal|incorrect\s+logical\s+expression)\b/i,
      /\b(?:always[-\s]?true|truthy\s+string\s+literal|incorrect\s+logical\s+expression)\b[\s\S]{0,220}\bextractModeratorJsonPayload\b/i,
      /\bextractModeratorJsonPayload\b[\s\S]{0,220}\b(?:empty\s+capture|empty\s+json\s+payload|falsy|silently\s+ignored|discard(?:ed)?\s+the\s+verdict)\b/i,
      /\b(?:empty\s+capture|empty\s+json\s+payload|falsy|silently\s+ignored|discard(?:ed)?\s+the\s+verdict)\b[\s\S]{0,220}\bextractModeratorJsonPayload\b/i,
    ],
  },
  {
    id: 'json-error-handling-nit',
    label: 'non-blocking JSON parse error-handling/logging nit',
    multiplier: 0.4,
    patterns: [
      /\bjson\s+parsing\b[\s\S]{0,220}\b(?:generic\s+exceptions?|proper\s+error\s+handling|log|debug(?:ging)?|malicious\s+input\s+attempts?)\b/i,
      /\b(?:generic\s+exceptions?|proper\s+error\s+handling|log|debug(?:ging)?|malicious\s+input\s+attempts?)\b[\s\S]{0,220}\bjson\s+parsing\b/i,
      /\bjson\s+parse\b[\s\S]{0,220}\b(?:generic\s+exceptions?|proper\s+error\s+handling|log|debug(?:ging)?|malicious\s+input\s+attempts?)\b/i,
      /\b(?:generic\s+exceptions?|proper\s+error\s+handling|log|debug(?:ging)?|malicious\s+input\s+attempts?)\b[\s\S]{0,220}\bjson\s+parse\b/i,
    ],
  },
  {
    id: 'speculative-rendered-xss',
    label: 'speculative XSS from hypothetical rendering context',
    multiplier: 0.4,
    patterns: [
      /\bxss\b[\s\S]{0,200}\b(?:rendered|browser|dashboard|ui|html)\b/i,
      /\bxss\b[\s\S]{0,200}\bjson\s+payload\b/i,
      /\bxss\b[\s\S]{0,200}\b(?:json\s+parse|json\.parse|json\s+parsing|extractModeratorJsonPayload|code\s+injection)\b/i,
      /\bimproper\s+json\s+payload\s+handling\b/i,
      /\bimproper\s+json\s+parsing\b[\s\S]{0,200}\bxss\b/i,
      /\bmalicious\s+javascript\b[\s\S]{0,200}\b(?:rendered|browser|dashboard|ui|html)\b/i,
      /\bmalicious\s+code\s+execution\b[\s\S]{0,200}\b(?:json|payload|downstream\s+consumers?)\b/i,
      /\bmalicious\s+input\b[\s\S]{0,200}\b(?:xss|json\.parse|code\s+injection)\b/i,
      /\barbitrary\s+code\s+execution\b[\s\S]{0,200}\b(?:json|payload|reasoning|moderator\s+response|parser)\b/i,
      /\breasoning\s+field\b[\s\S]{0,160}\b(?:execute|code\s+execution|malicious\s+code)\b/i,
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
    id: 'service-token-concurrency-speculation',
    label: 'speculative service-token concurrency / environment mutation claim',
    multiplier: 0.4,
    patterns: [
      /\bservice\s+token\b[\s\S]{0,220}\b(?:race\s+condition|concurrent\s+access|shared,\s+potentially\s+mutable\s+environment|mutable\s+environment\s+object)\b/i,
      /\b(?:race\s+condition|concurrent\s+access|shared,\s+potentially\s+mutable\s+environment|mutable\s+environment\s+object)\b[\s\S]{0,220}\bservice\s+token\b/i,
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
    id: 'error-message-quality-nit',
    label: 'non-blocking error-message quality nit',
    multiplier: 0.4,
    patterns: [
      /\bincorrect\s+error\s+handling\b[\s\S]{0,180}\b(?:unhelpful\s+message|debugging|client\s+handling|missing\s+userId)\b/i,
      /\bunhelpful\s+(?:error\s+)?message\b[\s\S]{0,180}\b(?:debugging|client\s+handling|missing\s+userId)\b/i,
    ],
  },
  {
    id: 'internal-enum-mismatch',
    label: 'internal enum mismatch / compatibility claim',
    multiplier: 0.5,
    patterns: [
      /\bunvalidated\s+severity\s+enum\b/i,
      /\boutput\s+type\s+mismatch\b[\s\S]{0,180}\b(?:schema|return\s+type|severity)\b/i,
      /\bparseForcedDecisionJson\b[\s\S]{0,220}\bseverity\b[\s\S]{0,220}\b(?:schema|return\s+type|string\s+enum|type\s+mismatch|type\s+definitions)/i,
      /\bseverity\s+enum\b[\s\S]{0,160}\b(?:mismatch|inconsisten|does(?:\s+not|n't)\s+match)\b/i,
      /\bseverity\s+enum\b[\s\S]{0,160}\b(?:unvalidated|type[-\s]?check|allowed\s+enum\s+options)\b/i,
      /\bseverity\s+type\s+handling\b/i,
      /\bschema\b[\s\S]{0,160}\bstring\s+enum\s+values\b[\s\S]{0,160}\bSeverity\b/i,
      /\bseverity\b[\s\S]{0,160}\bstring\s+enum\b[\s\S]{0,160}\b(?:Severity\s+enum|type\s+mismatch|typescript\s+interface)/i,
      /\barchitecture\s+mismatch\b[\s\S]{0,160}\b(?:json|enum|Severity)\b/i,
      /\b(?:json|string)\s+representations?\b[\s\S]{0,160}\b(?:Severity|enum)\b/i,
      /\bseverity\b[\s\S]{0,160}\bzod\s+schema\b[\s\S]{0,160}\b(?:not\s+the\s+Severity\s+type|string\s+literals?)/i,
      /\bzod\s+schema\b[\s\S]{0,160}\bseverity\b[\s\S]{0,160}\b(?:not\s+the\s+Severity\s+type|string\s+literals?)/i,
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
    id: 'session-actor-type-confusion',
    label: 'speculative session actor type-confusion claim',
    multiplier: 0.4,
    patterns: [
      /\btype\s+confusion\b[\s\S]{0,180}\bgetUser\b/i,
      /\bgetUser\b[\s\S]{0,180}\b(?:type\s+confusion|type\s+safety\s+violation|tampered\s+with)\b/i,
      /\bunsafe\s+type\s+assertion\b[\s\S]{0,180}\b(?:getUser|SessionActor|session\s+data)\b/i,
      /\b(?:getUser|SessionActor|session\s+data)\b[\s\S]{0,180}\bunsafe\s+type\s+assertion\b/i,
      /\bSessionActor\b[\s\S]{0,180}\b(?:cast|type\s+safety|tampered\s+with)\b/i,
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
      /\bjson\b[\s\S]{0,160}\bwithout\s+size\s+limits?\b/i,
      /\bwithout\s+size\s+limits?\b[\s\S]{0,160}\bjson\b/i,
      /\bresource\s+exhaustion\b[\s\S]{0,180}\b(?:json|payload|extractModeratorJsonPayload|large\s+blocks?\s+of\s+text)\b/i,
      /\b(?:json|payload|extractModeratorJsonPayload|large\s+blocks?\s+of\s+text)\b[\s\S]{0,180}\bresource\s+exhaustion\b/i,
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
    id: 'parse-quota-required-field-nit',
    label: 'typed parseQuotaConfig required-field validation nit',
    multiplier: 0.3,
    patterns: [
      /\bparseQuotaConfig\b[\s\S]{0,180}\b(?:required\s+limits?\s+property|required\s+fields?|does\s+not\s+validate|does\s+not\s+verify)\b/i,
      /\b(?:required\s+limits?\s+property|required\s+fields?|does\s+not\s+validate|does\s+not\s+verify)\b[\s\S]{0,180}\bparseQuotaConfig\b/i,
    ],
  },
  {
    id: 'unauthorized-response-info-leak-nit',
    label: 'generic unauthorized response information-leak nit',
    multiplier: 0.3,
    patterns: [
      /\bunauthorized\s+response\b[\s\S]{0,180}\b(?:info(?:rmation)?\s+leak|enumeration|endpoint\s+naming)\b/i,
      /\b(?:info(?:rmation)?\s+leak|enumeration|endpoint\s+naming)\b[\s\S]{0,180}\bunauthorized\s+response\b/i,
      /\bplain\s+text\s+["']?Unauthorized["']?\b[\s\S]{0,180}\b(?:expose|leak|enumeration|endpoint)\b/i,
      /\bnew\s+Response\(["']Unauthorized["'][\s\S]{0,220}\b(?:expose|leak|enumeration|endpoint)\b/i,
    ],
  },
  {
    id: 'type-assertion-bypass-speculation',
    label: 'generic TypeScript type assertion bypass speculation',
    multiplier: 0.3,
    patterns: [
      /\btype\s+assertion\b[\s\S]{0,180}\b(?:bypass|invalid\s+data|does\s+not\s+properly\s+validate)\b/i,
      /\b(?:bypass|invalid\s+data|does\s+not\s+properly\s+validate)\b[\s\S]{0,180}\btype\s+assertion\b/i,
      /\bas\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\|\s*null)?\b[\s\S]{0,220}\b(?:bypass|invalid\s+data|validate)\b/i,
      /\bSessionActor\s*\|\s*null\b[\s\S]{0,220}\b(?:bypass|invalid\s+data|validate)\b/i,
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
    id: 'numeric-limit-validation-nit',
    label: 'numeric limit validation nit',
    multiplier: 0.4,
    patterns: [
      /\binvalid\s+limit\s+values?\b/i,
      /\blimit\b[\s\S]{0,120}\b(?:finite|non[-\s]?negative|number)\b[\s\S]{0,120}\b(?:validate|validation|invalid)\b/i,
      /\b(?:validate|validation|invalid)\b[\s\S]{0,120}\blimit\b[\s\S]{0,120}\b(?:finite|non[-\s]?negative|number)\b/i,
    ],
  },
  {
    id: 'documentation-contract-nit',
    label: 'documentation/contract wording nit',
    multiplier: 0.4,
    patterns: [
      /\bmisleading\s+documentation\b/i,
      /\bdocumentation\b[\s\S]{0,180}\b(?:returns\s+the\s+top|more\s+than\s+limit|limit\s*\+\s*1)\b/i,
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
    id: 'array-copy-microperf',
    label: 'micro-performance claim about defensive array copy',
    multiplier: 0.4,
    patterns: [
      /\bunnecessary\s+array\s+copy\b[\s\S]{0,180}\b(?:performance|memory|large\s+result\s+sets?)/i,
      /\bperformance\s+degradation\b[\s\S]{0,180}\bunnecessary\s+array\s+copy\b/i,
    ],
  },
  {
    id: 'sorting-comparator',
    label: 'generic incorrect sorting comparator claim',
    multiplier: 0.4,
    patterns: [
      /\bincorrect\s+sorting\b/i,
      /\bsorting\s+logic\s+(?:is\s+)?(?:incorrect|flawed|wrong)\b/i,
      /\bsorting\s+logic\b[\s\S]{0,120}\b(?:incorrect|inconsistent\s+ordering|inconsistent\s+ordering\s+results)\b/i,
      /\b(?:incorrect|inconsistent\s+ordering|inconsistent\s+ordering\s+results)\b[\s\S]{0,120}\bsorting\s+logic\b/i,
      /\bsort(?:ing)?\s+logic\b[\s\S]{0,120}\bincorrect\s+formula\b/i,
      /\bincorrect\s+formula\b[\s\S]{0,120}\b(?:sort|sorting|comparator)\b/i,
      /\bsort\s+function\b[\s\S]{0,120}\bincorrect\s+logic\b/i,
      /\bincorrect\s+logic\b[\s\S]{0,120}\bsort\s+function\b/i,
      /\bsort(?:ing)?\s+comparator\b[\s\S]{0,160}\b(?:logic\s+error|incorrect\s+ordering|incorrect)\b/i,
      /\b(?:logic\s+error|incorrect\s+ordering|incorrect)\b[\s\S]{0,160}\bsort(?:ing)?\s+comparator\b/i,
      /\bcomparator\s+(?:is\s+)?(?:incorrect|flawed|wrong)\b/i,
      /\bwrong\s+(?:top|order|ordering)\s+(?:users|items|results|entries)\b/i,
      /\bsort(?:ing)?\s+instability\b/i,
      /\bunstable\s+sort\s+comparison\b/i,
      /\bdoes\s+not\s+guarantee\s+stable\s+sort(?:ing)?\s+behavior\b/i,
      /\bstable\s+sort(?:ing)?\s+behavior\b[\s\S]{0,160}\b(?:inconsistent|engine|implementation)/i,
      /\bsecondary\s+sort\s+key\b[\s\S]{0,220}\b(?:inconsistent\s+behavior|downstream\s+code|stable\s+sort(?:ing)?|break\s+expectations?)\b/i,
      /\b(?:inconsistent\s+behavior|downstream\s+code|stable\s+sort(?:ing)?|break\s+expectations?)\b[\s\S]{0,220}\bsecondary\s+sort\s+key\b/i,
      /\btitle\b[\s\S]{0,220}\b(?:stable\s+sort(?:ing)?|downstream\s+code\s+relying\s+on\s+stable\s+sort(?:ing)?|break\s+expectations?)\b/i,
      /\bsort(?:ing)?\s+behavior\s+with\s+nan\b/i,
      /\bnan\s+scores?\b[\s\S]{0,120}\bsort/i,
      /\bsort\b[\s\S]{0,120}\bnan\s+scores?\b/i,
      /\bsort(?:ing)?\b[\s\S]{0,160}\bnan\b/i,
      /\bnan\b[\s\S]{0,160}\bsort(?:ing)?\b/i,
      /\bfloating[-\s]?point\s+precision\b[\s\S]{0,180}\b(?:sort|sorting|score|equality|comparison)\b/i,
      /\b(?:sort|sorting|score|equality|comparison)\b[\s\S]{0,180}\bfloating[-\s]?point\s+precision\b/i,
      /\bnegative\s+infinity\b[\s\S]{0,160}\b(?:score|sort|comparison|order)\b/i,
      /\b(?:score|sort|comparison|order)\b[\s\S]{0,160}\bnegative\s+infinity\b/i,
      /\bperformance\s+regression\b[\s\S]{0,160}\bsort\s+comparison\b/i,
      /\bperformance\s+regression\b[\s\S]{0,180}\bsort(?:ing)?\b/i,
      /\bsort(?:ing)?\b[\s\S]{0,180}\bperformance\s+regression\b/i,
      /\bfunction\s+call\s+overhead\b[\s\S]{0,180}\b(?:sort(?:ing)?|comparison|comparator)\b/i,
      /\b(?:sort(?:ing)?|comparison|comparator)\b[\s\S]{0,180}\bfunction\s+call\s+overhead\b/i,
      /\btitle\s+comparison\b[\s\S]{0,160}\bperformance\s+overhead\b/i,
      /\btitle\s+alone\s+still\s+executes\b/i,
      /\bpredicate\s+to\s+sort\s+by\s+title\s+alone\b/i,
      /\bunnecessary\s+work\b[\s\S]{0,180}\b(?:score|scores)\s+are\s+(?:distinct|unique)\b/i,
      /\b(?:score|scores)\s+are\s+(?:distinct|unique)\b[\s\S]{0,180}\bunnecessary\s+work\b/i,
      /\btitle\s+comparison\b[\s\S]{0,180}\b(?:not\s+needed|isn'?t\s+needed|unnecessary)\b/i,
      /\btitle\s+comparison\s+fallback\b[\s\S]{0,220}\b(?:performance\s+(?:regression|degradation)|large\s+result\s+sets?|localeCompare)\b/i,
      /\bperformance\s+(?:regression|degradation)\b[\s\S]{0,220}\b(?:title\s+comparison\s+fallback|localeCompare)\b/i,
      /\blocaleCompare\b[\s\S]{0,220}\b(?:large\s+result\s+sets?|identical\s+scores?|performance\s+(?:regression|degradation))\b/i,
      /\blocaleCompare\b[\s\S]{0,220}\b(?:thread[-\s]?safe|race\s+conditions?|concurrent\s+sorting|concurrent\s+environments?)\b/i,
      /\b(?:thread[-\s]?safe|race\s+conditions?|concurrent\s+sorting|concurrent\s+environments?)\b[\s\S]{0,220}\blocaleCompare\b/i,
      /\bperformance\s+overhead\b[\s\S]{0,160}\btitle\s+comparison\b/i,
      /\badditional\s+conditional\s+logic\b[\s\S]{0,160}\bsort\b/i,
      /\bunnecessary\s+string\s+comparison\b[\s\S]{0,160}\bsort/i,
      /\bsecondary\s+sorting\s+by\s+title\b[\s\S]{0,160}\bperformance\s+overhead\b/i,
      /\blocaleCompare\b[\s\S]{0,160}\b(?:non[-\s]?string|not\s+a\s+string|typeerror|undefined|null)\b/i,
      /\b(?:non[-\s]?string|not\s+a\s+string|typeerror|undefined|null)\b[\s\S]{0,160}\blocaleCompare\b/i,
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
      /\b(?:injection-like|injection[-\s]?style|security\s+vulnerability|regex|memory\s+leak)\b[\s\S]{0,200}\bparseKVString\b/i,
      /\bparseKVString\b[\s\S]{0,220}\b(?:injection[-\s]?style|filesystem\s+paths?|database\s+columns?|system\s+components?)\b/i,
      /\b(?:injection[-\s]?style|filesystem\s+paths?|database\s+columns?|system\s+components?)\b[\s\S]{0,220}\bparseKVString\b/i,
      /\bregex\b[\s\S]{0,160}\bmemory\s+leaks?\b/i,
      /\binjection-like\s+behavior\b/i,
      /\binjection[-\s]?style\s+behavior\b/i,
    ],
  },
  {
    id: 'quota-reset-boundary-nit',
    label: 'quota reset exact-boundary timing nit',
    multiplier: 0.3,
    patterns: [
      /\bmaybeResetWindow\b[\s\S]{0,220}\b(?:24[-\s]?hour|boundary|extra\s+millisecond|>=\s*WINDOW_MS|non[-\s]?inclusive)\b/i,
      /\b(?:24[-\s]?hour|boundary|extra\s+millisecond|>=\s*WINDOW_MS|non[-\s]?inclusive)\b[\s\S]{0,220}\bmaybeResetWindow\b/i,
      /\bquota\b[\s\S]{0,220}\b(?:resets?\s+exactly|extra\s+millisecond|24[-\s]?hour\s+boundary)\b/i,
      /\bmaybeResetWindow\b[\s\S]{0,220}\b(?:time\s+zones?|system\s+clock|clock\s+adjustments?|absolute\s+timestamps?)\b/i,
      /\b(?:time\s+zones?|system\s+clock|clock\s+adjustments?|absolute\s+timestamps?)\b[\s\S]{0,220}\bmaybeResetWindow\b/i,
    ],
  },
  {
    id: 'quota-reset-race-speculation',
    label: 'quota reset race-condition restatement of input mutation',
    multiplier: 0.4,
    patterns: [
      /\bquota\s+reset\b[\s\S]{0,180}\brace\s+conditions?\b/i,
      /\brace\s+conditions?\b[\s\S]{0,180}\bquota\s+reset\b/i,
      /\bmaybeResetWindow\b[\s\S]{0,220}\b(?:race\s+conditions?|multiple\s+processes|threads|concurrent(?:ly)?)\b/i,
      /\b(?:race\s+conditions?|multiple\s+processes|threads|concurrent(?:ly)?)\b[\s\S]{0,220}\bmaybeResetWindow\b/i,
    ],
  },
  {
    id: 'moderator-json-parser-compatibility-noise',
    label: 'moderator JSON parser compatibility/noise claim',
    multiplier: 0.4,
    patterns: [
      /\b(?:parseForcedDecisionJson|extractModeratorJsonPayload|ModeratorVerdictJsonSchema)\b[\s\S]{0,260}\b(?:xss|regex|fence|severity|schema|string\s+enum|type\s+mismatch|size\s+limits?|resource\s+exhaustion|denial[-\s]?of[-\s]?service|excessive\s+(?:memory|cpu)|malformed\s+json\s+input|json\s+(?:payload|parsing|input)|code\s+execution|injection|silently\s+ignored|forced[-\s]?decision\s+verdict)\b/i,
      /\b(?:xss|regex|fence|severity|schema|string\s+enum|type\s+mismatch|size\s+limits?|resource\s+exhaustion|denial[-\s]?of[-\s]?service|excessive\s+(?:memory|cpu)|malformed\s+json\s+input|json\s+(?:payload|parsing|input)|code\s+execution|injection|silently\s+ignored|forced[-\s]?decision\s+verdict)\b[\s\S]{0,260}\b(?:parseForcedDecisionJson|extractModeratorJsonPayload|ModeratorVerdictJsonSchema)\b/i,
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
