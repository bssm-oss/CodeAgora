function buildDiffPositionIndex(unifiedDiff) {
  const index = {};
  let currentFile = "";
  let filePosition = 0;
  let newLineNumber = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("--- ")) continue;
    if (line.startsWith("+++ ")) {
      if (line === "+++ /dev/null") {
        currentFile = "";
      } else {
        currentFile = line.startsWith("+++ b/") ? line.slice(6) : line.slice(4);
      }
      filePosition = 0;
      continue;
    }
    if (line.startsWith("Binary files ")) continue;
    if (line.startsWith("\\ No newline")) continue;
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      newLineNumber = match ? parseInt(match[1], 10) - 1 : 0;
      filePosition++;
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith("-")) {
      filePosition++;
      continue;
    }
    if (line.startsWith("+") || line.startsWith(" ")) {
      filePosition++;
      newLineNumber++;
      index[`${currentFile}:${newLineNumber}`] = filePosition;
    }
  }
  return index;
}
function resolvePosition(index, filePath, line) {
  return index[`${filePath}:${line}`] ?? null;
}
function resolveLineRange(index, filePath, lineRange) {
  for (let line = lineRange[0]; line <= lineRange[1]; line++) {
    const pos = resolvePosition(index, filePath, line);
    if (pos !== null) return pos;
  }
  return null;
}
export {
  buildDiffPositionIndex,
  resolveLineRange,
  resolvePosition
};
