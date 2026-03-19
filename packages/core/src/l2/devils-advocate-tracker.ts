/**
 * Devil's Advocate Effectiveness Tracking (4.6)
 * Tracks how often devil's advocate flips verdicts, concedes, or identifies false positives.
 */

import type { DiscussionRound, DiscussionVerdict } from '../types/core.js';

export interface DevilsAdvocateStats {
  totalDiscussions: number;
  /** DA initially disagreed but consensus was reached (DA conceded) */
  concessions: number;
  /** DA held disagree stance through all rounds */
  holdOuts: number;
  /** DA disagreed and issue was ultimately DISMISSED */
  correctRejections: number;
  /** DA agreed from the start */
  initialAgreements: number;
  /** Effectiveness: (correctRejections + concessions-that-led-to-lower-severity) / totalDiscussions */
  effectivenessRate: number;
}

/**
 * Analyze devil's advocate behavior across discussions.
 * @param devilsAdvocateId - The supporter ID of the devil's advocate
 */
export function trackDevilsAdvocate(
  devilsAdvocateId: string,
  roundsPerDiscussion: Record<string, DiscussionRound[]>,
  verdicts: DiscussionVerdict[],
): DevilsAdvocateStats {
  let totalDiscussions = 0;
  let concessions = 0;
  let holdOuts = 0;
  let correctRejections = 0;
  let initialAgreements = 0;

  for (const verdict of verdicts) {
    const rounds = roundsPerDiscussion[verdict.discussionId];
    if (!rounds || rounds.length === 0) continue;

    // Find DA's responses
    const daResponses = rounds
      .filter(r => r.round < 100) // Skip synthetic objection rounds
      .map(r => r.supporterResponses.find(s => s.supporterId === devilsAdvocateId))
      .filter(Boolean);

    if (daResponses.length === 0) continue;
    totalDiscussions++;

    const firstStance = daResponses[0]!.stance;
    const lastStance = daResponses[daResponses.length - 1]!.stance;

    if (firstStance === 'agree') {
      initialAgreements++;
    } else if (firstStance === 'disagree') {
      if (lastStance === 'agree') {
        // DA conceded
        concessions++;
      } else {
        // DA held disagree
        holdOuts++;
        if (verdict.finalSeverity === 'DISMISSED') {
          correctRejections++;
        }
      }
    }
  }

  const effectivenessRate = totalDiscussions > 0
    ? (correctRejections + concessions) / totalDiscussions
    : 0;

  return {
    totalDiscussions,
    concessions,
    holdOuts,
    correctRejections,
    initialAgreements,
    effectivenessRate,
  };
}

/**
 * Format DA stats as text.
 */
export function formatDevilsAdvocateStats(stats: DevilsAdvocateStats): string {
  if (stats.totalDiscussions === 0) return 'No devil\'s advocate data available.';

  const lines: string[] = [];
  lines.push("Devil's Advocate Effectiveness");
  lines.push(`  Discussions participated: ${stats.totalDiscussions}`);
  lines.push(`  Initially agreed: ${stats.initialAgreements}`);
  lines.push(`  Conceded after debate: ${stats.concessions}`);
  lines.push(`  Held position: ${stats.holdOuts}`);
  lines.push(`  Correct rejections (DISMISSED): ${stats.correctRejections}`);
  lines.push(`  Effectiveness rate: ${(stats.effectivenessRate * 100).toFixed(1)}%`);
  return lines.join('\n');
}
