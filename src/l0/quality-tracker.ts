/**
 * Quality Tracker
 * Collects 3 quality signals through the pipeline and computes composite Q score.
 *
 * Signal collection timeline:
 *   L1 → specificityScore (immediate)
 *   L2 → peerValidationRate (from discussion verdicts)
 *   L3 → headAcceptanceRate (from verdict severity)
 *   Final → compositeQ + rewardSignal
 */

import type { ReviewRecord } from '../types/l0.js';
import type { ReviewOutput, Discussion, DiscussionVerdict } from '../types/core.js';
import { scoreReviewerSpecificity } from './specificity-scorer.js';

// ============================================================================
// Constants
// ============================================================================

const WEIGHTS = {
  headAcceptance: 0.45,
  peerValidation: 0.35,
  specificity: 0.20,
} as const;

const REWARD_THRESHOLD = 0.5;

// ============================================================================
// Internal Tracking Data
// ============================================================================

interface ReviewerTrack {
  modelId: string;
  provider: string;
  diffId: string;
  issueLocations: Set<string>;
  issuesRaised: number;
  specificityScore: number;
  peerValidationRate: number | null;
  headAcceptanceRate: number | null;
}

// ============================================================================
// Quality Tracker
// ============================================================================

export class QualityTracker {
  private reviewers = new Map<string, ReviewerTrack>();

  /**
   * Record specificity score immediately after L1 review.
   */
  recordReviewerOutput(
    output: ReviewOutput,
    provider: string,
    diffId: string
  ): void {
    if (output.status !== 'success') return;

    const locations = new Set<string>();
    for (const doc of output.evidenceDocs) {
      locations.add(`${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}`);
    }

    this.reviewers.set(output.reviewerId, {
      modelId: output.model,
      provider,
      diffId,
      issueLocations: locations,
      issuesRaised: output.evidenceDocs.length,
      specificityScore: scoreReviewerSpecificity(output.evidenceDocs),
      peerValidationRate: null,
      headAcceptanceRate: null,
    });
  }

  /**
   * Record peer validation + head acceptance after L2 discussions complete.
   * Maps each reviewer's issue locations → discussion verdicts.
   */
  recordDiscussionResults(
    discussions: Discussion[],
    verdicts: DiscussionVerdict[]
  ): void {
    // Build location → verdict map
    const locationVerdict = new Map<string, DiscussionVerdict>();
    for (const d of discussions) {
      const key = `${d.filePath}:${d.lineRange[0]}-${d.lineRange[1]}`;
      const verdict = verdicts.find((v) => v.discussionId === d.id);
      if (verdict) {
        locationVerdict.set(key, verdict);
      }
    }

    const ACCEPTED_SEVERITIES = new Set([
      'CRITICAL',
      'WARNING',
      'HARSHLY_CRITICAL',
    ]);

    for (const [, data] of this.reviewers) {
      if (data.issueLocations.size === 0) {
        data.peerValidationRate = 1.0;
        data.headAcceptanceRate = 1.0;
        continue;
      }

      let peerValidated = 0;
      let headAccepted = 0;
      let totalInDiscussion = 0;

      for (const loc of data.issueLocations) {
        const verdict = locationVerdict.get(loc);
        if (verdict) {
          totalInDiscussion++;
          if (verdict.finalSeverity !== 'DISMISSED') {
            peerValidated++;
          }
          if (ACCEPTED_SEVERITIES.has(verdict.finalSeverity)) {
            headAccepted++;
          }
        }
      }

      // Peer validation: fraction of discussed issues not dismissed
      data.peerValidationRate =
        totalInDiscussion > 0 ? peerValidated / totalInDiscussion : 1.0;

      // Head acceptance: fraction of all raised issues accepted as actionable
      data.headAcceptanceRate = headAccepted / data.issuesRaised;
    }
  }

  /**
   * Compute composite Q and reward signal for all tracked reviewers.
   */
  finalizeRewards(): Map<
    string,
    { modelId: string; provider: string; compositeQ: number; reward: 0 | 1 }
  > {
    const results = new Map<
      string,
      { modelId: string; provider: string; compositeQ: number; reward: 0 | 1 }
    >();

    for (const [reviewerId, data] of this.reviewers) {
      if (
        data.peerValidationRate === null ||
        data.headAcceptanceRate === null
      ) {
        continue;
      }

      const compositeQ =
        WEIGHTS.headAcceptance * data.headAcceptanceRate +
        WEIGHTS.peerValidation * data.peerValidationRate +
        WEIGHTS.specificity * data.specificityScore;

      const reward: 0 | 1 = compositeQ >= REWARD_THRESHOLD ? 1 : 0;

      results.set(reviewerId, {
        modelId: data.modelId,
        provider: data.provider,
        compositeQ: Math.round(compositeQ * 1000) / 1000,
        reward,
      });
    }

    return results;
  }

  /**
   * Build ReviewRecord objects for persistence in bandit store.
   */
  getRecords(): ReviewRecord[] {
    const records: ReviewRecord[] = [];

    for (const [reviewerId, data] of this.reviewers) {
      const hasAllSignals =
        data.peerValidationRate !== null && data.headAcceptanceRate !== null;

      const compositeQ = hasAllSignals
        ? WEIGHTS.headAcceptance * data.headAcceptanceRate! +
          WEIGHTS.peerValidation * data.peerValidationRate! +
          WEIGHTS.specificity * data.specificityScore
        : null;

      records.push({
        reviewId: reviewerId,
        diffId: data.diffId,
        modelId: data.modelId,
        provider: data.provider,
        timestamp: Date.now(),
        issuesRaised: data.issuesRaised,
        specificityScore: data.specificityScore,
        peerValidationRate: data.peerValidationRate,
        headAcceptanceRate: data.headAcceptanceRate,
        compositeQ:
          compositeQ !== null
            ? Math.round(compositeQ * 1000) / 1000
            : null,
        rewardSignal:
          compositeQ !== null ? (compositeQ >= REWARD_THRESHOLD ? 1 : 0) : null,
      });
    }

    return records;
  }

  getReviewerData(reviewerId: string): ReviewerTrack | undefined {
    return this.reviewers.get(reviewerId);
  }
}
