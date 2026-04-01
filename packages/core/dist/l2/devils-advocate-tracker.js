function trackDevilsAdvocate(devilsAdvocateId, roundsPerDiscussion, verdicts) {
  let totalDiscussions = 0;
  let concessions = 0;
  let holdOuts = 0;
  let correctRejections = 0;
  let initialAgreements = 0;
  for (const verdict of verdicts) {
    const rounds = roundsPerDiscussion[verdict.discussionId];
    if (!rounds || rounds.length === 0) continue;
    const daResponses = rounds.filter((r) => r.round < 100).map((r) => r.supporterResponses.find((s) => s.supporterId === devilsAdvocateId)).filter(Boolean);
    if (daResponses.length === 0) continue;
    totalDiscussions++;
    const firstStance = daResponses[0].stance;
    const lastStance = daResponses[daResponses.length - 1].stance;
    if (firstStance === "agree") {
      initialAgreements++;
    } else if (firstStance === "disagree") {
      if (lastStance === "agree") {
        concessions++;
      } else {
        holdOuts++;
        if (verdict.finalSeverity === "DISMISSED") {
          correctRejections++;
        }
      }
    }
  }
  const effectivenessRate = totalDiscussions > 0 ? (correctRejections + concessions) / totalDiscussions : 0;
  return {
    totalDiscussions,
    concessions,
    holdOuts,
    correctRejections,
    initialAgreements,
    effectivenessRate
  };
}
function formatDevilsAdvocateStats(stats) {
  if (stats.totalDiscussions === 0) return "No devil's advocate data available.";
  const lines = [];
  lines.push("Devil's Advocate Effectiveness");
  lines.push(`  Discussions participated: ${stats.totalDiscussions}`);
  lines.push(`  Initially agreed: ${stats.initialAgreements}`);
  lines.push(`  Conceded after debate: ${stats.concessions}`);
  lines.push(`  Held position: ${stats.holdOuts}`);
  lines.push(`  Correct rejections (DISMISSED): ${stats.correctRejections}`);
  lines.push(`  Effectiveness rate: ${(stats.effectivenessRate * 100).toFixed(1)}%`);
  return lines.join("\n");
}
export {
  formatDevilsAdvocateStats,
  trackDevilsAdvocate
};
