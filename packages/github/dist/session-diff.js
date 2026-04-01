function diffSessionIssues(currentDocs, previousDocs, previousSessionId) {
  const makeKey = (doc) => `${doc.filePath}:${doc.lineRange[0]}:${doc.issueTitle}`;
  const currentKeys = new Set(currentDocs.map(makeKey));
  const previousKeys = new Set(previousDocs.map(makeKey));
  let newIssues = 0;
  let resolvedIssues = 0;
  let unchangedIssues = 0;
  for (const key of currentKeys) {
    if (previousKeys.has(key)) {
      unchangedIssues++;
    } else {
      newIssues++;
    }
  }
  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      resolvedIssues++;
    }
  }
  return { newIssues, resolvedIssues, unchangedIssues, previousSession: previousSessionId };
}
function formatSessionDiffMarkdown(diff) {
  return `**Delta from previous review (${diff.previousSession}):** +${diff.newIssues} new, -${diff.resolvedIssues} resolved, ${diff.unchangedIssues} unchanged`;
}
export {
  diffSessionIssues,
  formatSessionDiffMarkdown
};
