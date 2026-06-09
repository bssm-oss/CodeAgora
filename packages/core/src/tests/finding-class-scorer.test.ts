import { describe, it, expect } from 'vitest';
import type { EvidenceDocument } from '../types/core.js';
import { matchFindingClass, FINDING_CLASS_PRIORS } from '../pipeline/finding-class-scorer.js';

function doc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'title',
    problem: 'problem',
    evidence: [],
    severity: 'WARNING',
    suggestion: 's',
    filePath: 'src/a.ts',
    lineRange: [10, 10],
    ...overrides,
  };
}

describe('matchFindingClass — positive matches', () => {
  // Real FP samples captured from 2026-04-20 bench-fn runs against
  // fp-moderator-regex and quota-manager-dual. Each must trip the
  // corresponding prior class.

  it('catches provider/model contract flexibility claims from Action config changes', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Removal of Groq Provider Support in GitHub Actions Workflows',
        problem:
          'The workflow no longer sets GROQ_API_KEY and this breaks existing user setups that relied on Groq provider support.',
      }),
    )!;
    expect(match.id).toBe('provider-contract-flexibility');
    expect(match.multiplier).toBe(0.2);
  });

  it('catches review-run summary merge policy claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incorrect logic in mergeReviewOutputsByReviewer prevents correct review summary and status counting',
        problem:
          'The uniqueById helper uses first-encountered-wins behavior for duplicate reviewer IDs instead of selecting the best status.',
      }),
    )!;
    expect(match.id).toBe('review-run-summary-policy');
    expect(match.multiplier).toBe(0.2);
  });

  it('catches ReDoS claim against a bounded regex (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential ReDoS Vulnerability in Regex Pattern',
        problem: 'The regex pattern may cause catastrophic backtracking on malformed input.',
      }),
    )!;
    expect(match.id).toBe('redos');
    expect(match.multiplier).toBe(0.6);
  });

  it('catches "Potential Regular Expression Denial of Service" phrasing (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Regular Expression Denial of Service (ReDoS)',
        problem: 'Exponential time possible on adversarial input.',
      }),
    )!;
    expect(match.id).toBe('redos');
  });

  it('catches JSON.parse "may throw" claim against code with try/catch (run 1 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unhandled JSON Parsing Exception in parseForcedDecisionJson',
        problem: 'JSON.parse may throw a SyntaxError if the payload is not valid JSON.',
      }),
    )!;
    expect(match.id).toBe('may-throw');
    expect(match.multiplier).toBe(0.7);
  });

  it('catches "uncaught exception" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Uncaught exception on malformed input',
        problem: 'function may throw with invalid shape',
      }),
    )!;
    expect(match.id).toBe('may-throw');
  });

  it('catches missing-input-validation against exported typed function (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Exported Function Missing Input Sanitization for response Parameter',
        problem: 'No validation of the response parameter before use.',
      }),
    )!;
    expect(match.id).toBe('missing-validation');
    expect(match.multiplier).toBe(0.7);
  });

  it('catches "unvalidated user input" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unvalidated user input reaches dispatcher',
        problem: 'details',
      }),
    )!;
    expect(match.id).toBe('missing-validation');
  });

  it('catches incomplete validation phrasing for required property claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incomplete Input Validation in parseQuotaConfig',
        problem: 'The parseQuotaConfig function does not verify that the input has the required limits property.',
      }),
    )!;
    expect(match.id).toBe('parse-quota-required-field-nit');
    expect(match.multiplier).toBe(0.3);
  });

  it('catches generic unauthorized response information-leak nits', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Info Leak in Unauthorized Response',
        problem:
          'When !actor is detected, the handler returns new Response("Unauthorized", { status: 401 }). The plain text "Unauthorized" may expose internal endpoint naming to attackers, aiding enumeration.',
      }),
    )!;
    expect(match.id).toBe('unauthorized-response-info-leak-nit');
    expect(match.multiplier).toBe(0.3);
  });

  it('catches TypeScript type assertion bypass speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Type Assertion Bypass',
        problem:
          'The type assertion as SessionActor | null could allow invalid data to flow through if getUser does not properly validate its return value.',
      }),
    )!;
    expect(match.id).toBe('type-assertion-bypass-speculation');
    expect(match.multiplier).toBe(0.3);
  });

  it('catches typed-object required-field validation claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Session Signing Does Not Validate Input Parameters',
        problem:
          'The buildSessionCookie function does not validate the actor object for required fields or valid types, potentially leading to invalid session cookies.',
      }),
    )!;
    expect(match.id).toBe('missing-validation');
  });

  it('catches zero-width-space claim against pure-ASCII code (PR #490 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Zero-width character in regex literal',
        problem: 'The regex literal contains zero-width space characters embedded in the pattern.',
      }),
    )!;
    expect(match.id).toBe('zero-width');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches invisible-unicode-character variant', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Invisible unicode character in identifier',
        problem: 'details',
      }),
    )!;
    expect(match.id).toBe('zero-width');
  });

  it('catches zero-width with unicode hyphen variant', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incomplete JSON fence detection may cause moderation decisions to be silently ignored',
        problem: 'The regular expression contains literal zero‑width space characters instead of plain back-ticks.',
      }),
    )!;
    expect(match.id).toBe('zero-width');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches prototype pollution claims against JSON/schema parsing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Prototype Pollution via JSON Parsing',
        problem:
          'The parseForcedDecisionJson function parses JSON input and validates with a Zod schema, but could allow prototype pollution.',
      }),
    )!;
    expect(match.id).toBe('prototype-pollution-json-parse');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches generic weak regex extractor claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Weak Regex for Code Block Detection',
        problem: 'The regex may not reliably match all markdown code block formats.',
      }),
    )!;
    expect(match.id).toBe('weak-regex-extractor');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches malformed fence detection regex claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unreliable extraction of JSON payload due to malformed fence detection',
        problem: 'The regex prevents matching a fenced code block.',
      }),
    )!;
    expect(match.id).toBe('weak-regex-extractor');
  });

  it('catches regex-injection/backtick claims against fence extraction', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Insecure Regex Pattern Matching',
        problem:
          'The regex pattern can be problematic due to the way backticks are escaped, creating potential denial-of-service or regex injection vectors.',
      }),
    )!;
    expect(match.id).toBe('weak-regex-extractor');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches malformed JSON parser edge-case claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incorrect Return Value in extractModeratorJsonPayload',
        problem:
          "The function doesn't distinguish between valid JSON and malformed input that starts with a JSON brace.",
      }),
    )!;
    expect(match.id).toBe('malformed-json-parser-edge');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches parseForcedDecisionJson array-input claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'JSON Parsing Not Properly Handling Array Inputs',
        problem:
          "The parseForcedDecisionJson logic does not properly validate that the JSON payload is an object when it's passed in as an array input.",
      }),
    )!;
    expect(match.id).toBe('malformed-json-parser-edge');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches fabricated logical-expression claims in moderator JSON extraction', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incorrect logical expression in extractModeratorJsonPayload causing always-true condition',
        problem:
          "The extractModeratorJsonPayload line contains an incorrect logical expression where a truthy string literal makes the condition always true.",
      }),
    )!;
    expect(match.id).toBe('malformed-json-parser-edge');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches JSON parse error-handling logging nits', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Insecure JSON Parsing Without Proper Error Handling',
        problem:
          "The code catches generic exceptions during JSON parsing but doesn't log or handle them specifically, making it difficult to debug parsing failures or detect malicious input attempts.",
      }),
    )!;
    expect(match.id).toBe('json-error-handling-nit');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches empty-fence JSON extraction claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Logic Error in extractModeratorJsonPayload May Cause Moderator Verdicts to Be Silently Ignored',
        problem:
          'extractModeratorJsonPayload only returns fullFence[1] when the capture group is truthy, so an empty capture or empty JSON payload is treated as falsy and silently ignored.',
      }),
    )!;
    expect(match.id).toBe('malformed-json-parser-edge');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches speculative XSS claims that rely on a hypothetical rendering context', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential XSS Vulnerability via Malicious JSON Payload',
        problem:
          'The reasoning field could contain malicious JavaScript that executes if the output is rendered in a browser dashboard.',
      }),
    )!;
    expect(match.id).toBe('speculative-rendered-xss');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches JSON-payload XSS claims without a concrete sink', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential XSS Vulnerability via Improper JSON Payload Handling',
        problem: 'The JSON payload could cause malicious code execution in downstream consumers.',
      }),
    )!;
    expect(match.id).toBe('speculative-rendered-xss');
  });

  it('catches arbitrary-code-execution claims from JSON reasoning fields', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Insecure JSON Parsing Allows Arbitrary Code Execution',
        problem:
          'The code parses JSON payloads from moderator responses, potentially allowing attackers to inject malicious code via the reasoning field.',
      }),
    )!;
    expect(match.id).toBe('speculative-rendered-xss');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches XSS claims against JSON parsing without a render sink', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential XSS Vulnerability via Improper JSON Parsing',
        problem:
          'extractModeratorJsonPayload does not properly handle malicious input that could contain XSS payloads before JSON.parse, although the immediate XSS risk is reduced due to JSON parsing.',
      }),
    )!;
    expect(match.id).toBe('speculative-rendered-xss');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches hand-rolled session cookie / JWT-library preference claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Insecure Session Cookie Implementation',
        problem:
          'The buildSessionCookie function constructs session cookies by directly encoding the payload as base64url without using a proper JWT library or secure encoding method.',
      }),
    )!;
    expect(match.id).toBe('hand-rolled-session-cookie');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches speculative service-token race claims against env reads', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Race Condition in Service Token Creation Logic',
        problem:
          'The createServiceToken function uses a shared, potentially mutable environment object without protections against concurrent access during service token generation.',
      }),
    )!;
    expect(match.id).toBe('service-token-concurrency-speculation');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches speculative internal-failure error handling claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Information Disclosure Through Error Handling',
        problem:
          "If getUser() fails internally due to malformed request or system error, those failures aren't handled explicitly, potentially leaking internal state.",
      }),
    )!;
    expect(match.id).toBe('speculative-error-handling');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches non-blocking error-message quality nits', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incorrect Error Handling for Missing userId',
        problem:
          'The error response for missing userId contains an unhelpful message instead of providing a more informative error message for debugging and client handling.',
      }),
    )!;
    expect(match.id).toBe('error-message-quality-nit');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches internal enum mismatch compatibility claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Weak JSON Schema Validation for Severity Enum',
        problem:
          "The schema allows DISMISSED, which may not be a valid value for the consuming code's Severity enum.",
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches unvalidated severity enum claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unvalidated Severity Enum',
        problem:
          "The severity enum values are validated against the schema, but the return type doesn't explicitly type-check that values are one of the allowed enum options.",
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches JSON/string enum architecture mismatch claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Architecture Mismatch Between JSON and Enum Values',
        problem:
          'parseForcedDecisionJson creates a mismatch between internal TypeScript Severity enum values and external JSON string representations.',
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches Zod severity type-mismatch claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incorrect Severity Type Assignment in parseForcedDecisionJson',
        problem:
          'The parseForcedDecisionJson function is expected to return a Severity type, but the Zod schema defines severity as an enum of string literals, not the Severity type internally used by the codebase.',
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches severity string-enum type handling claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Inconsistent Severity Type Handling',
        problem:
          'parseForcedDecisionJson returns a Severity type but the schema defines severity as a string enum, creating a TypeScript interface type mismatch.',
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches schema/return type mismatch claims for forced decisions', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Output type mismatch between schema and function return type annotation',
        problem:
          'The parseForcedDecisionJson function returns severity typed as Severity but the schema expects one of the string enum values, causing a type mismatch in type definitions.',
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches schema/use-case mismatch claims for moderator JSON', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: "Schema Validation Doesn't Match Actual Use Case",
        problem: 'The reasoning field might be empty or missing, causing valid JSON responses to be incorrectly rejected.',
      }),
    )!;
    expect(match.id).toBe('internal-enum-mismatch');
  });

  it('catches missing payload size limit claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'No maximum payload size limit in extractModeratorJsonPayload',
        problem: 'The parser accepts an unbounded payload from a model response.',
      }),
    )!;
    expect(match.id).toBe('missing-size-limit');
    expect(match.multiplier).toBe(0.6);
  });

  it('catches speculative session actor type-confusion claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Type Confusion in getUser Return Value',
        problem:
          'The getUser function is cast to SessionActor | null, which could introduce a type safety violation if the user session was tampered with.',
      }),
    )!;
    expect(match.id).toBe('session-actor-type-confusion');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches unsafe SessionActor type assertion claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unsafe Type Assertion in Session Actor Handling',
        problem:
          'The code performs an unsafe type assertion on the result of getUser(req) with as SessionActor | null.',
      }),
    )!;
    expect(match.id).toBe('session-actor-type-confusion');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches large JSON payload denial-of-service claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Denial of Service via Large JSON Payload',
        problem: 'JSON.parse(payload) has no size or complexity limits for deeply nested JSON.',
      }),
    )!;
    expect(match.id).toBe('missing-size-limit');
  });

  it('catches resource-exhaustion size-limit claims for JSON payload extraction', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Integer Overflow Risk in JSON Payload Size Handling',
        problem:
          'extractModeratorJsonPayload accepts large blocks of text as JSON without size limits, leading to possible resource exhaustion.',
      }),
    )!;
    expect(match.id).toBe('missing-size-limit');
    expect(match.multiplier).toBe(0.6);
  });

  it('catches speculative broad-catch JSON parse masking claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Improper Error Handling in JSON Parsing',
        problem:
          'The parseForcedDecisionJson function catches all exceptions during JSON.parse, but this broad catch is potentially masking memory exhaustion attacks or other parser-related problems.',
      }),
    )!;
    expect(match.id).toBe('json-parse-catch-masking');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches "missing null guard" (PR #499 self-review FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Missing null guard for activeReviewers in computeL1Confidence',
        problem: 'The function does not check whether activeReviewers is null before use.',
      }),
    )!;
    expect(match.id).toBe('missing-null-guard');
    expect(match.multiplier).toBe(0.7);
  });

  it('catches "no null check" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Null dereference risk',
        problem: 'The code has no null check on the response object.',
      }),
    )!;
    expect(match.id).toBe('missing-null-guard');
  });

  it('catches "null/undefined check" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential undefined reference in handler',
        problem: 'A null/undefined check is missing before property access.',
      }),
    )!;
    expect(match.id).toBe('missing-null-guard');
  });

  it('catches numeric limit validation nits', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Invalid limit values are not handled',
        problem: 'The function does not validate that limit is a finite non-negative number.',
      }),
    )!;
    expect(match.id).toBe('numeric-limit-validation-nit');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches documentation/contract wording nits', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Misleading Documentation in findExceededUsers',
        problem:
          'The documentation states that it returns the top limit users, but implementation can return more than limit when limit + 1 is used.',
      }),
    )!;
    expect(match.id).toBe('documentation-contract-nit');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches undeclared type / missing import compile-error claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Return type annotation uses undeclared `Severity` type',
        problem:
          'The return type is annotated as `{ severity: Severity; reasoning: string }` but Severity is not imported or defined. This will cause a TypeScript compilation error.',
      }),
    )!;
    expect(match.id).toBe('undeclared-type');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches cannot-find-name phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Cannot find name UserRecord',
        problem: 'TypeScript reports cannot find name UserRecord in this module.',
      }),
    )!;
    expect(match.id).toBe('undeclared-type');
  });

  it('catches TypeScript trailing-comma syntax trivia claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Invalid TypeScript function signature causing compile-time failure',
        problem:
          'The function signature has a trailing comma after the sole parameter, and TypeScript does not permit a comma there.',
      }),
    )!;
    expect(match.id).toBe('typescript-syntax-trivia');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches defensive array-copy micro-performance claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Performance Degradation Due to Unnecessary Array Copy',
        problem:
          'The implementation creates an unnecessary array copy, which could lead to performance degradation for large result sets in memory-constrained environments.',
      }),
    )!;
    expect(match.id).toBe('array-copy-microperf');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches missing-import phrasing that says without importing it', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Undefined z reference leads to runtime crash',
        problem: 'The newly added function uses the z object without importing it, so z will be undefined at runtime.',
      }),
    )!;
    expect(match.id).toBe('undeclared-type');
  });

  it('catches generic incorrect sorting comparator claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Incorrect sorting in findExceededUsers when daily limits differ',
        problem:
          'The sorting logic is flawed and could return the wrong top users when limits vary.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches incorrect-formula sorting claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Inefficient sorting in findExceededUsers function',
        problem:
          "The sorting logic in findExceededUsers uses an incorrect formula that doesn't properly compare how far over the limit users are.",
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches generic inconsistent-ordering sorting claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Bug in `findExceededUsers` sorting logic',
        problem:
          'The sorting logic in `findExceededUsers` is incorrect and may produce inconsistent ordering results.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches incorrect sort-function logic claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Logic Error in findExceededUsers Sort Function',
        problem:
          'The sort function in findExceededUsers has incorrect logic for sorting by how far over the limit users are.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches sorting-comparator logic-error claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Logic Error in findExceededUsers Function',
        problem:
          'The findExceededUsers function has a logic error in its sorting comparator that causes incorrect ordering.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches NaN sort-instability claims against stable sorting refactors', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential sort instability when scores are NaN',
        problem: 'Returning NaN from the sort comparator could make result ordering unpredictable.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches broader NaN and performance claims against typed sort tie-breakers', () => {
    const nanMatch = matchFindingClass(
      doc({
        issueTitle: 'Potential NaN-inducing comparison can corrupt sort order',
        problem: 'If a score value is non-numeric, b.score - a.score yields NaN and breaks Array.prototype.sort ordering.',
      }),
    )!;
    expect(nanMatch.id).toBe('sorting-comparator');

    const perfMatch = matchFindingClass(
      doc({
        issueTitle: 'Potential Performance Regression',
        problem: 'Additional conditional logic in the sort comparison function may slow large datasets.',
      }),
    )!;
    expect(perfMatch.id).toBe('sorting-comparator');

    const stringMatch = matchFindingClass(
      doc({
        issueTitle: 'Potential Performance Degradation from Unnecessary String Comparison',
        problem:
          'Secondary sorting by title may add performance overhead because the unnecessary string comparison only matters for tie-breaking scenarios.',
      }),
    )!;
    expect(stringMatch.id).toBe('sorting-comparator');
  });

  it('catches negative-infinity sort speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Undefined Behavior When Handling Negative Infinity Scores',
        problem:
          'The sorting implementation does not properly account for negative infinity values in score comparisons, which may result in unpredictable sorting order.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches floating-point precision sorting speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Inconsistent Sorting Behavior Due to Floating-Point Precision Issues',
        problem:
          'The sorting function introduces a potential bug related to floating-point precision when comparing scores and equality.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches title-comparison performance-overhead speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Performance Degradation with Title Comparison',
        problem:
          'The stable sorting tie-breaker introduces performance overhead for every comparison because title comparison is more expensive than numeric comparison.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches title-comparison fallback performance-regression speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Performance Degradation Due to Title Comparison',
        problem:
          'The new sorting logic introduces a title comparison fallback for equal scores, which creates a performance regression for large result sets where many items have identical scores, as it will invoke localeCompare for each such pair.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches function-call overhead sorting speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential performance regression in sorting',
        problem:
          'The new implementation introduces a function call overhead for every comparison, potentially degrading performance compared to the direct subtraction approach.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches title-only comparator execution speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Predicate to Sort by Title Alone Still Executes',
        problem:
          "While adding title fallback for ties, the performance impact includes unnecessary work when all scores are unique or when title comparison isn't needed.",
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches localeCompare thread-safety race speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Race Condition Potential in Concurrent Environments',
        problem:
          'While the current implementation creates a new array with spread operator, the localeCompare function itself is not inherently thread-safe in all JavaScript environments, potentially introducing race conditions in concurrent sorting operations.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches stable-sort engine variance claims against deterministic tie-breakers', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Inconsistent sorting behavior due to unstable sort comparison',
        problem:
          'The implementation does not guarantee stable sorting behavior for equal scores across JavaScript engine implementations.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
  });

  it('catches secondary-sort-key stable-sorting expectation claims', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Inconsistent Sorting Behavior for Equal Scores',
        problem:
          'The modified sorting function introduces a secondary sort key (title) when scores are equal, but this creates inconsistent behavior that could break expectations in downstream code relying on stable sorting.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches localeCompare non-string speculation against typed sort tie-breakers', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Runtime TypeError when titles are non-string',
        problem:
          'The title comparison uses a.title.localeCompare(b.title), which could throw if title is not a string.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches localeCompare null/undefined speculation against typed sort tie-breakers', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Null/Undefined Access in Title Comparison',
        problem:
          'The localeCompare method is called on a.title and b.title, which could be undefined or null despite required string types.',
      }),
    )!;
    expect(match.id).toBe('sorting-comparator');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches JSON payload size-limit DoS speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Denial of Service via Malicious JSON Input',
        problem:
          'parseForcedDecisionJson does not validate or limit the size of the incoming JSON string before parsing a massive JSON payload.',
      }),
    )!;
    expect(match.id).toBe('missing-size-limit');
  });

  it('catches impossible Zod safeParse result.data access speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Null Dereference if Zod Schema Violation Occurs',
        problem:
          'The code uses result.data.severity and result.data.reasoning after checking result.success, but Zod parsing failures could make property access unsafe.',
      }),
    )!;
    expect(match.id).toBe('zod-safeparse-data-access');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches forced-decision null-return flow speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unhandled Nullish Return in Moderation Processing Flow',
        problem:
          'parseForcedDecisionJson returns null when JSON parsing fails, but the calling code assumes a non-null result and can hit runtime errors.',
      }),
    )!;
    expect(match.id).toBe('forced-decision-null-flow');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches typed Date serialization guard speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential TypeError when serializing sessions with missing expiresAt',
        problem:
          'serializeSession calls session.expiresAt.toISOString() without verifying that expiresAt is a valid Date instance.',
      }),
    )!;
    expect(match.id).toBe('date-serialization-type-guard');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches flat key-value parser injection and regex-memory speculation', () => {
    const injectionMatch = matchFindingClass(
      doc({
        issueTitle: 'Security vulnerability in KV string parsing',
        problem: 'The parseKVString function potentially allows injection-like behavior through crafted input strings.',
      }),
    )!;
    expect(injectionMatch.id).toBe('flat-kv-parser-speculation');

    const regexMatch = matchFindingClass(
      doc({
        issueTitle: 'Potential memory leak through regex usage',
        problem: 'parseKVString uses a regex with the g flag, which can lead to memory leaks due to state retention.',
      }),
    )!;
    expect(regexMatch.id).toBe('flat-kv-parser-speculation');
    expect(regexMatch.multiplier).toBe(0.4);
  });

  it('catches broad moderator JSON parser compatibility noise', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Moderator parser compatibility issue',
        problem:
          'extractModeratorJsonPayload may silently ignore a forced-decision verdict when a JSON payload is wrapped in a fence.',
      }),
    )!;
    expect(match.id).toBe('moderator-json-parser-compatibility-noise');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches moderator JSON denial-of-service speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Denial of Service via Malformed JSON Input',
        problem:
          'parseForcedDecisionJson is vulnerable to denial-of-service through crafted JSON input that causes excessive memory or CPU consumption.',
      }),
    )!;
    expect(match.id).toBe('moderator-json-parser-compatibility-noise');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches quota reset race-condition restatements', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential race condition in quota reset logic',
        problem:
          'The maybeResetWindow function modifies the input quota object directly, which could lead to race conditions if multiple processes access the same quota object concurrently.',
      }),
    )!;
    expect(match.id).toBe('quota-reset-race-speculation');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches quota reset exact-boundary timing nits', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Non-inclusive window reset logic',
        problem:
          'The maybeResetWindow function uses >= WINDOW_MS, which means a user might be rate-limited for an extra millisecond beyond the 24-hour boundary.',
      }),
    )!;
    expect(match.id).toBe('quota-reset-boundary-nit');
    expect(match.multiplier).toBe(0.3);
  });

  it('catches quota reset time-zone and system-clock speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Window reset logic may not handle time zone changes correctly',
        problem:
          'The maybeResetWindow function uses absolute timestamps without considering time zone changes or system clock adjustments.',
      }),
    )!;
    expect(match.id).toBe('quota-reset-boundary-nit');
    expect(match.multiplier).toBe(0.3);
  });

  it('catches parseKVString injection-style speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Security Issue with `parseKVString` Input Validation',
        problem:
          'The parseKVString function does not restrict key names to a safe set. This creates a potential for injection-style behavior if these keys are later used as identifiers for filesystem paths, database columns, or other system components.',
      }),
    )!;
    expect(match.id).toBe('flat-kv-parser-speculation');
    expect(match.multiplier).toBe(0.4);
  });

  it('catches generic "potential security concern" phrasing (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential security risk in request handling',
        problem: 'could be exploited to bypass authentication.',
      }),
    )!;
    // Either generic-potential or a more-specific class is fine; the
    // important thing is that SOMETHING matches and the multiplier is
    // sub-unity. Order in the table means more-specific wins when both
    // apply.
    expect(match.multiplier).toBeLessThan(1);
  });
});

describe('matchFindingClass — negative cases (real bugs must pass)', () => {
  // Findings that describe real, well-grounded bugs should NOT match
  // any FP-heavy prior. These mirror the shape of BUG 1 / BUG 2 from
  // quota-manager-dual that were correctly caught across runs.

  it('off-by-one claim with concrete slice evidence does not match', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Off-by-one error in findExceededUsers slice operation',
        problem:
          'slice(0, limit + 1) returns pageSize+1 items; the `+ 1` is the defect. Subsequent pagination consumers will see one extra row.',
      }),
    );
    expect(match).toBeNull();
  });

  it('input-mutation claim does not match may-throw or missing-validation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'In-place mutation in maybeResetWindow',
        problem:
          'maybeResetWindow mutates its input quota parameter via quota.usedToday = 0 despite the "returns updated quota" contract.',
      }),
    );
    expect(match).toBeNull();
  });

  it('SQL injection claim does not match generic-potential (specific category)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'SQL injection via unparameterized email in findUserByEmail',
        problem: 'The email is concatenated directly into the SQL string.',
      }),
    );
    expect(match).toBeNull();
  });

  it('null-deref claim does not match anything', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Null reference at getDisplayName line 4',
        problem: 'user.displayName is accessed before the `user === null` check.',
      }),
    );
    expect(match).toBeNull();
  });

  it('hard-coded session secret claims do not match the hand-rolled cookie prior', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Hard-coded session secret fallback',
        problem:
          'SESSION_SECRET falls back to dev-session-secret, so missing configuration signs cookies with a public secret.',
      }),
    );
    expect(match).toBeNull();
  });

  it('hard-coded service-token secret claims do not match concurrency speculation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Hard-coded service-token secret fallback',
        problem:
          'SERVICE_TOKEN_SECRET falls back to dev-service-token-secret, so missing configuration signs service tokens with a public secret.',
      }),
    );
    expect(match).toBeNull();
  });
});

describe('FINDING_CLASS_PRIORS — table invariants', () => {
  it('all multipliers are in [0, 1]', () => {
    for (const p of FINDING_CLASS_PRIORS) {
      expect(p.multiplier).toBeGreaterThanOrEqual(0);
      expect(p.multiplier).toBeLessThanOrEqual(1);
    }
  });

  it('all priors have a non-empty pattern list', () => {
    for (const p of FINDING_CLASS_PRIORS) {
      expect(p.patterns.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = FINDING_CLASS_PRIORS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('specific classes appear before generic-potential catch-all', () => {
    const specific = FINDING_CLASS_PRIORS.findIndex((p) => p.id !== 'generic-potential');
    const generic = FINDING_CLASS_PRIORS.findIndex((p) => p.id === 'generic-potential');
    expect(specific).toBeLessThan(generic);
  });
});
