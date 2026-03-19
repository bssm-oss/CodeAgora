/**
 * Pure utility functions for the discussion/debate viewer.
 * Separated from React components so they can be unit-tested in Node environment.
 */

// ============================================================================
// Types
// ============================================================================

type DiscussionSeverity =
  | 'HARSHLY_CRITICAL'
  | 'CRITICAL'
  | 'WARNING'
  | 'SUGGESTION'
  | 'DISMISSED';

type Stance = 'agree' | 'disagree' | 'neutral';

interface DiscussionVerdict {
  discussionId: string;
  filePath: string;
  lineRange: [number, number];
  finalSeverity: DiscussionSeverity;
  reasoning: string;
  consensusReached: boolean;
  rounds: number;
}

interface SupporterResponse {
  supporterId: string;
  response: string;
  stance: Stance;
}

interface DiscussionRound {
  round: number;
  moderatorPrompt: string;
  supporterResponses: SupporterResponse[];
}

interface StanceCounts {
  agree: number;
  disagree: number;
  neutral: number;
}

interface StanceProgressionEntry {
  supporterId: string;
  stances: Stance[];
}

interface DiscussionSummary {
  totalRounds: number;
  totalSupporters: number;
  consensusReached: boolean;
  finalSeverity: DiscussionSeverity;
  finalConsensusPercentage: number;
  hasDevilsAdvocate: boolean;
}

// ============================================================================
// Severity display maps
// ============================================================================

const discussionSeverityClassMap: Record<DiscussionSeverity, string> = {
  HARSHLY_CRITICAL: 'disc-severity--harshly-critical',
  CRITICAL: 'disc-severity--critical',
  WARNING: 'disc-severity--warning',
  SUGGESTION: 'disc-severity--suggestion',
  DISMISSED: 'disc-severity--dismissed',
};

const discussionSeverityLabelMap: Record<DiscussionSeverity, string> = {
  HARSHLY_CRITICAL: 'Harshly Critical',
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  SUGGESTION: 'Suggestion',
  DISMISSED: 'Dismissed',
};

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Count agree/disagree/neutral stances in a single round.
 */
function getStanceCounts(round: DiscussionRound): StanceCounts {
  const counts: StanceCounts = { agree: 0, disagree: 0, neutral: 0 };

  for (const response of round.supporterResponses) {
    counts[response.stance]++;
  }

  return counts;
}

/**
 * Calculate the percentage of agree stances in a round.
 * Returns 0 for rounds with no supporters.
 */
function getConsensusPercentage(round: DiscussionRound): number {
  const total = round.supporterResponses.length;
  if (total === 0) return 0;

  const agreeCount = round.supporterResponses.filter(
    (r) => r.stance === 'agree',
  ).length;

  return Math.round((agreeCount / total) * 100);
}

/**
 * Check if a supporter is a devil's advocate.
 * Identified by "devil" appearing in the supporter ID (case-insensitive).
 */
function isDevilsAdvocate(supporterId: string): boolean {
  return supporterId.toLowerCase().includes('devil');
}

/**
 * Build per-supporter stance progression across all rounds.
 * Each entry tracks how one supporter's stance changed over rounds.
 */
function getStanceProgression(
  rounds: readonly DiscussionRound[],
): StanceProgressionEntry[] {
  if (rounds.length === 0) return [];

  // Collect all unique supporter IDs across all rounds
  const supporterIds = new Set<string>();
  for (const round of rounds) {
    for (const response of round.supporterResponses) {
      supporterIds.add(response.supporterId);
    }
  }

  // Sort rounds by round number
  const sorted = [...rounds].sort((a, b) => a.round - b.round);

  // Build progression for each supporter
  const progression: StanceProgressionEntry[] = [];

  for (const supporterId of supporterIds) {
    const stances: Stance[] = [];

    for (const round of sorted) {
      const response = round.supporterResponses.find(
        (r) => r.supporterId === supporterId,
      );
      // If supporter didn't participate in a round, default to neutral
      stances.push(response ? response.stance : 'neutral');
    }

    progression.push({ supporterId, stances });
  }

  return progression;
}

/**
 * Generate summary statistics for a discussion.
 */
function summarizeDiscussion(
  verdict: DiscussionVerdict,
  rounds: readonly DiscussionRound[],
): DiscussionSummary {
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const lastRound = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  // Collect unique supporter IDs
  const supporterIds = new Set<string>();
  for (const round of rounds) {
    for (const response of round.supporterResponses) {
      supporterIds.add(response.supporterId);
    }
  }

  const hasDevilsAdvocate = [...supporterIds].some((id) =>
    isDevilsAdvocate(id),
  );

  const finalConsensusPercentage = lastRound
    ? getConsensusPercentage(lastRound)
    : 0;

  return {
    totalRounds: verdict.rounds,
    totalSupporters: supporterIds.size,
    consensusReached: verdict.consensusReached,
    finalSeverity: verdict.finalSeverity,
    finalConsensusPercentage,
    hasDevilsAdvocate,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  getStanceCounts,
  getConsensusPercentage,
  isDevilsAdvocate,
  getStanceProgression,
  summarizeDiscussion,
  discussionSeverityClassMap,
  discussionSeverityLabelMap,
};

export type {
  DiscussionSeverity,
  Stance,
  DiscussionVerdict,
  SupporterResponse,
  DiscussionRound,
  StanceCounts,
  StanceProgressionEntry,
  DiscussionSummary,
};
