/**
 * Text truncation helpers for previews in logs, notifications, and
 * GitHub review bodies where full content is too large.
 */

/**
 * Truncate a multi-line text to at most `maxLines` lines.
 * Appends an indicator showing how many lines were omitted.
 *
 * @param text Input text (lines separated by \n)
 * @param maxLines Maximum lines to keep. Non-positive values return ''.
 * @returns Truncated text, or the original if already within the limit.
 *
 * @example
 *   truncateLines('a\nb\nc\nd\ne', 3)
 *   // => 'a\nb\n... (3 more lines)'
 */
export function truncateLines(text: string, maxLines: number): string {
  if (maxLines <= 0) return '';
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  const kept = lines.slice(0, maxLines);
  const omitted = lines.length - kept.length;
  return `${kept.join('\n')}\n... (${omitted} more lines)`;
}
