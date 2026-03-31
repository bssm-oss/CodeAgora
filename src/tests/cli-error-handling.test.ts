/**
 * CLI Error Handling Tests — formatError hint matching
 */

import { describe, it, expect } from 'vitest';
import { formatError } from '@codeagora/cli/utils/errors.js';

// ============================================================================
// formatError — hint matching (replaces classifyError tests)
// ============================================================================

describe('formatError() hint matching', () => {
  it('shows config hint for Config file not found', () => {
    const output = formatError(new Error('Config file not found at .ca/config.json'), false);
    expect(output).toContain('Hint:');
    expect(output).toContain('agora init');
  });

  it('shows config hint for config.json reference', () => {
    const output = formatError(new Error('Failed to read config.json'), false);
    expect(output).toContain('Hint:');
  });

  it('shows API key hint for API key issues', () => {
    const output = formatError(new Error('Invalid API key provided'), false);
    expect(output).toContain('Hint:');
    expect(output).toContain('agora providers');
  });

  it('shows API key hint for API_KEY env var issues', () => {
    const output = formatError(new Error('OPENAI_API_KEY is not set'), false);
    expect(output).toContain('Hint:');
  });

  it('shows doctor hint for reviewer forfeited error', () => {
    const output = formatError(new Error('Reviewer forfeited after timeout'), false);
    expect(output).toContain('Hint:');
    expect(output).toContain('agora doctor');
  });

  it('shows doctor hint for Too many reviewers error', () => {
    const output = formatError(new Error('Too many reviewers failed'), false);
    expect(output).toContain('Hint:');
  });

  it('shows path hint for ENOENT file not found', () => {
    const output = formatError(new Error('ENOENT: no such file or directory'), false);
    expect(output).toContain('Hint:');
    expect(output).toContain('file path');
  });

  it('shows path hint for "not found" message', () => {
    const output = formatError(new Error('Diff file not found: /tmp/test.patch'), false);
    expect(output).toContain('Hint:');
  });

  it('shows syntax hint for JSON parse error', () => {
    const output = formatError(new Error('Unexpected token in JSON'), false);
    expect(output).toContain('Hint:');
    expect(output).toContain('config file syntax');
  });

  it('shows syntax hint for YAML parse error', () => {
    const output = formatError(new Error('YAML parse error at line 5'), false);
    expect(output).toContain('Hint:');
  });

  it('shows no hint for unknown errors', () => {
    const output = formatError(new Error('Something unexpected happened'), false);
    expect(output).not.toContain('Hint:');
  });
});

// ============================================================================
// formatError — output formatting
// ============================================================================

describe('formatError()', () => {
  it('includes "Error:" prefix in output', () => {
    const output = formatError(new Error('Something went wrong'), false);
    expect(output).toContain('Error: Something went wrong');
  });

  it('includes hint when error matches a known pattern', () => {
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
