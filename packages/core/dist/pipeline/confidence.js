function computeL1Confidence(doc, allDocs, totalReviewers) {
  if (totalReviewers <= 0) return 50;
  const agreeing = allDocs.filter(
    (d) => d.filePath === doc.filePath && Math.abs(d.lineRange[0] - doc.lineRange[0]) <= 5
  ).length;
  const agreementRate = Math.round(agreeing / totalReviewers * 100);
  if (doc.confidence !== void 0 && doc.confidence >= 0 && doc.confidence <= 100) {
    return Math.round(doc.confidence * 0.6 + agreementRate * 0.4);
  }
  return agreementRate;
}
function adjustConfidenceFromDiscussion(baseConfidence, verdict) {
  let adjusted = baseConfidence;
  if (verdict.consensusReached) {
    if (verdict.finalSeverity === "DISMISSED") {
      return 0;
    }
    adjusted += 15;
    adjusted += Math.min(verdict.rounds, 3) * 5;
  } else {
    adjusted -= 10;
  }
  return Math.max(0, Math.min(100, adjusted));
}
function getConfidenceBadge(confidence) {
  if (confidence == null) return "";
  if (confidence >= 80) return `\u{1F7E2} ${confidence}%`;
  if (confidence >= 40) return `\u{1F7E1} ${confidence}%`;
  return `\u{1F534} ${confidence}%`;
}
export {
  adjustConfidenceFromDiscussion,
  computeL1Confidence,
  getConfidenceBadge
};
