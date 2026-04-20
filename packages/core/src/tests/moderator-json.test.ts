/**
 * L2 Moderator — JSON output mode (#465)
 *
 * Covers parseForcedDecisionJson and parseForcedDecision dispatch /
 * fallback behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  parseForcedDecision,
  parseForcedDecisionJson,
} from '../l2/moderator.js';

const VALID: string = JSON.stringify({
  severity: 'CRITICAL',
  reasoning: 'The unchecked input allows SQL injection via parameter concatenation.',
});

describe('parseForcedDecisionJson', () => {
  it('parses a well-formed moderator verdict', () => {
    const result = parseForcedDecisionJson(VALID)!;
    expect(result.severity).toBe('CRITICAL');
    expect(result.reasoning).toMatch(/SQL injection/);
  });

  it('accepts all SEVERITY enum values including DISMISSED', () => {
    for (const s of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION', 'DISMISSED']) {
      const r = parseForcedDecisionJson(
        JSON.stringify({ severity: s, reasoning: 'rationale text' }),
      )!;
      expect(r.severity).toBe(s);
    }
  });

  it('unwraps ```json ... ``` fence', () => {
    const fenced = '```json\n' + VALID + '\n```';
    const result = parseForcedDecisionJson(fenced)!;
    expect(result.severity).toBe('CRITICAL');
  });

  it('unwraps plain ``` fence (no language tag)', () => {
    const fenced = '```\n' + VALID + '\n```';
    const result = parseForcedDecisionJson(fenced)!;
    expect(result.severity).toBe('CRITICAL');
  });

  it('returns null when severity enum value is invalid', () => {
    expect(parseForcedDecisionJson(
      JSON.stringify({ severity: 'NOT_A_SEVERITY', reasoning: 'x' }),
    )).toBeNull();
  });

  it('returns null when reasoning is missing / empty', () => {
    expect(parseForcedDecisionJson(
      JSON.stringify({ severity: 'CRITICAL', reasoning: '' }),
    )).toBeNull();
    expect(parseForcedDecisionJson(
      JSON.stringify({ severity: 'CRITICAL' }),
    )).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseForcedDecisionJson('{severity:')).toBeNull();
    expect(parseForcedDecisionJson('not json')).toBeNull();
  });

  it('returns null for markdown-shaped response (not JSON)', () => {
    expect(parseForcedDecisionJson('Severity: CRITICAL\nThe diff contains...')).toBeNull();
  });

  it('does not pick up embedded code fences inside prose', () => {
    const prose = `The moderator observed the following.

\`\`\`json
{"severity": "CRITICAL", "reasoning": "should not hit"}
\`\`\`

Severity: WARNING
`;
    // Response starts with prose, not JSON → strict matcher bails out
    expect(parseForcedDecisionJson(prose)).toBeNull();
  });
});

describe('parseForcedDecision — dispatch + fallback', () => {
  it('uses JSON path when response is valid JSON', () => {
    const result = parseForcedDecision(VALID);
    expect(result.severity).toBe('CRITICAL');
    expect(result.reasoning).toMatch(/SQL injection/);
  });

  it('falls back to regex parser for markdown "Severity: X" response', () => {
    const md = 'Severity: HARSHLY_CRITICAL\nReasoning: Data loss potential.';
    const result = parseForcedDecision(md);
    expect(result.severity).toBe('HARSHLY_CRITICAL');
  });

  it('falls back to keyword-scan for free-form prose', () => {
    const prose = 'After reviewing all rounds, this finding is a WARNING due to low exploitability.';
    const result = parseForcedDecision(prose);
    expect(result.severity).toBe('WARNING');
  });

  it('defaults to WARNING when no pattern matches', () => {
    const result = parseForcedDecision('I have no opinion.');
    expect(result.severity).toBe('WARNING');
  });

  it('respects JSON severity over markdown-style text when both are present', () => {
    // If response starts with JSON, that wins — downstream regex doesn't run
    const mixed = JSON.stringify({ severity: 'SUGGESTION', reasoning: 'Minor concern' });
    const result = parseForcedDecision(mixed);
    expect(result.severity).toBe('SUGGESTION');
  });
});
