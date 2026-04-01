import { fuzzyMatchFilePath } from "@codeagora/shared/utils/diff.js";
const EVIDENCE_BLOCK_REGEX = /## Issue:\s*(.+?)\n[\s\S]*?### (?:Problem|문제)\n([\s\S]*?)### (?:Evidence|근거)\n([\s\S]*?)### (?:Severity|심각도)\n([\s\S]*?)### (?:Suggestion|제안)\n([\s\S]*?)(?=\n## Issue:|$)/gi;
function parseEvidenceResponse(response, diffFilePaths) {
  const documents = [];
  const matches = Array.from(response.matchAll(EVIDENCE_BLOCK_REGEX));
  for (const match of matches) {
    try {
      const [_, title, problem, evidenceText, severityText, suggestion] = match;
      const evidence = evidenceText.split("\n").map((line) => line.trim()).filter((line) => line.match(/^\d+\./)).map((line) => line.replace(/^\d+\.\s*/, ""));
      const { severity: parsedSeverity, confidence: reviewerConfidence } = parseSeverity(severityText.trim());
      const severity = parsedSeverity;
      const fileInfo = extractFileInfo(problem, diffFilePaths);
      documents.push({
        issueTitle: title.trim(),
        problem: problem.trim(),
        evidence,
        severity,
        suggestion: suggestion.trim(),
        filePath: fileInfo.filePath,
        lineRange: fileInfo.lineRange,
        ...reviewerConfidence !== void 0 && { confidence: reviewerConfidence }
      });
    } catch (_error) {
      continue;
    }
  }
  if (documents.length === 0) {
    const lowerResponse = response.toLowerCase().trim();
    if (lowerResponse.includes("no issues found") || lowerResponse.includes("no problems found") || /^(the\s+)?(code\s+)?looks\s+good/m.test(lowerResponse)) {
      return [];
    }
  }
  return documents;
}
function parseSeverity(severityText) {
  const normalized = severityText.toUpperCase().trim();
  const confidenceMatch = severityText.match(/\((\d+)%\)/);
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : void 0;
  let severity;
  if (normalized.includes("HARSHLY_CRITICAL") || normalized.includes("HARSHLY CRITICAL")) {
    severity = "HARSHLY_CRITICAL";
  } else if (normalized.includes("CRITICAL")) {
    severity = "CRITICAL";
  } else if (normalized.includes("WARNING")) {
    severity = "WARNING";
  } else {
    severity = "SUGGESTION";
  }
  return { severity, confidence };
}
function extractFileInfo(problemText, diffFilePaths) {
  const patterns = [
    // Primary format: "In file.ts:10-20" or "In file.ts:10"
    /In\s+([a-zA-Z0-9_/.-]+\.[a-z]+):(\d+)(?:-(\d+))?/i,
    // With comma: "In file.ts, line 10" or "In file.ts,10"
    /In\s+([a-zA-Z0-9_/.-]+\.[a-z]+),?\s*(?:line\s+)?(\d+)(?:-(\d+))?/i,
    // Without "In": "file.ts:10-20" or "file.ts:10"
    /([a-zA-Z0-9_/.-]+\.[a-z]+):(\d+)(?:-(\d+))?/,
    // Space separated: "file.ts line 10"
    /([a-zA-Z0-9_/.-]+\.[a-z]+)\s+line\s+(\d+)(?:-(\d+))?/i
  ];
  for (const pattern of patterns) {
    const fileMatch = problemText.match(pattern);
    if (fileMatch) {
      const filePath = fileMatch[1];
      const lineStart = parseInt(fileMatch[2], 10);
      const lineEnd = fileMatch[3] ? parseInt(fileMatch[3], 10) : lineStart;
      return {
        filePath,
        lineRange: [lineStart, lineEnd]
      };
    }
  }
  if (diffFilePaths && diffFilePaths.length > 0) {
    const matchedPath = fuzzyMatchFilePath(problemText, diffFilePaths);
    if (matchedPath) {
      console.warn(
        `[Parser] Used fuzzy matching: "${problemText.substring(0, 50)}..." -> ${matchedPath}`
      );
      const linePatterns = [
        /(?:line\s+)(\d+)(?:\s*-\s*(\d+))?/i,
        /:(\d+)(?:-(\d+))?/,
        /(?:lines?\s+)(\d+)(?:\s*(?:-|to)\s*(\d+))?/i
      ];
      let lineStart = 1;
      let lineEnd = 1;
      for (const lp of linePatterns) {
        const lm = problemText.match(lp);
        if (lm) {
          lineStart = parseInt(lm[1], 10);
          lineEnd = lm[2] ? parseInt(lm[2], 10) : lineStart;
          break;
        }
      }
      return {
        filePath: matchedPath,
        lineRange: [lineStart, lineEnd]
      };
    }
  }
  console.warn(
    "[Parser] Failed to extract file info from problem text:",
    problemText.substring(0, 100)
  );
  return {
    filePath: "unknown",
    lineRange: [0, 0]
  };
}
export {
  parseEvidenceResponse
};
