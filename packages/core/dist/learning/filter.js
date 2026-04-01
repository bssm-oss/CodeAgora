import { SEVERITY_ORDER } from "../types/core.js";
function applyLearnedPatterns(evidenceDocs, patterns, threshold = 3) {
  const filtered = [];
  const downgraded = [];
  const suppressed = [];
  for (const doc of evidenceDocs) {
    const matchingPattern = patterns.find(
      (p) => p.dismissCount >= threshold && doc.issueTitle.toLowerCase().includes(p.pattern.toLowerCase())
    );
    if (!matchingPattern) {
      filtered.push(doc);
      continue;
    }
    if (matchingPattern.action === "suppress") {
      suppressed.push(doc);
    } else {
      const currentIdx = SEVERITY_ORDER.indexOf(doc.severity);
      const newSeverity = currentIdx < SEVERITY_ORDER.length - 1 ? SEVERITY_ORDER[currentIdx + 1] : doc.severity;
      downgraded.push({ ...doc, severity: newSeverity });
    }
  }
  return { filtered: [...filtered, ...downgraded], downgraded, suppressed };
}
export {
  applyLearnedPatterns
};
