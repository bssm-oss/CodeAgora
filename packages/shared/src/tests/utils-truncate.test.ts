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

  it('keeps exactly `maxLines` lines when truncated', () => {
    // 7 input lines, maxLines=3 → keep 3, indicator shows 4 omitted
    const result = truncateLines('a\nb\nc\nd\ne\nf\ng', 3);
    const keptLines = result.split('\n').slice(0, 3);
    expect(keptLines).toEqual(['a', 'b', 'c']);
    expect(result).toContain('... (4 more lines)');
  });

  it('preserves content from the start of the input', () => {
    const result = truncateLines('first\nsecond\nthird\nfourth\nfifth', 2);
    expect(result.startsWith('first\nsecond\n')).toBe(true);
  });

  it('keeps exactly 1 line when maxLines=1', () => {
    // Edge case flagged by review on the off-by-one version
    const result = truncateLines('a\nb\nc\nd', 1);
    expect(result.split('\n')[0]).toBe('a');
    expect(result).toContain('... (3 more lines)');
  });

  it('handles single-line input within the limit', () => {
    expect(truncateLines('only one line', 10)).toBe('only one line');
  });
});
