/**
 * Pattern Collector
 * Collects dismissed review patterns from a GitHub PR's review comments.
 */

import { Octokit } from '@octokit/rest';
import type { DismissedPattern } from './store.js';

const CODEAGORA_MARKER = '<!-- codeagora-v3 -->';

const SEVERITY_PATTERN = /\*\*(HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION)\*\*/;
const TITLE_PATTERN = /\*\*\s*(?:HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION)\s*\*\*\s*[—–-]\s*(.+)/;

/**
 * Collect dismissed patterns from a GitHub PR's review comments.
 * Looks for resolved/dismissed CodeAgora comments (with codeagora-v3 marker).
 */
export async function collectDismissedPatterns(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<DismissedPattern[]> {
  const octokit = new Octokit({ auth: token });

  const { data: comments } = await octokit.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const today = new Date().toISOString().split('T')[0];
  const patternMap = new Map<string, DismissedPattern>();

  for (const comment of comments) {
    // Only process resolved/outdated CodeAgora comments
    if (!comment.body?.includes(CODEAGORA_MARKER)) continue;
    if (comment.position !== null && comment.position !== undefined) {
      // Not dismissed — still active
    }

    const severityMatch = comment.body.match(SEVERITY_PATTERN);
    const titleMatch = comment.body.match(TITLE_PATTERN);

    if (!severityMatch || !titleMatch) continue;

    const severity = severityMatch[1] as 'HARSHLY_CRITICAL' | 'CRITICAL' | 'WARNING' | 'SUGGESTION';
    const pattern = titleMatch[1].trim();

    const existing = patternMap.get(pattern);
    if (existing) {
      existing.dismissCount += 1;
      existing.lastDismissed = today;
    } else {
      patternMap.set(pattern, {
        pattern,
        severity,
        dismissCount: 1,
        lastDismissed: today,
        action: severity === 'SUGGESTION' ? 'suppress' : 'downgrade',
      });
    }
  }

  return Array.from(patternMap.values());
}
