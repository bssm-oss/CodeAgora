function applyThreshold(evidenceDocs, settings) {
  const grouped = groupByLocation(evidenceDocs);
  const discussions = [];
  const unconfirmed = [];
  const suggestions = [];
  const counter = { value: 1 };
  for (const group of grouped) {
    const severityCounts = countBySeverity(group.docs);
    if (group.primarySeverity === "SUGGESTION") {
      suggestions.push(...group.docs);
      continue;
    }
    const hcThreshold = settings.registrationThreshold.HARSHLY_CRITICAL;
    if (hcThreshold !== null && hcThreshold !== 0 && severityCounts.HARSHLY_CRITICAL >= hcThreshold) {
      discussions.push(createDiscussion(group, "HARSHLY_CRITICAL", counter));
      continue;
    }
    const criticalThreshold = settings.registrationThreshold.CRITICAL;
    if (criticalThreshold !== null && criticalThreshold !== 0 && severityCounts.CRITICAL >= criticalThreshold) {
      discussions.push(createDiscussion(group, "CRITICAL", counter));
      continue;
    }
    const warningThreshold = settings.registrationThreshold.WARNING;
    if (warningThreshold !== null && warningThreshold !== 0 && severityCounts.WARNING >= warningThreshold) {
      discussions.push(createDiscussion(group, "WARNING", counter));
      continue;
    }
    for (const doc of group.docs) {
      if (doc.severity === "CRITICAL" || doc.severity === "HARSHLY_CRITICAL" || doc.severity === "WARNING") {
        unconfirmed.push(doc);
      } else {
        suggestions.push(doc);
      }
    }
  }
  return { discussions, unconfirmed, suggestions };
}
const LINE_PROXIMITY = 15;
function groupByLocation(docs) {
  const groups = [];
  for (const doc of docs) {
    const existing = groups.find(
      (g) => g.filePath === doc.filePath && doc.lineRange[0] <= g.lineRange[1] + LINE_PROXIMITY && doc.lineRange[1] >= g.lineRange[0] - LINE_PROXIMITY
    );
    if (existing) {
      existing.docs.push(doc);
      existing.lineRange = [
        Math.min(existing.lineRange[0], doc.lineRange[0]),
        Math.max(existing.lineRange[1], doc.lineRange[1])
      ];
      if (severityRank(doc.severity) > severityRank(existing.primarySeverity)) {
        existing.primarySeverity = doc.severity;
      }
    } else {
      groups.push({
        filePath: doc.filePath,
        lineRange: [...doc.lineRange],
        issueTitle: doc.issueTitle,
        docs: [doc],
        primarySeverity: doc.severity
      });
    }
  }
  return groups;
}
function countBySeverity(docs) {
  const counts = {
    HARSHLY_CRITICAL: 0,
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0
  };
  for (const doc of docs) {
    counts[doc.severity]++;
  }
  return counts;
}
function severityRank(severity) {
  const ranks = {
    HARSHLY_CRITICAL: 4,
    CRITICAL: 3,
    WARNING: 2,
    SUGGESTION: 1
  };
  return ranks[severity];
}
function createDiscussion(group, severity, counter) {
  const id = `d${String(counter.value++).padStart(3, "0")}`;
  return {
    id,
    severity,
    issueTitle: group.issueTitle,
    filePath: group.filePath,
    lineRange: group.lineRange,
    codeSnippet: "",
    // Populated by moderator
    evidenceDocs: group.docs.map((d) => `evidence-${d.issueTitle.replace(/\s+/g, "-")}.md`),
    evidenceContent: group.docs,
    // Actual L1 content for supporter prompts (#246)
    status: "pending"
  };
}
export {
  applyThreshold
};
