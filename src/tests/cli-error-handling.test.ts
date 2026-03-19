/**
 * CLI Error Handling Tests — classifyError + formatError
 */

import { describe, it, expect } from 'vitest';
import { classifyError, formatError } from '@codeagora/cli/utils/errors.js';

// ============================================================================
// classifyError
// ============================================================================

describe('classifyError()', () => {
  it('returns exitCode 2 for Config file not found error', () => {
    const result = classifyError(new Error('Config file not found at .ca/config.json'));
    expect(result.exitCode).toBe(2);
    expect(result.hint).toContain('agora init');
  });

  it('returns exitCode 2 for config.json reference', () => {
    const result = classifyError(new Error('Failed to read config.json'));
    expect(result.exitCode).toBe(2);
  });

  it('returns exitCode 2 for API key issues', () => {
    const result = classifyError(new Error('Invalid API key provided'));
    expect(result.exitCode).toBe(2);
    expect(result.hint).toContain('agora providers');
  });

  it('returns exitCode 2 for API_KEY env var issues', () => {
    const result = classifyError(new Error('OPENAI_API_KEY is not set'));
    expect(result.exitCode).toBe(2);
  });

  it('returns exitCode 3 for reviewer forfeited error', () => {
    const result = classifyError(new Error('Reviewer forfeited after timeout'));
    expect(result.exitCode).toBe(3);
    expect(result.hint).toContain('agora doctor');
  });

  it('returns exitCode 3 for Too many reviewers error', () => {
    const result = classifyError(new Error('Too many reviewers failed'));
    expect(result.exitCode).toBe(3);
  });

  it('returns exitCode 3 for ENOENT file not found', () => {
    const result = classifyError(new Error('ENOENT: no such file or directory'));
    expect(result.exitCode).toBe(3);
    expect(result.hint).toContain('file path');
  });

  it('returns exitCode 3 for "not found" message', () => {
    const result = classifyError(new Error('Diff file not found: /tmp/test.patch'));
    expect(result.exitCode).toBe(3);
  });

  it('returns exitCode 2 for JSON parse error', () => {
    const result = classifyError(new Error('Unexpected token in JSON'));
    expect(result.exitCode).toBe(2);
    expect(result.hint).toContain('config file syntax');
  });

  it('returns exitCode 2 for YAML parse error', () => {
    const result = classifyError(new Error('YAML parse error at line 5'));
    expect(result.exitCode).toBe(2);
  });

  it('returns exitCode 3 for unknown errors (default)', () => {
    const result = classifyError(new Error('Something unexpected happened'));
    expect(result.exitCode).toBe(3);
  });

  it('preserves the error message', () => {
    const msg = 'Some specific error message';
    const result = classifyError(new Error(msg));
    expect(result.message).toBe(msg);
  });

  it('returns no hint for unknown errors', () => {
    const result = classifyError(new Error('Unknown problem'));
    expect(result.hint).toBeUndefined();
  });
});

// ============================================================================
// formatError
// ============================================================================

describe('formatError()', () => {
  it('includes "Error:" prefix in output', () => {
    const output = formatError(new Error('Something went wrong'), false);
    expect(output).toContain('Error: Something went wrong');
  });

  it('includes hint when classified error has one', () => {
    const output = formatError(new Error('Config file not found'), false);
    expect(output).toContain('Hint:');
    expect(output).toContain('agora init');
  });

  it('does not include stack trace when verbose is false', () => {
    const err = new Error('test error');
    const output = formatError(err, false);
    expect(output).not.toContain('at ');
  });

  it('includes stack trace when verbose is true', () => {
    const err = new Error('test error');
    const output = formatError(err, true);
    // stack trace will contain "at " from call frames
    expect(output).toContain(err.stack ?? '');
  });

  it('returns a string', () => {
    const output = formatError(new Error('test'), false);
    expect(typeof output).toBe('string');
  });

  it('handles error with no stack gracefully when verbose', () => {
    const err = new Error('no stack');
    delete (err as { stack?: string }).stack;
    const output = formatError(err, true);
    expect(output).toContain('Error: no stack');
  });
});
