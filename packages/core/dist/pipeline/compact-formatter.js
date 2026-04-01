function formatCompact(params) {
  const { decision, reasoning, evidenceDocs, discussions, reviewerMap, reviewerOpinions, cost, sessionId } = params;
  const dismissedLocations = new Set(
    (discussions ?? []).filter((d) => d.finalSeverity === "DISMISSED").map((d) => `${d.filePath}:${d.lineRange[0]}`)
  );
  const activeIssues = evidenceDocs.filter(
    (doc) => !dismissedLocations.has(`${doc.filePath}:${doc.lineRange[0]}`)
  );
  const issues = activeIssues.map((doc) => {
    const key = `${doc.filePath}:${doc.lineRange[0]}`;
    const issue = {
      severity: doc.severity,
      file: doc.filePath,
      line: doc.lineRange[0],
      title: doc.issueTitle,
      confidence: doc.confidence ?? 50
    };
    const flaggers = reviewerMap?.[key];
    if (flaggers && flaggers.length > 0) {
      issue.flaggedBy = flaggers;
    }
    const ops = reviewerOpinions?.[key];
    if (ops && ops.length > 0) {
      issue.opinions = ops;
    }
    return issue;
  });
  const counts = {};
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  }
  const summaryParts = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([sev, count]) => `${count} ${sev.toLowerCase()}`);
  const summary = summaryParts.join(", ") || "no issues";
  return {
    decision,
    reasoning: reasoning.length > 200 ? reasoning.slice(0, 197) + "..." : reasoning,
    issues,
    summary,
    ...cost && { cost },
    ...sessionId && { sessionId }
  };
}
export {
  formatCompact
};
