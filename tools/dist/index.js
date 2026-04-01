#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/types/index.ts
import { z } from "zod";
var SeveritySchema = z.enum(["critical", "warning", "suggestion", "nitpick"]);
var ReviewIssueSchema = z.object({
  severity: SeveritySchema,
  category: z.string(),
  line: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
  title: z.string(),
  description: z.string().optional(),
  suggestion: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5)
});
var ParseReviewsInputSchema = z.object({
  reviews: z.array(
    z.object({
      reviewer: z.string(),
      file: z.string(),
      response: z.string()
    })
  )
});
var VotingInputSchema = z.object({
  reviews: z.array(z.any()),
  // ParsedReview[] (any for runtime flexibility)
  threshold: z.number().min(0).max(1).default(0.75)
});
var AnonymizeInputSchema = z.object({
  opinions: z.array(
    z.object({
      reviewer: z.string(),
      severity: z.string(),
      reasoning: z.string()
    })
  )
});
var ScoreInputSchema = z.object({
  reasoning: z.string()
});
var EarlyStopInputSchema = z.object({
  participants: z.array(z.any()),
  // DebateParticipant[]
  minRounds: z.number().int().positive().default(2),
  similarityThreshold: z.number().min(0).max(1).default(0.9)
});
var FormatOutputInputSchema = z.object({
  consensusIssues: z.array(z.any()),
  debateIssues: z.array(z.any()),
  debateResults: z.array(z.any()).optional()
});

// src/utils/parser.ts
var CONFIDENCE_REGEX = /confidence:\s*(-?\d+\.?\d*)/i;
var SUGGESTION_REGEX = /suggestion:\s*(.+?)(?=\n(?:confidence:|$)|$)/is;
function normalizeSeverity(severity) {
  const normalized = severity.toUpperCase();
  switch (normalized) {
    case "CRITICAL":
      return "critical";
    case "MAJOR":
    case "WARNING":
      return "warning";
    case "MINOR":
    case "SUGGESTION":
      return "suggestion";
    case "NITPICK":
    case "NIT":
      return "nitpick";
    default:
      return "suggestion";
  }
}
function extractConfidence(text) {
  const match = text.match(CONFIDENCE_REGEX);
  if (!match) {
    return 0.5;
  }
  const confidence = parseFloat(match[1]);
  return Math.max(0, Math.min(1, confidence));
}
function extractSuggestion(text) {
  const match = text.match(SUGGESTION_REGEX);
  return match ? match[1].trim() : void 0;
}
function extractDescription(fullText, headerLength) {
  let description = fullText.substring(headerLength).trim();
  description = description.replace(SUGGESTION_REGEX, "").trim();
  description = description.replace(CONFIDENCE_REGEX, "").trim();
  return description || void 0;
}
function parseIssueBlock(blockText) {
  const headerRegex = /\[([a-zA-Z]+)\]\s*(.+?)\s*\|\s*L?(\d+)(?:-L?(\d+))?\s*\|\s*(.+)/i;
  const match = blockText.match(headerRegex);
  if (!match) {
    return {
      severity: "suggestion",
      category: "",
      line: 0,
      title: "",
      confidence: 0.5,
      parseSuccess: false,
      raw: blockText,
      parseError: "Could not match issue header pattern"
    };
  }
  const [fullMatch, severityRaw, category, lineStart, lineEnd, title] = match;
  try {
    const severity = normalizeSeverity(severityRaw);
    const line = parseInt(lineStart, 10);
    const lineEndNum = lineEnd ? parseInt(lineEnd, 10) : void 0;
    const description = extractDescription(blockText, fullMatch.length);
    const suggestion = extractSuggestion(blockText);
    const confidence = extractConfidence(blockText);
    const issueData = {
      severity,
      category: category.trim(),
      line,
      lineEnd: lineEndNum,
      title: title.trim(),
      description,
      suggestion,
      confidence
    };
    const validationResult = ReviewIssueSchema.safeParse(issueData);
    if (!validationResult.success) {
      return {
        severity,
        category: category.trim(),
        line,
        lineEnd: lineEndNum,
        title: title.trim(),
        description,
        suggestion,
        confidence,
        parseSuccess: false,
        raw: blockText,
        parseError: `Schema validation failed: ${validationResult.error.message}`
      };
    }
    return {
      ...validationResult.data,
      parseSuccess: true,
      raw: blockText
    };
  } catch (error) {
    return {
      severity: "suggestion",
      category: category?.trim() || "",
      line: 0,
      title: "",
      confidence: 0.5,
      parseSuccess: false,
      raw: blockText,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
function parseReviewerResponse(response) {
  if (!response || !response.trim()) {
    return [];
  }
  const lowerResponse = response.toLowerCase();
  if (lowerResponse.includes("no issues found") || lowerResponse.includes("no problems found") || lowerResponse.includes("looks good")) {
    return [];
  }
  const blocks = [];
  const headerRegex = /\[([a-zA-Z]+)\]\s*(.+?)\s*\|\s*L?(\d+)(?:-L?(\d+))?\s*\|\s*(.+)/gim;
  const matches = Array.from(response.matchAll(headerRegex));
  if (matches.length === 0) {
    blocks.push({
      severity: "suggestion",
      category: "",
      line: 0,
      title: "",
      confidence: 0.5,
      parseSuccess: false,
      raw: response,
      parseError: "No structured issue blocks found in response"
    });
    return blocks;
  }
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.index;
    const nextMatch = matches[i + 1];
    const endIndex = nextMatch ? nextMatch.index : response.length;
    const blockText = response.substring(startIndex, endIndex).trim();
    blocks.push(parseIssueBlock(blockText));
  }
  return blocks;
}
function transformReviewerResponse(reviewer, file, response) {
  const blocks = parseReviewerResponse(response);
  const issues = blocks.filter((block) => block.parseSuccess).map((block) => ({
    severity: block.severity,
    category: block.category,
    line: block.line,
    lineEnd: block.lineEnd,
    title: block.title,
    description: block.description,
    suggestion: block.suggestion,
    confidence: block.confidence
  }));
  const parseFailures = blocks.filter((block) => !block.parseSuccess).map((block) => ({
    raw: block.raw || "",
    reason: block.parseError || "Unknown parsing error"
  }));
  return {
    reviewer,
    file,
    issues,
    parseFailures
  };
}

// src/commands/parse-reviews.ts
function extractGeminiContent(response) {
  try {
    const parsed = JSON.parse(response);
    if (parsed.response && typeof parsed.response === "string") {
      return parsed.response;
    }
  } catch {
  }
  return response;
}
function parseReviews(inputJson) {
  try {
    const input = JSON.parse(inputJson);
    const validated = ParseReviewsInputSchema.parse(input);
    const parsedReviews = validated.reviews.map((review) => {
      const cleanedResponse = extractGeminiContent(review.response);
      return transformReviewerResponse(review.reviewer, review.file, cleanedResponse);
    });
    const output = { parsedReviews };
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}

// src/commands/voting.ts
function getMajorityVote(issues) {
  if (issues.length === 0) return null;
  const counts = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    counts.set(issue.severity, (counts.get(issue.severity) || 0) + 1);
  }
  let maxCount = 0;
  let maxSeverity = "suggestion";
  for (const [severity, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxSeverity = severity;
    }
  }
  return {
    severity: maxSeverity,
    count: maxCount,
    total: issues.length,
    confidence: maxCount / issues.length
  };
}
function voting(inputJson) {
  try {
    const input = JSON.parse(inputJson);
    const validated = VotingInputSchema.parse(input);
    const reviews = validated.reviews;
    const threshold = validated.threshold;
    const issuesByLocation = /* @__PURE__ */ new Map();
    for (const review of reviews) {
      for (const issue of review.issues) {
        const key = `${review.file}:${issue.line}:${issue.title}`;
        if (!issuesByLocation.has(key)) {
          issuesByLocation.set(key, {
            file: review.file,
            line: issue.line,
            lineEnd: issue.lineEnd,
            title: issue.title,
            issues: []
          });
        }
        issuesByLocation.get(key).issues.push({
          ...issue,
          reviewer: review.reviewer
        });
      }
    }
    const consensusIssues = [];
    const debateIssues = [];
    for (const location of issuesByLocation.values()) {
      const majorityVote = getMajorityVote(location.issues);
      if (!majorityVote) continue;
      const issueGroup = {
        file: location.file,
        line: location.line,
        lineEnd: location.lineEnd,
        title: location.title
      };
      const hasLowConfidenceWarning = majorityVote.severity === "warning" && majorityVote.confidence >= 0.99 && // Near-unanimous agreement
      location.issues.some((i) => i.severity === "warning" && i.confidence < 0.7);
      if (majorityVote.confidence >= threshold && !hasLowConfidenceWarning) {
        const voters = location.issues.filter((i) => i.severity === majorityVote.severity).map((i) => i.reviewer);
        const suggestions = location.issues.filter((i) => i.suggestion).map((i) => i.suggestion);
        consensusIssues.push({
          issueGroup,
          agreedSeverity: majorityVote.severity,
          confidence: majorityVote.confidence,
          debateRequired: false,
          voters,
          suggestions: suggestions.length > 0 ? suggestions : void 0
        });
      } else {
        const severityDistribution = {};
        for (const issue of location.issues) {
          severityDistribution[issue.severity] = (severityDistribution[issue.severity] || 0) + 1;
        }
        const hasCritical = location.issues.some((i) => i.severity === "critical");
        const severities = new Set(location.issues.map((i) => i.severity));
        const hasConflict = severities.size > 1;
        const multipleReviewers = location.issues.length >= 3;
        const debateRequired = hasCritical || hasConflict || hasLowConfidenceWarning || multipleReviewers;
        if (debateRequired) {
          debateIssues.push({
            issueGroup,
            severityDistribution,
            confidence: majorityVote.confidence,
            debateRequired: true,
            opinions: location.issues.map((issue) => ({
              reviewer: issue.reviewer,
              severity: issue.severity,
              confidence: issue.confidence,
              description: issue.description,
              suggestion: issue.suggestion
            }))
          });
        } else {
          const voters = location.issues.filter((i) => i.severity === majorityVote.severity).map((i) => i.reviewer);
          const suggestions = location.issues.filter((i) => i.suggestion).map((i) => i.suggestion);
          consensusIssues.push({
            issueGroup,
            agreedSeverity: majorityVote.severity,
            confidence: majorityVote.confidence,
            debateRequired: false,
            voters,
            suggestions: suggestions.length > 0 ? suggestions : void 0
          });
        }
      }
    }
    const output = {
      consensusIssues,
      debateIssues,
      stats: {
        totalIssueGroups: issuesByLocation.size,
        consensus: consensusIssues.length,
        needsDebate: debateIssues.length
      }
    };
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}

// src/commands/anonymize.ts
function anonymize(inputJson) {
  try {
    const input = JSON.parse(inputJson);
    const validated = AnonymizeInputSchema.parse(input);
    const bySeverity = /* @__PURE__ */ new Map();
    for (const opinion of validated.opinions) {
      const severity = opinion.severity.toLowerCase();
      if (!bySeverity.has(severity)) {
        bySeverity.set(severity, []);
      }
      bySeverity.get(severity).push(opinion.reasoning);
    }
    const lines = [];
    for (const [severity, reasonings] of bySeverity) {
      const count = reasonings.length;
      const plural = count === 1 ? "reviewer" : "reviewers";
      lines.push(`**${count} ${plural} identified as ${severity.toUpperCase()}:**`);
      lines.push("");
      for (let i = 0; i < reasonings.length; i++) {
        lines.push(`${i + 1}. ${reasonings[i]}`);
        lines.push("");
      }
    }
    const output = {
      anonymized: lines.join("\n")
    };
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}

// src/commands/score.ts
function scoreReasoning(reasoning) {
  let score2 = 0.5;
  const codeReference = /line\s+\d+|function\s+\w+|variable\s+\w+|method\s+\w+/i.test(
    reasoning
  );
  if (codeReference) score2 += 0.1;
  const technicalDepth = /memory|performance|security|thread|race\s+condition|deadlock|leak/i.test(reasoning);
  if (technicalDepth) score2 += 0.1;
  const evidenceBased = /because|since|given\s+that|due\s+to|as\s+a\s+result/i.test(
    reasoning
  );
  if (evidenceBased) score2 += 0.1;
  const specificExamples = /specifically|exactly|for\s+example|such\s+as|this\s+will\s+cause/i.test(reasoning);
  if (specificExamples) score2 += 0.1;
  const codeSnippets = /`[^`]+`|```/.test(reasoning);
  if (codeSnippets) score2 += 0.1;
  return {
    score: Math.min(score2, 1),
    breakdown: {
      codeReference,
      technicalDepth,
      evidenceBased,
      specificExamples,
      codeSnippets
    }
  };
}
function score(inputJson) {
  try {
    const input = JSON.parse(inputJson);
    const validated = ScoreInputSchema.parse(input);
    const output = scoreReasoning(validated.reasoning);
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}

// src/commands/early-stop.ts
function calculateSimilarity(str1, str2) {
  const words1 = new Set(
    str1.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
  );
  const words2 = new Set(
    str2.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
  );
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}
function checkEarlyStopping(participants, minRounds, similarityThreshold) {
  const allHaveMinRounds = participants.every((p) => p.rounds.length >= minRounds);
  if (!allHaveMinRounds) {
    return {
      shouldStop: false,
      reason: "Not all participants have completed minimum rounds"
    };
  }
  const similarities = {};
  let totalSimilarity = 0;
  let count = 0;
  for (const participant of participants) {
    if (participant.rounds.length < 2) continue;
    const lastRound = participant.rounds[participant.rounds.length - 1];
    const prevRound = participant.rounds[participant.rounds.length - 2];
    const similarity = calculateSimilarity(lastRound.reasoning, prevRound.reasoning);
    similarities[participant.reviewer] = similarity;
    totalSimilarity += similarity;
    count++;
  }
  if (count === 0) {
    return {
      shouldStop: false,
      reason: "No participants with multiple rounds"
    };
  }
  const avgSimilarity = totalSimilarity / count;
  if (avgSimilarity >= similarityThreshold) {
    return {
      shouldStop: true,
      reason: `Average similarity ${(avgSimilarity * 100).toFixed(1)}% >= ${(similarityThreshold * 100).toFixed(1)}% threshold`,
      similarities
    };
  }
  return {
    shouldStop: false,
    reason: `Average similarity ${(avgSimilarity * 100).toFixed(1)}% < ${(similarityThreshold * 100).toFixed(1)}% threshold`,
    similarities
  };
}
function earlyStop(inputJson) {
  try {
    const input = JSON.parse(inputJson);
    const validated = EarlyStopInputSchema.parse(input);
    const participants = validated.participants;
    const output = checkEarlyStopping(
      participants,
      validated.minRounds,
      validated.similarityThreshold
    );
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}

// src/commands/format-output.ts
var SEVERITY_ORDER = ["critical", "warning", "suggestion", "nitpick"];
var SEVERITY_EMOJI = {
  critical: "\u{1F534}",
  warning: "\u{1F7E1}",
  suggestion: "\u{1F535}",
  nitpick: "\u26AA"
};
function formatOutput(inputJson) {
  try {
    const input = JSON.parse(inputJson);
    const validated = FormatOutputInputSchema.parse(input);
    const consensusIssues = validated.consensusIssues || [];
    const debateIssues = validated.debateIssues || [];
    const debateResults = validated.debateResults || [];
    const lines = [];
    lines.push("# Code Review Report\n");
    const bySeverity = {
      critical: 0,
      warning: 0,
      suggestion: 0,
      nitpick: 0
    };
    for (const issue of consensusIssues) {
      bySeverity[issue.agreedSeverity]++;
    }
    for (const issue of debateResults) {
      if (issue.finalSeverity) {
        bySeverity[issue.finalSeverity]++;
      }
    }
    const totalIssues = Object.values(bySeverity).reduce((a, b) => a + b, 0);
    lines.push("## Summary\n");
    lines.push(`- **Total Issues:** ${totalIssues}`);
    lines.push(`- **Consensus Issues:** ${consensusIssues.length}`);
    lines.push(`- **Debated Issues:** ${debateResults.length}`);
    lines.push("");
    lines.push("### By Severity\n");
    for (const severity of SEVERITY_ORDER) {
      const count = bySeverity[severity];
      if (count > 0) {
        lines.push(
          `- ${SEVERITY_EMOJI[severity]} **${severity.toUpperCase()}:** ${count}`
        );
      }
    }
    lines.push("");
    if (consensusIssues.length > 0) {
      lines.push("## Consensus Issues\n");
      lines.push("_Issues with strong agreement among reviewers_\n");
      for (const severity of SEVERITY_ORDER) {
        const issuesOfSeverity = consensusIssues.filter(
          (i) => i.agreedSeverity === severity
        );
        if (issuesOfSeverity.length === 0) continue;
        lines.push(`### ${SEVERITY_EMOJI[severity]} ${severity.toUpperCase()}
`);
        for (const issue of issuesOfSeverity) {
          lines.push(
            `**${issue.issueGroup.file}:${issue.issueGroup.line}** - ${issue.issueGroup.title}`
          );
          lines.push(
            `- Confidence: ${(issue.confidence * 100).toFixed(0)}% (${issue.voters.length} reviewers)`
          );
          if (issue.suggestions && issue.suggestions.length > 0) {
            lines.push("- Suggestions:");
            for (const suggestion of issue.suggestions) {
              lines.push(`  - ${suggestion}`);
            }
          }
          lines.push("");
        }
      }
    }
    if (debateResults.length > 0) {
      lines.push("## Debated Issues\n");
      lines.push("_Issues resolved through multi-round debate_\n");
      for (const result of debateResults) {
        const severity = result.finalSeverity;
        lines.push(
          `### ${SEVERITY_EMOJI[severity]} ${result.issueGroup.file}:${result.issueGroup.line} - ${result.issueGroup.title}
`
        );
        lines.push(`**Final Severity:** ${severity.toUpperCase()}`);
        lines.push(`**Rounds:** ${result.rounds || 0}`);
        lines.push("");
        if (result.finalReasoning) {
          lines.push("**Final Reasoning:**");
          lines.push(result.finalReasoning);
          lines.push("");
        }
      }
    }
    if (debateIssues.length > debateResults.length) {
      const unresolvedCount = debateIssues.length - debateResults.length;
      lines.push("## Unresolved Issues\n");
      lines.push(`${unresolvedCount} issue(s) require further discussion.
`);
    }
    lines.push("---");
    lines.push("_Generated by CodeAgora Multi-Agent Review System_");
    const markdown = lines.join("\n");
    const output = {
      markdown,
      summary: {
        totalIssues,
        bySeverity,
        debatesHeld: debateResults.length
      }
    };
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}

// src/index.ts
var program = new Command();
program.name("agora").description("CodeAgora helper tools for deterministic review processing").version("1.0.0");
program.command("parse-reviews").description("Parse raw reviewer responses into structured ParsedReview objects").argument("<json>", "Input JSON string").action((json) => {
  const output = parseReviews(json);
  console.log(output);
});
program.command("voting").description("Apply 75% majority voting gate to separate consensus from debate issues").argument("<json>", "Input JSON string").action((json) => {
  const output = voting(json);
  console.log(output);
});
program.command("anonymize").description("Anonymize opponent opinions by severity grouping").argument("<json>", "Input JSON string").action((json) => {
  const output = anonymize(json);
  console.log(output);
});
program.command("score").description("Score reasoning quality using 5 trajectory patterns").argument("<json>", "Input JSON string").action((json) => {
  const output = score(json);
  console.log(output);
});
program.command("early-stop").description("Check if debate should stop early based on reasoning similarity").argument("<json>", "Input JSON string").action((json) => {
  const output = earlyStop(json);
  console.log(output);
});
program.command("format-output").description("Generate markdown report from review results").argument("<json>", "Input JSON string").action((json) => {
  const output = formatOutput(json);
  console.log(output);
});
program.parse();
//# sourceMappingURL=index.js.map