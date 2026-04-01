/**
 * L2 Adversarial Supporter Prompt tests
 *
 * Validates that the supporter prompt in executeSupporterResponse
 * uses adversarial verification language instead of agreement-seeking.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const moderatorSource = readFileSync(
  resolve(__dirname, '../l2/moderator.ts'),
  'utf-8',
);

describe('Adversarial Supporter Prompt', () => {
  it('uses "verify" instead of "evaluate" in the supporter prompt', () => {
    // The prompt should frame the task as verification, not evaluation
    expect(moderatorSource).toContain('Verify This Claim');
    expect(moderatorSource).toContain('verify');
  });

  it('instructs supporters to attempt disproval first', () => {
    expect(moderatorSource).toContain('disprove');
    expect(moderatorSource).toContain(
      'Try to find evidence that the claim is WRONG',
    );
  });

  it('requires specific evidence for BOTH agree and disagree', () => {
    expect(moderatorSource).toContain(
      'BOTH agree and disagree require specific evidence',
    );
  });

  it('includes AGREE reasoning requirements', () => {
    expect(moderatorSource).toContain(
      'Why is the claim impossible to disprove?',
    );
    expect(moderatorSource).toContain(
      'What specific code proves the issue exists?',
    );
  });

  it('includes DISAGREE reasoning requirements', () => {
    expect(moderatorSource).toContain(
      'What specific evidence disproves the claim?',
    );
    expect(moderatorSource).toContain(
      'Does the surrounding context already handle the concern?',
    );
  });

  it('does not contain the old agreement-seeking language', () => {
    // The old prompt said "Do NOT conform simply because..."
    // which still implied the default was to conform
    expect(moderatorSource).not.toContain(
      'Do NOT conform simply because other reviewers agree',
    );
    expect(moderatorSource).not.toContain('Provide your verdict');
  });

  it('warns against both conformity and contrarianism', () => {
    expect(moderatorSource).toContain(
      'Do NOT agree just because a reviewer said it',
    );
    expect(moderatorSource).toContain(
      'Do NOT disagree just to be contrarian',
    );
  });
});
