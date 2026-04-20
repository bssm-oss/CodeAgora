import { describe, it, expect } from 'vitest';
import { truncateLines } from '../utils/truncate.js';

describe('truncateLines', () => {
  it('returns original text when within limit', () => {
    expect(truncateLines('a\nb\nc', 5)).toBe('a\nb\nc');
  });

  it('returns original when line count exactly matches maxLines', () => {
    expect(truncateLines('a\nb\nc', 3)).toBe('a\nb\nc');
  });

  it('returns empty string for non-positive maxLines', () => {
    expect(truncateLines('hello', 0)).toBe('');
    expect(truncateLines('hello', -1)).toBe('');
  });

  it('appends "more lines" indicator when truncated', () => {
    const result = truncateLines('a\nb\nc\nd\ne\nf\ng', 3);
    expect(result).toContain('more lines');
  });

  it('preserves content from the start of the input', () => {
    const result = truncateLines('first\nsecond\nthird\nfourth\nfifth', 2);
    expect(result.startsWith('first')).toBe(true);
  });

  it('handles single-line input within the limit', () => {
    expect(truncateLines('only one line', 10)).toBe('only one line');
  });
});
