/**
 * Tests for parseStance() and parseForcedDecision() structured parsing
 * Issues #96, #110: replace naive keyword counting with structured output parsing
 */

import { describe, it, expect } from 'vitest';
import { parseStance, parseForcedDecision } from '@codeagora/core/l2/moderator.js';

describe('parseStance', () => {
  describe('P1: structured field patterns', () => {
    it('parses "Stance: AGREE"', () => {
      expect(parseStance('Stance: AGREE\nThe evidence is solid.')).toBe('agree');
    });

    it('parses "**Verdict:** disagree"', () => {
      expect(parseStance('**Verdict:** disagree\nThe code is fine.')).toBe('disagree');
    });

    it('parses "Decision: neutral"', () => {
      expect(parseStance('Decision: neutral\nNeed more info.')).toBe('neutral');
    });

    it('parses Korean "판단: 동의"', () => {
      expect(parseStance('판단: 동의\n근거가 타당합니다.')).toBe('agree');
    });

    it('parses Korean "판단: 반대"', () => {
      expect(parseStance('판단: 반대\n근거가 부족합니다.')).toBe('disagree');
    });

    it('parses JSON-like {"stance": "agree"}', () => {
      expect(parseStance('{"stance": "agree", "reasoning": "valid"}')).toBe('agree');
    });
  });

  describe('P2: first-line keyword', () => {
    it('detects AGREE on first line', () => {
      expect(parseStance('AGREE\nI think the issue is valid.')).toBe('agree');
    });

    it('detects DISAGREE on first line (not confused with AGREE substring)', () => {
      expect(parseStance('DISAGREE\nThe code looks correct to me.')).toBe('disagree');
    });

    it('detects NEUTRAL on first line', () => {
      expect(parseStance('NEUTRAL\nI need more information.')).toBe('neutral');
    });
  });

  describe('P3: weighted keyword scan', () => {
    it('heading "agree" outweighs body "disagree"', () => {
      const response = '## I agree with this assessment\nSome might disagree but the evidence is clear.';
      expect(parseStance(response)).toBe('agree');
    });

    it('more disagree keywords wins', () => {
      const response = 'I disagree with the premise.\nI also disagree with the evidence.\nOne might agree on the approach.';
      expect(parseStance(response)).toBe('disagree');
    });

    it('equal counts returns neutral (no first-line keyword)', () => {
      const response = 'Looking at the evidence:\nI agree on point A.\nI disagree on point B.';
      expect(parseStance(response)).toBe('neutral');
    });
  });

  describe('edge cases', () => {
    it('empty response returns neutral', () => {
      expect(parseStance('')).toBe('neutral');
    });

    it('response with no stance keywords returns neutral', () => {
      expect(parseStance('The code has some issues that need attention.')).toBe('neutral');
    });

    it('"I strongly disagree" is not confused by "agree" substring', () => {
      expect(parseStance('I strongly disagree with this finding.')).toBe('disagree');
    });
  });
});

describe('parseForcedDecision', () => {
  describe('P1: structured field patterns', () => {
    it('parses "Severity: CRITICAL"', () => {
      const result = parseForcedDecision('Severity: CRITICAL\nThis is a real issue.');
      expect(result.severity).toBe('CRITICAL');
    });

    it('parses "**Severity:** WARNING"', () => {
      const result = parseForcedDecision('**Severity:** WARNING\nMinor concern.');
      expect(result.severity).toBe('WARNING');
    });

    it('parses "Severity: SUGGESTION"', () => {
      const result = parseForcedDecision('Severity: SUGGESTION\nCould be improved.');
      expect(result.severity).toBe('SUGGESTION');
    });

    it('parses "Severity: DISMISSED"', () => {
      const result = parseForcedDecision('Severity: DISMISSED\nNot a real issue.');
      expect(result.severity).toBe('DISMISSED');
    });

    it('parses "Severity: HARSHLY_CRITICAL"', () => {
      const result = parseForcedDecision('Severity: HARSHLY_CRITICAL\nSecurity vulnerability.');
      expect(result.severity).toBe('HARSHLY_CRITICAL');
    });

    it('parses JSON-like severity', () => {
      const result = parseForcedDecision('{"severity": "WARNING", "reasoning": "minor"}');
      expect(result.severity).toBe('WARNING');
    });
  });

  describe('P2: keyword scan', () => {
    it('detects "critical" in text', () => {
      const result = parseForcedDecision('This is a critical issue that needs attention.');
      expect(result.severity).toBe('CRITICAL');
    });

    it('ignores "not critical"', () => {
      const result = parseForcedDecision('This is not critical, just a minor warning.');
      expect(result.severity).toBe('WARNING');
    });

    it('detects "suggestion" in text', () => {
      const result = parseForcedDecision('This is merely a suggestion for improvement.');
      expect(result.severity).toBe('SUGGESTION');
    });

    it('detects "dismissed" in text', () => {
      const result = parseForcedDecision('The issue should be dismissed as false positive.');
      expect(result.severity).toBe('DISMISSED');
    });

    it('prefers harshly_critical over critical', () => {
      const result = parseForcedDecision('This is a harshly critical security flaw.');
      expect(result.severity).toBe('HARSHLY_CRITICAL');
    });
  });

  describe('edge cases', () => {
    it('defaults to WARNING for unrecognized response', () => {
      const result = parseForcedDecision('The code has some issues.');
      expect(result.severity).toBe('WARNING');
    });

    it('empty response defaults to WARNING', () => {
      const result = parseForcedDecision('');
      expect(result.severity).toBe('WARNING');
    });

    it('preserves full response as reasoning', () => {
      const response = '  Severity: CRITICAL\n  This is a real issue.  ';
      const result = parseForcedDecision(response);
      expect(result.reasoning).toBe(response.trim());
    });
  });
});
