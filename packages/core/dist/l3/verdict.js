async function makeHeadVerdict(report, headConfig, mode, language) {
  if (headConfig?.enabled !== false && headConfig?.model) {
    try {
      return await llmVerdict(report, headConfig, language);
    } catch {
    }
  }
  return ruleBasedVerdict(report, mode);
}
async function llmVerdict(report, config, language) {
  const { executeBackend } = await import("../l1/backend.js");
  const prompt = buildHeadPrompt(report, language);
  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    provider: config.provider,
    prompt,
    timeout: config.timeout ?? 120,
    temperature: 0.2
  });
  return parseHeadResponse(response, report);
}
function buildHeadPrompt(report, language) {
  const isKo = language === "ko";
  const discussionSummary = report.discussions.map((d) => {
    const consensus = d.consensusReached ? isKo ? "\uD569\uC758 \uB3C4\uB2EC" : "consensus reached" : isKo ? "\uD569\uC758 \uBBF8\uB2EC" : "no consensus";
    const confStr = d.avgConfidence != null ? isKo ? `, \uC2E0\uB8B0\uB3C4: ${d.avgConfidence}%` : `, confidence: ${d.avgConfidence}%` : "";
    return `- [${d.finalSeverity}] ${d.discussionId} (${d.filePath}:${d.lineRange[0]}) \u2014 ${consensus}, ${d.rounds} ${isKo ? "\uB77C\uC6B4\uB4DC" : "round(s)"}${confStr}: ${d.reasoning}`;
  }).join("\n");
  const criticalDiscussions = report.discussions.filter(
    (d) => d.finalSeverity === "CRITICAL" || d.finalSeverity === "HARSHLY_CRITICAL"
  );
  const evidenceSummary = criticalDiscussions.map((d) => {
    const rounds = report.roundsPerDiscussion?.[d.discussionId] ?? [];
    const snippets = rounds.flatMap(
      (r) => r.supporterResponses.map((s) => {
        const text = s.response.slice(0, 200);
        return `  - [${s.stance}] ${s.supporterId}: ${text}${s.response.length > 200 ? "\u2026" : ""}`;
      })
    );
    if (snippets.length === 0) return null;
    return `- ${d.discussionId} (${d.filePath}:${d.lineRange[0]}):
${snippets.join("\n")}`;
  }).filter(Boolean).join("\n");
  const evidenceSection = evidenceSummary ? `
### ${isKo ? "CRITICAL+ \uD1A0\uB860 \uADFC\uAC70" : "CRITICAL+ Discussion Evidence"}
${evidenceSummary}
` : "";
  const unconfirmedSummary = report.unconfirmedIssues.length > 0 ? `
${isKo ? "\uBBF8\uD655\uC778 \uC774\uC288 (\uB2E8\uC77C \uB9AC\uBDF0\uC5B4)" : "Unconfirmed issues (single reviewer)"}: ${report.unconfirmedIssues.length}` : "";
  const suggestionsSummary = report.suggestions.length > 0 ? `
${isKo ? "\uC81C\uC548" : "Suggestions"}: ${report.suggestions.length}` : "";
  const countBySeverity = (sev) => report.discussions.filter((d) => d.finalSeverity === sev).length;
  const harshlyCount = countBySeverity("HARSHLY_CRITICAL");
  const criticalCount = countBySeverity("CRITICAL");
  const warningCount = countBySeverity("WARNING");
  const suggestionCount = report.suggestions?.length ?? 0;
  const unresolvedCount = report.discussions.filter((d) => !d.consensusReached).length;
  const quantSection = isKo ? `## \uC815\uB7C9 \uC694\uC57D
- HARSHLY_CRITICAL: ${harshlyCount}\uAC74
- CRITICAL: ${criticalCount}\uAC74
- WARNING: ${warningCount}\uAC74
- SUGGESTION: ${suggestionCount}\uAC74
- \uBBF8\uD574\uACB0 \uD1A0\uB860: ${unresolvedCount}\uAC74

## \uD310\uB2E8 \uC9C0\uCE68 (\uC2E0\uB8B0\uB3C4 \uAE30\uBC18 \uBD84\uB958 \uD544\uC218)
- CRITICAL+ \uC774\uC288\uB97C \uC2E0\uB8B0\uB3C4 \uAD6C\uAC04\uBCC4\uB85C \uBD84\uB958\uD560 \uAC83
- \uC2E0\uB8B0\uB3C4 >50% CRITICAL+: \uC2E4\uC81C \uBB38\uC81C \uAC00\uB2A5\uC131 \uB192\uC74C \u2014 REJECT \uACE0\uB824
- \uC2E0\uB8B0\uB3C4 \u226415% CRITICAL+: \uBBF8\uAC80\uC99D \u2014 NEEDS_HUMAN\uC73C\uB85C \uB77C\uC6B0\uD305, REJECT \uAE08\uC9C0
- \uBBF8\uD574\uACB0 \uD1A0\uB860\uC774 \uB0A8\uC544\uC788\uC73C\uBA74: NEEDS_HUMAN \uACE0\uB824
- 0% \uC2E0\uB8B0\uB3C4 \uC774\uC288\uB97C "\uCC28\uB2E8 \uC774\uC288"\uB85C \uD45C\uC2DC\uD560 \uACBD\uC6B0 \uBC18\uB4DC\uC2DC "\uBBF8\uAC80\uC99D" \uD45C\uAE30 \uD544\uC694
- \uBAA8\uB4E0 CRITICAL+ \uC774\uC288\uAC00 \uC800\uC2E0\uB8B0\uB3C4\uB77C\uBA74: REJECT \uB300\uC2E0 NEEDS_HUMAN + \uD2B8\uB9AC\uC544\uC9C0 \uAC00\uC774\uB4DC \uBC18\uD658` : `## Quantitative Summary
- HARSHLY_CRITICAL: ${harshlyCount} issues
- CRITICAL: ${criticalCount} issues
- WARNING: ${warningCount} issues
- SUGGESTION: ${suggestionCount} issues
- Unresolved discussions: ${unresolvedCount}

## Triage Guidance (#236)
- Group findings by confidence tier before deciding
- CRITICAL+ with confidence >50%: likely real \u2014 consider REJECT
- CRITICAL+ with confidence \u226415%: unverified \u2014 route to NEEDS_HUMAN, NOT REJECT
- Do NOT mark zero-confidence findings as "Blocking Issues" without flagging them as unverified
- If all critical findings are low-confidence, return NEEDS_HUMAN with triage guidance`;
  if (isKo) {
    return `\uB2F9\uC2E0\uC740 \uBA40\uD2F0 \uC5D0\uC774\uC804\uD2B8 \uCF54\uB4DC \uB9AC\uBDF0 \uC2DC\uC2A4\uD15C\uC758 \uCD5C\uC885 \uD310\uAD00\uC785\uB2C8\uB2E4. \uC5EC\uB7EC AI \uB9AC\uBDF0\uC5B4\uAC00 \uB3C5\uB9BD\uC801\uC73C\uB85C \uCF54\uB4DC \uBCC0\uACBD\uC744 \uAC80\uD1A0\uD55C \uD6C4 \uD1A0\uB860\uC744 \uC9C4\uD589\uD588\uC2B5\uB2C8\uB2E4. \uCD5C\uC885 \uD310\uACB0\uC744 \uB0B4\uB824\uC8FC\uC138\uC694.

## \uD1A0\uB860 \uACB0\uACFC

\uC804\uCCB4 \uD1A0\uB860: ${report.summary.totalDiscussions}
\uD574\uACB0\uB428 (\uD569\uC758): ${report.summary.resolved}
\uC5D0\uC2A4\uCEEC\uB808\uC774\uC158 (\uBBF8\uD569\uC758): ${report.summary.escalated}
${unconfirmedSummary}
${suggestionsSummary}

${quantSection}

### \uD1A0\uB860 \uC0C1\uC138
${discussionSummary || "(\uD1A0\uB860 \uC5C6\uC74C)"}
${evidenceSection}
## \uC791\uC5C5

\uAC01 \uD1A0\uB860\uC758 \uCD94\uB860 \uD488\uC9C8\uC744 \uD3C9\uAC00\uD558\uC138\uC694. \uC2EC\uAC01\uB3C4 \uC218\uCE58\uB9CC \uBCF4\uC9C0 \uB9C8\uC138\uC694:
1. CRITICAL/HARSHLY_CRITICAL \uACB0\uACFC\uAC00 \uCDA9\uBD84\uD55C \uADFC\uAC70\uB97C \uAC16\uCD94\uACE0 \uC788\uB098\uC694, \uC544\uB2C8\uBA74 \uCD94\uCE21\uC131\uC778\uAC00\uC694?
2. \uD1A0\uB860\uC5D0\uC11C \uAC70\uC9D3 \uAE0D\uC815(false positive)\uC774 \uBC1D\uD600\uC84C\uB098\uC694?
3. \uC5D0\uC2A4\uCEEC\uB808\uC774\uC158\uB41C \uC774\uC288\uAC00 \uC9C4\uC815\uC73C\uB85C \uBAA8\uD638\uD55C\uAC00\uC694, \uC544\uB2C8\uBA74 \uB2E8\uC21C\uD788 \uD1A0\uB860\uC774 \uBD80\uC871\uD55C \uAC74\uAC00\uC694?
4. \uC804\uBC18\uC801\uC73C\uB85C \uCF54\uB4DC \uBCC0\uACBD\uC774 \uBCD1\uD569\uD558\uAE30 \uC548\uC804\uD55C\uAC00\uC694?

## \uC751\uB2F5 \uD615\uC2DD

\uC815\uD655\uD788 \uB2E4\uC74C \uD615\uC2DD\uC73C\uB85C \uC751\uB2F5\uD558\uC138\uC694:

DECISION: ACCEPT | REJECT | NEEDS_HUMAN
REASONING: <\uADFC\uAC70 \uD488\uC9C8\uC744 \uBC14\uD0D5\uC73C\uB85C \uD55C \uACB0\uC815 \uC124\uBA85 (\uD55C \uB2E8\uB77D)>
QUESTIONS: <\uC778\uAC04 \uB9AC\uBDF0\uC5B4\uB97C \uC704\uD55C \uC9C8\uBB38 \uBAA9\uB85D (\uC27C\uD45C \uAD6C\uBD84), \uC5C6\uC73C\uBA74 "none">
`;
  }
  return `You are the Head Judge in a multi-agent code review system. Multiple AI reviewers independently reviewed a code change, then debated their findings. You must now deliver the final verdict.

## Discussion Results

Total discussions: ${report.summary.totalDiscussions}
Resolved (consensus): ${report.summary.resolved}
Escalated (no consensus): ${report.summary.escalated}
${unconfirmedSummary}
${suggestionsSummary}

${quantSection}

### Discussion Details
${discussionSummary || "(no discussions)"}
${evidenceSection}
## Your Task

Evaluate the quality of reasoning in each discussion, not just severity counts. Consider:
1. Are the CRITICAL/HARSHLY_CRITICAL findings well-evidenced or speculative?
2. Did the debate reveal false positives that should be dismissed?
3. Are escalated issues genuinely ambiguous or just under-discussed?
4. Is the overall code change safe to merge?

## Response Format

Respond with EXACTLY this format:

DECISION: ACCEPT | REJECT | NEEDS_HUMAN
REASONING: <one paragraph explaining your decision based on the evidence quality>
QUESTIONS: <comma-separated list of open questions for human reviewers, or "none">
`;
}
function parseHeadResponse(response, report) {
  const decisionMatch = response.match(/DECISION:\s*(ACCEPT|REJECT|NEEDS_HUMAN)/i);
  const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=\nQUESTIONS:|$)/is);
  const questionsMatch = response.match(/QUESTIONS:\s*(.+)/is);
  if (!decisionMatch) {
    console.warn("[Head] Failed to parse LLM response, falling back to rule-based verdict");
    return ruleBasedVerdict(report);
  }
  const decision = decisionMatch[1].toUpperCase();
  const reasoning = reasoningMatch?.[1]?.trim() || "LLM verdict without detailed reasoning.";
  let questionsForHuman;
  if (questionsMatch) {
    const raw = questionsMatch[1].trim();
    if (raw.toLowerCase() !== "none" && raw.length > 0) {
      questionsForHuman = raw.split(/[,\n]/).map((q) => q.trim()).filter((q) => q.length > 0);
    }
  }
  return {
    decision,
    reasoning,
    questionsForHuman: questionsForHuman?.length ? questionsForHuman : void 0
  };
}
const ZERO_CONFIDENCE_THRESHOLD = 15;
function ruleBasedVerdict(report, mode) {
  const allCritical = report.discussions.filter(
    (d) => d.finalSeverity === "CRITICAL" || d.finalSeverity === "HARSHLY_CRITICAL"
  );
  const criticalIssues = allCritical.filter(
    (d) => d.avgConfidence == null || d.avgConfidence > ZERO_CONFIDENCE_THRESHOLD
  );
  const unverifiedCritical = allCritical.filter(
    (d) => d.avgConfidence != null && d.avgConfidence <= ZERO_CONFIDENCE_THRESHOLD
  );
  const escalatedIssues = report.discussions.filter((d) => !d.consensusReached);
  if (mode === "strict") {
    const warningIssues = report.discussions.filter((d) => d.finalSeverity === "WARNING");
    if (warningIssues.length >= 3) {
      return {
        decision: "NEEDS_HUMAN",
        reasoning: `Strict mode: ${warningIssues.length} warning-level issue(s) found. Review each to confirm they are acceptable.`,
        questionsForHuman: [
          ...warningIssues.slice(0, 3).map(
            (d) => `Check: ${d.discussionId} (${d.filePath}:${d.lineRange[0]}) \u2014 WARNING`
          ),
          ...warningIssues.length > 3 ? [`...and ${warningIssues.length - 3} more warnings`] : [],
          ...escalatedIssues.length > 0 ? [`${escalatedIssues.length} unresolved discussion(s) also need judgment`] : []
        ]
      };
    }
  }
  if (criticalIssues.length > 0) {
    const unverifiedNote = unverifiedCritical.length > 0 ? ` Additionally, ${unverifiedCritical.length} low-confidence critical finding(s) need verification.` : "";
    const questions = [
      ...escalatedIssues.length > 0 ? [`${escalatedIssues.length} issue(s) need human judgment`] : [],
      ...unverifiedCritical.length > 0 ? [`${unverifiedCritical.length} low-confidence finding(s) need verification: ${unverifiedCritical.map((d) => d.discussionId).join(", ")}`] : []
    ];
    return {
      decision: "REJECT",
      reasoning: `Found ${criticalIssues.length} critical issue(s) that must be fixed before merging.${unverifiedNote}`,
      questionsForHuman: questions.length > 0 ? questions : void 0
    };
  }
  if (unverifiedCritical.length > 0) {
    return {
      decision: "NEEDS_HUMAN",
      reasoning: `Found ${unverifiedCritical.length} critical finding(s) with very low confidence (\u2264${ZERO_CONFIDENCE_THRESHOLD}%). These may be false positives \u2014 human verification required before rejecting.`,
      questionsForHuman: unverifiedCritical.map(
        (d) => `Verify: ${d.discussionId} (${d.filePath}:${d.lineRange[0]}) \u2014 ${d.finalSeverity}, ${d.avgConfidence}% confidence`
      )
    };
  }
  if (escalatedIssues.length > 0) {
    const fileList = escalatedIssues.map((d) => `${d.filePath}:${d.lineRange[0]}`).slice(0, 5).join(", ");
    return {
      decision: "NEEDS_HUMAN",
      reasoning: `${escalatedIssues.length} issue(s) could not reach reviewer consensus after max discussion rounds. Human review needed at: ${fileList}${escalatedIssues.length > 5 ? ` (+${escalatedIssues.length - 5} more)` : ""}.`,
      questionsForHuman: escalatedIssues.map(
        (d) => `Verify ${d.discussionId} (${d.filePath}:${d.lineRange[0]}-${d.lineRange[1]}): ${d.finalSeverity} \u2014 reviewers disagreed on severity/validity`
      )
    };
  }
  return {
    decision: "ACCEPT",
    reasoning: "All issues resolved or deemed acceptable. Code is ready to merge."
  };
}
function scanUnconfirmedQueue(unconfirmed) {
  const promoted = unconfirmed.filter(
    (doc) => doc.severity === "CRITICAL" || doc.severity === "HARSHLY_CRITICAL"
  );
  const dismissed = unconfirmed.filter(
    (doc) => doc.severity !== "CRITICAL" && doc.severity !== "HARSHLY_CRITICAL"
  );
  return { promoted, dismissed };
}
export {
  makeHeadVerdict,
  scanUnconfirmedQueue
};
