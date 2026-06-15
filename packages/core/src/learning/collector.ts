/**
 * Pattern Collector
 * Collects dismissed review patterns from a GitHub PR's review comments.
 */

import { Octokit } from '@octokit/rest';
import type { DismissedPattern } from './store.js';

const CODEAGORA_MARKER = '<!-- codeagora-v3 -->';

const SEVERITY_PATTERN = /\*\*(HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION)\*\*/;
const TITLE_PATTERN = /\*\*\s*(?:HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION)\s*\*\*\s*[—–-]\s*(.+)/;

interface ReviewThreadComment {
  databaseId?: number | null;
  body?: string | null;
}

interface ReviewThreadNode {
  isResolved?: boolean | null;
  isOutdated?: boolean | null;
  comments?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
    } | null;
    nodes?: Array<ReviewThreadComment | null> | null;
  } | null;
}

interface ReviewThreadPage {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        pageInfo?: {
          hasNextPage?: boolean | null;
          endCursor?: string | null;
        } | null;
        nodes?: Array<ReviewThreadNode | null> | null;
      } | null;
    } | null;
  } | null;
}

const REVIEW_THREADS_QUERY = `
  query CodeAgoraReviewThreads($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviewThreads(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            isResolved
            isOutdated
            comments(first: 100) {
              pageInfo {
                hasNextPage
              }
              nodes {
                databaseId
                body
              }
            }
          }
        }
      }
    }
  }
`;

function codeAgoraCommentsForDismissedThread(thread: ReviewThreadNode): ReviewThreadComment[] {
  if (thread.isResolved !== true && thread.isOutdated !== true) {
    return [];
  }

  // If GraphQL did not return the full comment list, do not guess which
  // comment belongs to the dismissed thread signal.
  if (thread.comments?.pageInfo?.hasNextPage === true) {
    return [];
  }

  return (thread.comments?.nodes ?? []).filter((comment): comment is ReviewThreadComment => (
    typeof comment?.body === 'string' && comment.body.includes(CODEAGORA_MARKER)
  ));
}

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

  const today = new Date().toISOString().split('T')[0];
  const patternMap = new Map<string, DismissedPattern>();
  let after: string | null = null;

  do {
    let page: ReviewThreadPage;
    try {
      page = await octokit.graphql<ReviewThreadPage>(REVIEW_THREADS_QUERY, {
        owner,
        repo,
        prNumber,
        after,
      });
    } catch {
      return [];
    }

    const reviewThreads = page.repository?.pullRequest?.reviewThreads;
    if (!reviewThreads) {
      return [];
    }

    for (const thread of reviewThreads.nodes ?? []) {
      if (!thread) continue;
      for (const comment of codeAgoraCommentsForDismissedThread(thread)) {
        const body = comment.body ?? '';
        const severityMatch = body.match(SEVERITY_PATTERN);
        const titleMatch = body.match(TITLE_PATTERN);

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
    }

    after = reviewThreads.pageInfo?.hasNextPage ? reviewThreads.pageInfo.endCursor ?? null : null;
    if (reviewThreads.pageInfo?.hasNextPage === true && !after) {
      return [];
    }
  } while (after);

  return Array.from(patternMap.values());
}
