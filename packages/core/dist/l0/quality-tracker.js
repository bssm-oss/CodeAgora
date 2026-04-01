import { scoreReviewerSpecificity } from "./specificity-scorer.js";
const WEIGHTS = {
  headAcceptance: 0.45,
  peerValidation: 0.35,
  specificity: 0.2
};
const REWARD_THRESHOLD = 0.5;
class QualityTracker {
  reviewers = /* @__PURE__ */ new Map();
  /**
   * Record specificity score immediately after L1 review.
   */
  recordReviewerOutput(output, provider, diffId) {
    if (output.status !== "success") return;
    const locations = /* @__PURE__ */ new Set();
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
      headAcceptanceRate: null
    });
  }
  /**
   * Record peer validation + head acceptance after L2 discussions complete.
   * Maps each reviewer's issue locations → discussion verdicts.
   */
  recordDiscussionResults(discussions, verdicts) {
    const locationVerdict = /* @__PURE__ */ new Map();
    for (const d of discussions) {
      const key = `${d.filePath}:${d.lineRange[0]}-${d.lineRange[1]}`;
      const verdict = verdicts.find((v) => v.discussionId === d.id);
      if (verdict) {
        locationVerdict.set(key, verdict);
      }
    }
    const ACCEPTED_SEVERITIES = /* @__PURE__ */ new Set([
      "CRITICAL",
      "WARNING",
      "HARSHLY_CRITICAL"
    ]);
    for (const [, data] of this.reviewers) {
      if (data.issueLocations.size === 0) {
        data.peerValidationRate = 0.5;
        data.headAcceptanceRate = 0.5;
        data.noIssuesRaised = true;
        continue;
      }
      let peerValidated = 0;
      let headAccepted = 0;
      let totalInDiscussion = 0;
      for (const loc of data.issueLocations) {
        const verdict = locationVerdict.get(loc);
        if (verdict) {
          totalInDiscussion++;
          if (verdict.finalSeverity !== "DISMISSED") {
            peerValidated++;
          }
          if (ACCEPTED_SEVERITIES.has(verdict.finalSeverity)) {
            headAccepted++;
          }
        }
      }
      data.peerValidationRate = totalInDiscussion > 0 ? peerValidated / totalInDiscussion : 1;
      data.headAcceptanceRate = totalInDiscussion > 0 ? headAccepted / totalInDiscussion : 1;
    }
  }
  /**
   * Compute composite Q and reward signal for all tracked reviewers.
   */
  finalizeRewards() {
    const results = /* @__PURE__ */ new Map();
    for (const [reviewerId, data] of this.reviewers) {
      if (data.peerValidationRate === null || data.headAcceptanceRate === null) {
        continue;
      }
      const compositeQ = WEIGHTS.headAcceptance * data.headAcceptanceRate + WEIGHTS.peerValidation * data.peerValidationRate + WEIGHTS.specificity * data.specificityScore;
      if (data.noIssuesRaised) {
        continue;
      }
      const reward = compositeQ >= REWARD_THRESHOLD ? 1 : 0;
      results.set(reviewerId, {
        modelId: data.modelId,
        provider: data.provider,
        compositeQ: Math.round(compositeQ * 1e3) / 1e3,
        reward
      });
    }
    return results;
  }
  /**
   * Build ReviewRecord objects for persistence in bandit store.
   */
  getRecords() {
    const records = [];
    for (const [reviewerId, data] of this.reviewers) {
      const hasAllSignals = data.peerValidationRate !== null && data.headAcceptanceRate !== null;
      const compositeQ = hasAllSignals ? WEIGHTS.headAcceptance * data.headAcceptanceRate + WEIGHTS.peerValidation * data.peerValidationRate + WEIGHTS.specificity * data.specificityScore : null;
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
        compositeQ: compositeQ !== null ? Math.round(compositeQ * 1e3) / 1e3 : null,
        rewardSignal: compositeQ !== null ? compositeQ >= REWARD_THRESHOLD ? 1 : 0 : null
      });
    }
    return records;
  }
  getReviewerData(reviewerId) {
    return this.reviewers.get(reviewerId);
  }
}
export {
  QualityTracker
};
