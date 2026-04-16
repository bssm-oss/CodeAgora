import {
  getDiscussionsDir,
  getReportPath,
  getSuggestionsPath,
  writeMarkdown
} from "./chunk-3NBKNWKX.js";
import {
  executeBackend
} from "./chunk-DLVBNTBJ.js";

// ../core/src/l2/writer.ts
import path from "path";
import { writeFile } from "fs/promises";
async function writeDiscussionRound(date, sessionId, discussionId, round) {
  const discussionsDir = getDiscussionsDir(date, sessionId);
  const discussionDir = path.join(discussionsDir, discussionId);
  const roundFile = path.join(discussionDir, `round-${round.round}.md`);
  const { ensureDir } = await import("./fs-2UZKAZUB.js");
  await ensureDir(discussionDir);
  const content = formatDiscussionRound(round);
  await writeMarkdown(roundFile, content);
}
async function writeDiscussionVerdict(date, sessionId, verdict) {
  const discussionsDir = getDiscussionsDir(date, sessionId);
  const discussionDir = path.join(discussionsDir, verdict.discussionId);
  const verdictFile = path.join(discussionDir, "verdict.md");
  const { ensureDir } = await import("./fs-2UZKAZUB.js");
  await ensureDir(discussionDir);
  const content = formatVerdict(verdict);
  await writeMarkdown(verdictFile, content);
}
async function writeSuggestions(date, sessionId, suggestions) {
  const suggestionsPath = getSuggestionsPath(date, sessionId);
  const lines = [];
  lines.push("# Suggestions");
  lines.push("");
  lines.push("These are low-priority suggestions that did not trigger Discussion.");
  lines.push("");
  for (const suggestion of suggestions) {
    lines.push(`## ${suggestion.issueTitle}`);
    lines.push("");
    lines.push(`**File:** ${suggestion.filePath}:${suggestion.lineRange[0]}-${suggestion.lineRange[1]}`);
    lines.push("");
    lines.push(suggestion.suggestion);
    lines.push("");
  }
  await writeMarkdown(suggestionsPath, lines.join("\n"));
}
async function writeModeratorReport(date, sessionId, report) {
  const reportPath = getReportPath(date, sessionId);
  const content = formatModeratorReport(report);
  await writeMarkdown(reportPath, content);
}
async function writeSupportersLog(date, sessionId, discussionId, supporters) {
  const discussionsDir = getDiscussionsDir(date, sessionId);
  const discussionDir = path.join(discussionsDir, discussionId);
  const supportersFile = path.join(discussionDir, "supporters.json");
  const { ensureDir } = await import("./fs-2UZKAZUB.js");
  await ensureDir(discussionDir);
  const models = supporters.map((s) => s.model).join("+");
  const personas = supporters.map((s) => {
    if (!s.assignedPersona) return "none";
    const basename = path.basename(s.assignedPersona, ".md");
    return basename;
  }).join("+");
  const log = {
    supporters: supporters.map((s) => ({
      id: s.id,
      model: s.model,
      persona: s.assignedPersona || null
    })),
    combination: `${models} / ${personas}`
  };
  await writeFile(supportersFile, JSON.stringify(log, null, 2), "utf-8");
}
function formatDiscussionRound(round) {
  const lines = [];
  lines.push(`# Round ${round.round}`);
  lines.push("");
  lines.push("## Moderator Prompt");
  lines.push("");
  lines.push(round.moderatorPrompt);
  lines.push("");
  lines.push("## Supporter Responses");
  lines.push("");
  for (const response of round.supporterResponses) {
    lines.push(`### ${response.supporterId} (${response.stance.toUpperCase()})`);
    lines.push("");
    lines.push(response.response);
    lines.push("");
  }
  return lines.join("\n");
}
function formatVerdict(verdict) {
  const lines = [];
  lines.push(`# Verdict: ${verdict.discussionId}`);
  lines.push("");
  lines.push(`**Final Severity:** ${verdict.finalSeverity}`);
  lines.push(`**Consensus Reached:** ${verdict.consensusReached ? "Yes" : "No (Escalated)"}`);
  lines.push(`**Rounds:** ${verdict.rounds}`);
  lines.push("");
  lines.push("## Reasoning");
  lines.push("");
  lines.push(verdict.reasoning);
  lines.push("");
  return lines.join("\n");
}
function formatModeratorReport(report) {
  const lines = [];
  lines.push("# Moderator Report");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Discussions:** ${report.summary.totalDiscussions}`);
  lines.push(`- **Resolved:** ${report.summary.resolved}`);
  lines.push(`- **Escalated to Head:** ${report.summary.escalated}`);
  lines.push("");
  lines.push("## Resolved Discussions");
  lines.push("");
  const resolved = report.discussions.filter((d) => d.consensusReached);
  for (const verdict of resolved) {
    lines.push(`### ${verdict.discussionId} - ${verdict.finalSeverity}`);
    lines.push("");
    lines.push(verdict.reasoning);
    lines.push("");
  }
  lines.push("## Escalated to Head");
  lines.push("");
  const escalated = report.discussions.filter((d) => !d.consensusReached);
  for (const verdict of escalated) {
    lines.push(`### ${verdict.discussionId} - ${verdict.finalSeverity}`);
    lines.push("");
    lines.push(verdict.reasoning);
    lines.push("");
  }
  lines.push("## Unconfirmed Issues");
  lines.push("");
  lines.push(`${report.unconfirmedIssues.length} issue(s) flagged by single reviewer.`);
  lines.push("");
  lines.push("## Suggestions");
  lines.push("");
  lines.push(`${report.suggestions.length} low-priority suggestion(s).`);
  lines.push("");
  return lines.join("\n");
}

// ../core/src/l2/objection.ts
async function checkForObjections(consensusDeclaration, supporterConfigs, previousRounds) {
  const objections = [];
  const results = await Promise.allSettled(
    supporterConfigs.map(
      (config) => executeSupporterObjectionCheck(config, consensusDeclaration, previousRounds)
    )
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.hasObjection) {
      objections.push({
        supporterId: result.value.supporterId,
        reasoning: result.value.reasoning
      });
    }
  }
  return {
    hasObjections: objections.length > 0,
    objections
  };
}
async function executeSupporterObjectionCheck(config, consensusDeclaration, previousRounds) {
  const prompt = buildObjectionPrompt(consensusDeclaration, previousRounds);
  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    prompt,
    timeout: config.timeout ?? 60,
    temperature: config.temperature
  });
  const hasObjection = parseObjectionResponse(response);
  return {
    supporterId: config.id,
    hasObjection,
    reasoning: response.trim()
  };
}
function buildObjectionPrompt(consensusDeclaration, previousRounds) {
  return `The moderator has declared consensus:

"${consensusDeclaration}"

Previous discussion rounds:
${previousRounds.map(
    (r, i) => `Round ${i + 1}:
${r.supporterResponses.map((s) => `- ${s.supporterId}: ${s.stance}
  ${s.response.substring(0, 200)}`).join("\n")}`
  ).join("\n\n")}

As a supporter, do you OBJECT to this consensus?
- If you object, explain why (new evidence, flawed reasoning, etc.)
- If you agree, say "NO OBJECTION"

Your response:`;
}
var CONSENT_PATTERNS = [/no objection/i, /i accept/i, /i agree/i, /agree with/i, /concur/i, /support the/i];
function parseObjectionResponse(response) {
  if (CONSENT_PATTERNS.some((p) => p.test(response))) return false;
  return !response.toLowerCase().includes("don't object");
}
function handleObjections(objections) {
  if (!objections.hasObjections) {
    return {
      shouldExtend: false,
      extensionReason: ""
    };
  }
  const reasons = objections.objections.map((o) => `${o.supporterId}: ${o.reasoning}`);
  return {
    shouldExtend: true,
    extensionReason: `Objections raised by ${objections.objections.length} supporter(s):
${reasons.join("\n")}`
  };
}

// ../core/src/l2/supporter-selector.ts
import { readFile } from "fs/promises";
import path3 from "path";

// ../shared/src/utils/path-validation.ts
import path2 from "path";

// ../shared/src/types/result.ts
function ok(data) {
  return { success: true, data };
}
function err(error) {
  return { success: false, error };
}

// ../shared/src/utils/path-validation.ts
function validateDiffPath(diffPath, options) {
  if (diffPath === "") {
    return err("Path must not be empty");
  }
  if (diffPath.includes("\0")) {
    return err("Path must not contain null bytes");
  }
  const parts = diffPath.split(/[\\/]/);
  if (parts.includes("..")) {
    return err(`Path traversal detected: "${diffPath}" contains ".." segments`);
  }
  const resolved = path2.resolve(diffPath);
  if (options?.allowedRoots !== void 0) {
    const roots = options.allowedRoots;
    if (roots.length === 0) {
      return err("No allowed roots configured; all paths are rejected");
    }
    const isUnderAllowedRoot = roots.some((root) => {
      const normalizedRoot = path2.resolve(root);
      return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path2.sep);
    });
    if (!isUnderAllowedRoot) {
      return err(
        `Path "${resolved}" is not under any allowed root: ${roots.join(", ")}`
      );
    }
  }
  return ok(resolved);
}

// ../core/src/l2/supporter-selector.ts
function selectSupporters(poolConfig) {
  const { pool, pickCount, devilsAdvocate, personaPool } = poolConfig;
  const enabledPool = pool.filter((s) => s.enabled);
  if (enabledPool.length < pickCount) {
    throw new Error(
      `Insufficient enabled supporters: ${enabledPool.length} available, ${pickCount} required`
    );
  }
  const selectedFromPool = randomPick(enabledPool, pickCount);
  const withPersonas = selectedFromPool.map((supporter) => ({
    ...supporter,
    assignedPersona: randomElement(personaPool)
  }));
  const supporters = [];
  if (devilsAdvocate.enabled) {
    supporters.push({
      ...devilsAdvocate,
      assignedPersona: devilsAdvocate.persona
    });
  }
  supporters.push(...withPersonas);
  return supporters;
}
function randomPick(array, count) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}
function randomElement(array) {
  if (array.length === 0) return void 0;
  return array[Math.floor(Math.random() * array.length)];
}
async function loadPersona(personaPath) {
  try {
    if (personaPath.startsWith("builtin:")) {
      const { getBuiltinPersona } = await import("./builtin-personas-2J5ABVSV.js");
      const content2 = getBuiltinPersona(personaPath.slice(8));
      if (content2) return content2;
      console.warn(`[Persona] Unknown built-in persona: ${personaPath.slice(8)}`);
      return "";
    }
    if (!personaPath.includes("/") && !personaPath.includes("\\") && !personaPath.endsWith(".md") && !personaPath.endsWith(".txt")) {
      return personaPath.trim();
    }
    if (path3.isAbsolute(personaPath)) {
      console.warn(`[Persona] Absolute path blocked: ${personaPath}`);
      return "";
    }
    const projectRoot = process.cwd();
    const result = validateDiffPath(personaPath, { allowedRoots: [projectRoot] });
    if (!result.success) {
      console.warn(`[Persona] Path validation failed: ${result.error}`);
      return "";
    }
    const content = await readFile(result.data, "utf-8");
    return content.trim();
  } catch (error) {
    console.warn(`[Persona] Failed to load ${personaPath}:`, error instanceof Error ? error.message : error);
    return "";
  }
}

// ../core/src/l2/moderator.ts
async function runModerator(input) {
  const { config, supporterPoolConfig, discussions, settings, date, sessionId, language, emitter, enrichedContext } = input;
  const results = await Promise.allSettled(
    discussions.map((d) => runDiscussion(d, config, supporterPoolConfig, settings, date, sessionId, language, emitter, enrichedContext))
  );
  const verdicts = [];
  const roundsPerDiscussion = {};
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      verdicts.push(result.value.verdict);
      roundsPerDiscussion[result.value.verdict.discussionId] = result.value.rounds;
    } else {
      const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const errorVerdict = {
        discussionId: discussions[i].id,
        filePath: discussions[i].filePath,
        lineRange: discussions[i].lineRange,
        finalSeverity: "DISMISSED",
        reasoning: `Discussion failed: ${errorMessage}`,
        consensusReached: false,
        rounds: 0
      };
      verdicts.push(errorVerdict);
      roundsPerDiscussion[discussions[i].id] = [];
    }
  }
  return {
    discussions: verdicts,
    roundsPerDiscussion,
    unconfirmedIssues: [],
    // Populated by caller
    suggestions: [],
    // Populated by caller
    summary: {
      totalDiscussions: discussions.length,
      resolved: verdicts.filter((v) => v.consensusReached).length,
      escalated: verdicts.filter((v) => !v.consensusReached).length
    }
  };
}
async function runDiscussion(discussion, moderatorConfig, supporterPoolConfig, settings, date, sessionId, language, emitter, enrichedContext) {
  const rounds = [];
  const enabledPoolL15 = supporterPoolConfig.pool.filter((s) => s.enabled);
  if (enabledPoolL15.length === 0 && !supporterPoolConfig.devilsAdvocate.enabled) {
    const skippedVerdict = {
      discussionId: discussion.id,
      filePath: discussion.filePath,
      lineRange: discussion.lineRange,
      finalSeverity: discussion.severity,
      reasoning: "No supporters available \u2014 discussion skipped",
      consensusReached: false,
      rounds: 0
    };
    await writeDiscussionVerdict(date, sessionId, skippedVerdict);
    return { verdict: skippedVerdict, rounds };
  }
  const selectedSupporters = selectSupporters(supporterPoolConfig);
  await writeSupportersLog(date, sessionId, discussion.id, selectedSupporters);
  emitter?.emitEvent({
    type: "discussion-start",
    discussionId: discussion.id,
    issueTitle: discussion.issueTitle,
    filePath: discussion.filePath,
    severity: discussion.severity
  });
  let objectionRoundsUsed = 0;
  const maxObjectionRounds = settings.maxObjectionRounds ?? 1;
  for (let roundNum = 1; roundNum <= settings.maxRounds; roundNum++) {
    emitter?.emitEvent({ type: "round-start", discussionId: discussion.id, roundNum });
    const round = await runRound(
      discussion,
      roundNum,
      moderatorConfig,
      selectedSupporters,
      language,
      enrichedContext
    );
    for (const resp of round.supporterResponses) {
      emitter?.emitEvent({
        type: "supporter-response",
        discussionId: discussion.id,
        roundNum,
        supporterId: resp.supporterId,
        stance: resp.stance,
        response: resp.response
      });
    }
    rounds.push(round);
    await writeDiscussionRound(date, sessionId, discussion.id, round);
    const consensus = checkConsensus(round, discussion, roundNum === settings.maxRounds);
    emitter?.emitEvent({
      type: "consensus-check",
      discussionId: discussion.id,
      roundNum,
      reached: consensus.reached,
      severity: consensus.severity
    });
    if (consensus.reached) {
      const isLastRound = roundNum === settings.maxRounds;
      if (!isLastRound && consensus.severity !== "DISMISSED" && objectionRoundsUsed < maxObjectionRounds) {
        const consensusDeclaration = `Consensus: ${consensus.severity} - ${consensus.reasoning}`;
        const objectionResult = await checkForObjections(
          consensusDeclaration,
          selectedSupporters,
          rounds
        );
        const objectionHandling = handleObjections(objectionResult);
        if (objectionHandling.shouldExtend) {
          objectionRoundsUsed++;
          const objectionRound = {
            round: roundNum * 100 + 1,
            // synthetic objection round (e.g., round 2 → 201, no collision at round >= 10)
            moderatorPrompt: `Objection check after consensus declaration: "${consensusDeclaration}"`,
            supporterResponses: objectionResult.objections.map((o) => ({
              supporterId: o.supporterId,
              response: o.reasoning,
              stance: "disagree"
            }))
          };
          await writeDiscussionRound(date, sessionId, discussion.id, objectionRound);
          process.stderr.write(`[Moderator] Objections raised, extending discussion: ${objectionHandling.extensionReason}
`);
          continue;
        }
      }
      const verdict2 = {
        discussionId: discussion.id,
        filePath: discussion.filePath,
        lineRange: discussion.lineRange,
        finalSeverity: consensus.severity,
        reasoning: consensus.reasoning,
        consensusReached: true,
        rounds: roundNum
      };
      await writeDiscussionVerdict(date, sessionId, verdict2);
      emitter?.emitEvent({
        type: "discussion-end",
        discussionId: discussion.id,
        finalSeverity: verdict2.finalSeverity,
        consensusReached: true,
        rounds: roundNum
      });
      return { verdict: verdict2, rounds };
    }
  }
  const finalVerdict = await moderatorForcedDecision(
    discussion,
    rounds,
    moderatorConfig
  );
  const verdict = {
    discussionId: discussion.id,
    filePath: discussion.filePath,
    lineRange: discussion.lineRange,
    finalSeverity: finalVerdict.severity,
    reasoning: finalVerdict.reasoning,
    consensusReached: false,
    rounds: settings.maxRounds
  };
  emitter?.emitEvent({
    type: "forced-decision",
    discussionId: discussion.id,
    severity: finalVerdict.severity,
    reasoning: finalVerdict.reasoning
  });
  await writeDiscussionVerdict(date, sessionId, verdict);
  emitter?.emitEvent({
    type: "discussion-end",
    discussionId: discussion.id,
    finalSeverity: verdict.finalSeverity,
    consensusReached: false,
    rounds: settings.maxRounds
  });
  return { verdict, rounds };
}
async function runRound(discussion, roundNum, moderatorConfig, selectedSupporters, language, enrichedContext) {
  const moderatorPrompt = buildModeratorPrompt(discussion, roundNum, language, enrichedContext);
  const supporterResults = await Promise.allSettled(
    selectedSupporters.map(
      (supporter) => executeSupporterResponse(supporter, discussion, moderatorPrompt)
    )
  );
  const supporterResponses = supporterResults.filter((r) => r.status === "fulfilled").map((r) => r.value);
  return {
    round: roundNum,
    moderatorPrompt,
    supporterResponses
  };
}
async function executeSupporterResponse(supporter, discussion, moderatorPrompt) {
  let personaContent = "";
  if (supporter.assignedPersona) {
    personaContent = await loadPersona(supporter.assignedPersona);
  }
  const basePrompt = `${moderatorPrompt}

## Your Task: Verify This Claim

A reviewer has made the claim described above. Your job is to **verify** it by attempting to disprove it first.

### Verification Process:
1. Read the actual code carefully
2. Try to find evidence that the claim is WRONG
3. Consider: Is this a standard pattern? Does the surrounding code handle this case?
4. Only agree if you genuinely cannot disprove the claim

### Response Format

**First line MUST be exactly one of:**
Stance: AGREE
Stance: DISAGREE
Stance: NEUTRAL

**Then provide your reasoning. BOTH agree and disagree require specific evidence:**

If DISAGREE:
- What specific evidence disproves the claim?
- Is this a known pattern that the reviewer misidentified?
- Does the surrounding context already handle the concern?

If AGREE:
- Why is the claim impossible to disprove?
- What specific code proves the issue exists?
- Why isn't this handled by surrounding context?

If NEUTRAL:
- What specific information is missing to make a judgment?

**Do NOT agree just because a reviewer said it. Do NOT disagree just to be contrarian. Base your judgment on the actual code and evidence provided.**`;
  const prompt = personaContent ? `${personaContent}

---

${basePrompt}` : basePrompt;
  const response = await executeBackend({
    backend: supporter.backend,
    model: supporter.model,
    provider: supporter.provider,
    prompt,
    timeout: supporter.timeout,
    temperature: supporter.temperature
  });
  const stance = parseStance(response);
  return {
    supporterId: supporter.id,
    response,
    stance
  };
}
function checkConsensus(round, discussion, isLastRound = false) {
  const supporters = round.supporterResponses;
  if (supporters.length === 0) {
    return { reached: false };
  }
  const allAgree = supporters.every((s) => s.stance === "agree");
  if (allAgree) {
    return {
      reached: true,
      severity: discussion.severity,
      reasoning: "All supporters agreed on the issue"
    };
  }
  const allDisagree = supporters.every((s) => s.stance === "disagree");
  if (allDisagree) {
    if (discussion.severity === "HARSHLY_CRITICAL") {
      return {
        reached: true,
        severity: "CRITICAL",
        reasoning: "All supporters rejected HARSHLY_CRITICAL claim \u2014 downgraded to CRITICAL for human review"
      };
    }
    return {
      reached: true,
      severity: "DISMISSED",
      reasoning: "All supporters rejected the issue"
    };
  }
  const agreeCount = supporters.filter((s) => s.stance === "agree").length;
  const disagreeCount = supporters.filter((s) => s.stance === "disagree").length;
  const decidingVotes = agreeCount + disagreeCount;
  if (decidingVotes > 0 && agreeCount > decidingVotes / 2) {
    return {
      reached: true,
      severity: discussion.severity,
      reasoning: `Majority consensus (${agreeCount}/${supporters.length} agree)`
    };
  }
  if (decidingVotes > 0 && disagreeCount > decidingVotes / 2) {
    if (discussion.severity === "HARSHLY_CRITICAL") {
      return {
        reached: true,
        severity: "CRITICAL",
        reasoning: `Majority rejected HARSHLY_CRITICAL claim (${disagreeCount}/${supporters.length} disagree) \u2014 downgraded to CRITICAL`
      };
    }
    return {
      reached: true,
      severity: "DISMISSED",
      reasoning: `Majority rejected (${disagreeCount}/${supporters.length} disagree)`
    };
  }
  if (isLastRound && decidingVotes > 0 && agreeCount === disagreeCount) {
    return {
      reached: true,
      severity: discussion.severity,
      reasoning: `Tie broken by forced decision on last round (${agreeCount} agree, ${disagreeCount} disagree)`
    };
  }
  return { reached: false };
}
async function moderatorForcedDecision(discussion, rounds, config) {
  const prompt = `You are the moderator. The discussion has reached max rounds without consensus.

Issue: ${discussion.issueTitle}
Severity claimed: ${discussion.severity}

Review all rounds and make a final decision:
- Severity (HARSHLY_CRITICAL, CRITICAL, WARNING, SUGGESTION, or DISMISSED)
- Reasoning

Rounds:
${rounds.map((r, i) => `Round ${i + 1}:
${r.supporterResponses.map((s) => `- ${s.supporterId}: ${s.stance} \u2014 ${s.response.substring(0, 200)}`).join("\n")}`).join("\n\n")}
`;
  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    provider: config.provider,
    prompt,
    timeout: config.timeout ?? 120,
    temperature: 0.2
  });
  return parseForcedDecision(response);
}
function buildEvidenceSection(discussion, isKo) {
  const content = discussion.evidenceContent;
  if (!content || content.length === 0) {
    return isKo ? `\uADFC\uAC70 \uBB38\uC11C: ${discussion.evidenceDocs.length}\uBA85\uC758 \uB9AC\uBDF0\uC5B4` : `Evidence documents: ${discussion.evidenceDocs.length} reviewer(s)`;
  }
  const sections = content.map((doc, i) => {
    if (isKo) {
      return [
        `**\uB9AC\uBDF0\uC5B4 ${i + 1}** (${doc.severity}):`,
        `\uBB38\uC81C: ${doc.problem}`,
        doc.evidence.length > 0 ? `\uADFC\uAC70: ${doc.evidence.join("; ")}` : "",
        doc.suggestion ? `\uC81C\uC548: ${doc.suggestion}` : ""
      ].filter(Boolean).join("\n");
    }
    return [
      `**Reviewer ${i + 1}** (${doc.severity}):`,
      `Problem: ${doc.problem}`,
      doc.evidence.length > 0 ? `Evidence: ${doc.evidence.join("; ")}` : "",
      doc.suggestion ? `Suggestion: ${doc.suggestion}` : ""
    ].filter(Boolean).join("\n");
  });
  const label = isKo ? "\uB9AC\uBDF0\uC5B4 \uADFC\uAC70" : "Reviewer Evidence";
  return `${label}:

${sections.join("\n\n")}`;
}
function buildStaticAnalysisSection(discussion, enrichedContext, isKo) {
  if (!enrichedContext) return "";
  const lines = [];
  const label = isKo ? "\uC815\uC801 \uBD84\uC11D \uC99D\uAC70" : "Static Analysis Evidence";
  const cls = enrichedContext.fileClassifications.get(discussion.filePath);
  if (cls) {
    lines.push(
      isKo ? `\uD30C\uC77C \uBD84\uB958: [${cls.toUpperCase()}] \u2014 ${getClassificationNote(cls, isKo)}` : `File classification: [${cls.toUpperCase()}] \u2014 ${getClassificationNote(cls, isKo)}`
    );
  }
  const fileDiags = enrichedContext.tscDiagnostics.filter((d) => d.file === discussion.filePath);
  if (fileDiags.length > 0) {
    lines.push(isKo ? `tsc \uC5D0\uB7EC (\uC774 \uD30C\uC77C):` : `tsc errors (this file):`);
    for (const d of fileDiags.slice(0, 5)) {
      lines.push(`  - line ${d.line}: TS${d.code} ${d.message}`);
    }
  } else {
    lines.push(isKo ? "tsc --noEmit: \uC774 \uD30C\uC77C\uC5D0 \uC5D0\uB7EC \uC5C6\uC74C" : "tsc --noEmit: 0 errors on this file");
  }
  for (const [, entry] of enrichedContext.impactAnalysis) {
    lines.push(
      isKo ? `${entry.symbol}() \u2014 ${entry.callerCount}\uAC1C \uD30C\uC77C\uC5D0\uC11C import` : `${entry.symbol}() \u2014 imported by ${entry.callerCount} file(s)`
    );
  }
  if (lines.length === 0) return "";
  return `
${label}:
${lines.map((l) => `- ${l}`).join("\n")}
`;
}
function getClassificationNote(cls, isKo) {
  const notes = {
    rename: ["\uC2DD\uBCC4\uC790 \uC774\uB984 \uBCC0\uACBD\uC774\uBA70 \uB85C\uC9C1 \uBCC0\uACBD \uC544\uB2D8", "identifier rename, not a logic change"],
    refactor: ["\uCF54\uB4DC \uAD6C\uC870 \uBCC0\uACBD\uC774\uBA70 \uB3D9\uC791 \uBCC0\uACBD \uC544\uB2D8", "code movement/restructuring, not a behavior change"],
    config: ["\uC124\uC815 \uD30C\uC77C \uBCC0\uACBD", "configuration file change"],
    test: ["\uD14C\uC2A4\uD2B8 \uD30C\uC77C \uBCC0\uACBD", "test file change"],
    docs: ["\uBB38\uC11C \uBCC0\uACBD", "documentation change"],
    dependency: ["\uC758\uC874\uC131 \uD30C\uC77C \uBCC0\uACBD", "dependency file change"],
    logic: ["\uB85C\uC9C1 \uBCC0\uACBD \u2014 \uC8FC\uC758 \uAE4A\uAC8C \uB9AC\uBDF0 \uD544\uC694", "logic change \u2014 review carefully"]
  };
  const [ko, en] = notes[cls] ?? ["", ""];
  return isKo ? ko : en;
}
function buildModeratorPrompt(discussion, roundNum, language, enrichedContext) {
  const isKo = language === "ko";
  const evidenceSection = buildEvidenceSection(discussion, isKo);
  const staticSection = buildStaticAnalysisSection(discussion, enrichedContext, isKo);
  if (isKo) {
    const snippetSection2 = discussion.codeSnippet && discussion.codeSnippet.trim() ? `\uCF54\uB4DC \uC2A4\uB2C8\uD3AB:
\`\`\`
${discussion.codeSnippet}
\`\`\`` : `\uCF54\uB4DC \uC2A4\uB2C8\uD3AB: (\uC0AC\uC6A9 \uBD88\uAC00 - \uD30C\uC77C\uC774 diff\uC5D0 \uC5C6\uC744 \uC218 \uC788\uC74C)`;
    return `\uB77C\uC6B4\uB4DC ${roundNum}

\uC774\uC288: ${discussion.issueTitle}
\uD30C\uC77C: ${discussion.filePath}:${discussion.lineRange[0]}-${discussion.lineRange[1]}
\uC8FC\uC7A5\uB41C \uC2EC\uAC01\uB3C4: ${discussion.severity}

${evidenceSection}

${snippetSection2}
${staticSection}
\uC774 \uC774\uC288\uC5D0 \uB300\uD55C \uD310\uB2E8\uC744 \uB0B4\uB824\uC8FC\uC138\uC694:
- \uB3D9\uC758: \uADFC\uAC70\uAC00 \uD0C0\uB2F9\uD569\uB2C8\uB2E4
- \uBC18\uB300: \uADFC\uAC70\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4
- \uC911\uB9BD: \uCD94\uAC00 \uC815\uBCF4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4

\uD310\uB2E8\uACFC \uC774\uC720\uB97C \uC81C\uC2DC\uD574 \uC8FC\uC138\uC694.`;
  }
  const snippetSection = discussion.codeSnippet && discussion.codeSnippet.trim() ? `Code snippet:
\`\`\`
${discussion.codeSnippet}
\`\`\`` : `Code snippet: (not available - file may not be in diff)`;
  return `Round ${roundNum}

Issue: ${discussion.issueTitle}
File: ${discussion.filePath}:${discussion.lineRange[0]}-${discussion.lineRange[1]}
Claimed Severity: ${discussion.severity}

${evidenceSection}

${snippetSection}
${staticSection}
Evaluate the evidence above and provide your verdict.`;
}
function parseStance(response) {
  const structuredMatch = response.match(
    /(?:stance|verdict|decision|judgment|판단)\s*[:=]\s*\*{0,2}\s*(agree|disagree|neutral|동의|반대|중립)/im
  );
  if (structuredMatch) {
    return normalizeStance(structuredMatch[1]);
  }
  const jsonMatch = response.match(/"stance"\s*:\s*"(agree|disagree|neutral)"/i);
  if (jsonMatch) {
    return jsonMatch[1].toLowerCase();
  }
  const firstLine = response.split("\n")[0].toUpperCase().trim();
  if (/\bDISAGREE\b/.test(firstLine)) return "disagree";
  if (/\bAGREE\b/.test(firstLine)) return "agree";
  if (/\bNEUTRAL\b/.test(firstLine)) return "neutral";
  const lines = response.split("\n");
  let agreeScore = 0;
  let disagreeScore = 0;
  for (const line of lines) {
    const isEmphasis = /^#{1,3}\s|^\*\*/.test(line.trim());
    const weight = isEmphasis ? 3 : 1;
    const lower = line.toLowerCase();
    const dMatches = (lower.match(/\bdisagree\b|반대/g) ?? []).length;
    const aMatches = (lower.match(/\bagree\b|동의/g) ?? []).length;
    disagreeScore += dMatches * weight;
    agreeScore += aMatches * weight;
  }
  if (agreeScore > disagreeScore) return "agree";
  if (disagreeScore > agreeScore) return "disagree";
  return "neutral";
}
function normalizeStance(raw) {
  const lower = raw.toLowerCase().trim();
  if (lower === "disagree" || lower === "\uBC18\uB300") return "disagree";
  if (lower === "agree" || lower === "\uB3D9\uC758") return "agree";
  return "neutral";
}
function parseForcedDecision(response) {
  const SEVERITY_ORDER = [
    "HARSHLY_CRITICAL",
    "CRITICAL",
    "WARNING",
    "SUGGESTION",
    "DISMISSED"
  ];
  const structuredMatch = response.match(
    /(?:severity|심각도)\s*[:=]\s*\*{0,2}\s*(harshly[_\s]critical|critical|warning|suggestion|dismissed?)/im
  );
  if (structuredMatch) {
    const normalized = normalizeSeverity(structuredMatch[1]);
    if (normalized) return { severity: normalized, reasoning: response.trim() };
  }
  const jsonMatch = response.match(
    /"severity"\s*:\s*"(HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION|DISMISSED)"/i
  );
  if (jsonMatch) {
    const normalized = normalizeSeverity(jsonMatch[1]);
    if (normalized) return { severity: normalized, reasoning: response.trim() };
  }
  const scanLines = response.split("\n").slice(0, 10).join("\n").toLowerCase();
  for (const sev of SEVERITY_ORDER) {
    const pattern = sev === "HARSHLY_CRITICAL" ? /\bharshly[_\s]critical\b/ : sev === "DISMISSED" ? /\bdismissed?\b/ : new RegExp(`\\b${sev.toLowerCase()}\\b`);
    if (pattern.test(scanLines)) {
      if (sev === "CRITICAL" && /\bnot\s+critical\b/.test(scanLines)) continue;
      return { severity: sev, reasoning: response.trim() };
    }
  }
  return { severity: "WARNING", reasoning: response.trim() };
}
function normalizeSeverity(raw) {
  const lower = raw.toLowerCase().replace(/\s+/g, "_").replace(/dismissed$/, "dismissed");
  const map = {
    harshly_critical: "HARSHLY_CRITICAL",
    critical: "CRITICAL",
    warning: "WARNING",
    suggestion: "SUGGESTION",
    dismissed: "DISMISSED"
  };
  return map[lower] ?? null;
}

export {
  validateDiffPath,
  writeSuggestions,
  writeModeratorReport,
  selectSupporters,
  loadPersona,
  runModerator,
  checkConsensus,
  parseStance,
  parseForcedDecision
};
