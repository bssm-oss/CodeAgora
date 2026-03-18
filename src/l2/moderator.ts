/**
 * L2 Moderator - Discussion Orchestration
 * Manages discussion lifecycle, coordinates supporters, writes final report
 */

import type { Discussion, DiscussionRound, DiscussionVerdict, ModeratorReport } from '../types/core.js';
import type { ModeratorConfig, DiscussionSettings, SupporterPoolConfig, AgentConfig } from '../types/config.js';
import { executeBackend } from '../l1/backend.js';
import { writeDiscussionRound, writeDiscussionVerdict, writeSupportersLog } from './writer.js';
import { checkForObjections, handleObjections } from './objection.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { validateDiffPath } from '../utils/path-validation.js';

// ============================================================================
// Supporter Selection
// ============================================================================

export interface SelectedSupporter extends AgentConfig {
  assignedPersona?: string;
}

/**
 * Select supporters from pool with random persona assignment
 */
export function selectSupporters(
  poolConfig: SupporterPoolConfig
): SelectedSupporter[] {
  const { pool, pickCount, devilsAdvocate, personaPool } = poolConfig;

  // Filter enabled supporters from pool
  const enabledPool = pool.filter((s) => s.enabled);

  if (enabledPool.length < pickCount) {
    throw new Error(
      `Insufficient enabled supporters: ${enabledPool.length} available, ${pickCount} required`
    );
  }

  // Random pick without duplicates
  const selectedFromPool = randomPick(enabledPool, pickCount);

  // Assign random personas to selected supporters
  const withPersonas = selectedFromPool.map((supporter) => ({
    ...supporter,
    assignedPersona: randomElement(personaPool),
  }));

  // Add Devil's Advocate (with its fixed persona if set)
  const supporters: SelectedSupporter[] = [];

  if (devilsAdvocate.enabled) {
    supporters.push({
      ...devilsAdvocate,
      assignedPersona: devilsAdvocate.persona,
    });
  }

  supporters.push(...withPersonas);

  return supporters;
}

/**
 * Random pick N elements from array without duplicates (Fisher-Yates)
 */
function randomPick<T>(array: T[], count: number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/**
 * Random pick one element from array
 */
function randomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================================================
// Persona Loading
// ============================================================================

/**
 * Load persona file content.
 * Uses validateDiffPath for robust path traversal prevention
 * (null byte check, ".." segment detection, allowed-root containment).
 */
export async function loadPersona(personaPath: string): Promise<string> {
  try {
    // Block absolute paths explicitly before validation
    if (path.isAbsolute(personaPath)) {
      console.warn(`[Persona] Absolute path blocked: ${personaPath}`);
      return '';
    }

    // Validate using shared utility — checks null bytes, "..", and containment
    const projectRoot = process.cwd();
    const result = validateDiffPath(personaPath, { allowedRoots: [projectRoot] });
    if (!result.success) {
      console.warn(`[Persona] Path validation failed: ${result.error}`);
      return '';
    }

    const content = await readFile(result.data, 'utf-8');
    return content.trim();
  } catch (error) {
    console.warn(`[Persona] Failed to load ${personaPath}:`, error instanceof Error ? error.message : error);
    return '';
  }
}

// ============================================================================
// Moderator Orchestration
// ============================================================================

export interface ModeratorInput {
  config: ModeratorConfig;
  supporterPoolConfig: SupporterPoolConfig;
  discussions: Discussion[];
  settings: DiscussionSettings;
  date: string;
  sessionId: string;
  language?: 'en' | 'ko';
}

/**
 * Run all discussions and generate final report
 */
export async function runModerator(input: ModeratorInput): Promise<ModeratorReport> {
  const { config, supporterPoolConfig, discussions, settings, date, sessionId, language } = input;

  const results = await Promise.allSettled(
    discussions.map((d) => runDiscussion(d, config, supporterPoolConfig, settings, date, sessionId, language))
  );

  const verdicts: DiscussionVerdict[] = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Rejected: produce an error verdict so the pipeline continues
    const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return {
      discussionId: discussions[i].id,
      filePath: discussions[i].filePath,
      lineRange: discussions[i].lineRange,
      finalSeverity: 'DISMISSED' as const,
      reasoning: `Discussion failed: ${errorMessage}`,
      consensusReached: false,
      rounds: 0,
    };
  });

  return {
    discussions: verdicts,
    unconfirmedIssues: [], // Populated by caller
    suggestions: [], // Populated by caller
    summary: {
      totalDiscussions: discussions.length,
      resolved: verdicts.filter((v) => v.consensusReached).length,
      escalated: verdicts.filter((v) => !v.consensusReached).length,
    },
  };
}

// ============================================================================
// Discussion Execution
// ============================================================================

async function runDiscussion(
  discussion: Discussion,
  moderatorConfig: ModeratorConfig,
  supporterPoolConfig: SupporterPoolConfig,
  settings: DiscussionSettings,
  date: string,
  sessionId: string,
  language?: 'en' | 'ko'
): Promise<DiscussionVerdict> {
  const rounds: DiscussionRound[] = [];

  // HARSHLY_CRITICAL: Skip discussion, escalate immediately
  if (discussion.severity === 'HARSHLY_CRITICAL') {
    const verdict: DiscussionVerdict = {
      discussionId: discussion.id,
      filePath: discussion.filePath,
      lineRange: discussion.lineRange,
      finalSeverity: 'HARSHLY_CRITICAL',
      reasoning: 'HARSHLY_CRITICAL issues are escalated to Head without discussion',
      consensusReached: false, // Escalated
      rounds: 0,
    };

    // Write verdict file
    await writeDiscussionVerdict(date, sessionId, verdict);

    return verdict;
  }

  // L-15: If no supporters are enabled and devil's advocate is off, skip discussion
  const enabledPoolL15 = supporterPoolConfig.pool.filter((s) => s.enabled);
  if (enabledPoolL15.length === 0 && !supporterPoolConfig.devilsAdvocate.enabled) {
    const skippedVerdict: DiscussionVerdict = {
      discussionId: discussion.id,
      filePath: discussion.filePath,
      lineRange: discussion.lineRange,
      finalSeverity: discussion.severity as DiscussionVerdict['finalSeverity'],
      reasoning: 'No supporters available — discussion skipped',
      consensusReached: false,
      rounds: 0,
    };
    await writeDiscussionVerdict(date, sessionId, skippedVerdict);
    return skippedVerdict;
  }

  // Select supporters for this discussion
  const selectedSupporters = selectSupporters(supporterPoolConfig);

  // Log supporter combination
  await writeSupportersLog(date, sessionId, discussion.id, selectedSupporters);

  // Track objection rounds to prevent infinite loops
  let objectionRoundsUsed = 0;
  const maxObjectionRounds = 1;

  // Run up to maxRounds
  for (let roundNum = 1; roundNum <= settings.maxRounds; roundNum++) {
    const round = await runRound(
      discussion,
      roundNum,
      moderatorConfig,
      selectedSupporters,
      language
    );

    rounds.push(round);

    // Write round file
    await writeDiscussionRound(date, sessionId, discussion.id, round);

    // Check for consensus; on last round, force decision on tie
    const consensus = checkConsensus(round, discussion, roundNum === settings.maxRounds);
    if (consensus.reached) {
      // Only run objection protocol on agree-consensus (not dismiss)
      if (consensus.severity !== 'DISMISSED' && objectionRoundsUsed < maxObjectionRounds) {
        const consensusDeclaration = `Consensus: ${consensus.severity} - ${consensus.reasoning}`;
        const objectionResult = await checkForObjections(
          consensusDeclaration,
          selectedSupporters,
          rounds
        );
        const objectionHandling = handleObjections(objectionResult);

        if (objectionHandling.shouldExtend) {
          objectionRoundsUsed++;

          // Write synthetic objection round for logging
          const objectionRound: DiscussionRound = {
            round: roundNum * 100 + 1, // synthetic objection round (e.g., round 2 → 201, no collision at round >= 10)
            moderatorPrompt: `Objection check after consensus declaration: "${consensusDeclaration}"`,
            supporterResponses: objectionResult.objections.map((o) => ({
              supporterId: o.supporterId,
              response: o.reasoning,
              stance: 'disagree' as const,
            })),
          };
          await writeDiscussionRound(date, sessionId, discussion.id, objectionRound);

          console.log(`[Moderator] Objections raised, extending discussion: ${objectionHandling.extensionReason}`);
          // Continue to next round — consensus was premature
          continue;
        }
      }

      const verdict: DiscussionVerdict = {
        discussionId: discussion.id,
        filePath: discussion.filePath,
        lineRange: discussion.lineRange,
        finalSeverity: consensus.severity!,
        reasoning: consensus.reasoning!,
        consensusReached: true,
        rounds: roundNum,
      };

      // Write verdict file
      await writeDiscussionVerdict(date, sessionId, verdict);

      return verdict;
    }
  }

  // Max rounds reached, moderator forces decision
  const finalVerdict = await moderatorForcedDecision(
    discussion,
    rounds,
    moderatorConfig
  );

  const verdict: DiscussionVerdict = {
    discussionId: discussion.id,
    filePath: discussion.filePath,
    lineRange: discussion.lineRange,
    finalSeverity: finalVerdict.severity,
    reasoning: finalVerdict.reasoning,
    consensusReached: false,
    rounds: settings.maxRounds,
  };

  // Write verdict file
  await writeDiscussionVerdict(date, sessionId, verdict);

  return verdict;
}

// ============================================================================
// Round Execution
// ============================================================================

async function runRound(
  discussion: Discussion,
  roundNum: number,
  moderatorConfig: ModeratorConfig,
  selectedSupporters: SelectedSupporter[],
  language?: 'en' | 'ko'
): Promise<DiscussionRound> {
  // Moderator prompts the discussion
  const moderatorPrompt = buildModeratorPrompt(discussion, roundNum, language);

  // Supporters respond in parallel with graceful degradation
  const supporterResults = await Promise.allSettled(
    selectedSupporters.map((supporter) =>
      executeSupporterResponse(supporter, discussion, moderatorPrompt)
    )
  );

  const supporterResponses = supporterResults
    .filter((r): r is PromiseFulfilledResult<{ supporterId: string; response: string; stance: 'agree' | 'disagree' | 'neutral' }> => r.status === 'fulfilled')
    .map((r) => r.value);

  return {
    round: roundNum,
    moderatorPrompt,
    supporterResponses,
  };
}

async function executeSupporterResponse(
  supporter: SelectedSupporter,
  discussion: Discussion,
  moderatorPrompt: string
): Promise<{ supporterId: string; response: string; stance: 'agree' | 'disagree' | 'neutral' }> {
  // Load persona if assigned
  let personaContent = '';
  if (supporter.assignedPersona) {
    personaContent = await loadPersona(supporter.assignedPersona);
  }

  // Build prompt with persona
  const basePrompt = `${moderatorPrompt}\n\nProvide your verdict:\n- AGREE: Evidence is valid\n- DISAGREE: Evidence is flawed\n- NEUTRAL: Needs more information\n\nProvide your stance and reasoning.`;

  const prompt = personaContent
    ? `${personaContent}\n\n---\n\n${basePrompt}`
    : basePrompt;

  const response = await executeBackend({
    backend: supporter.backend,
    model: supporter.model,
    provider: supporter.provider,
    prompt,
    timeout: supporter.timeout,
  });

  const stance = parseStance(response);

  return {
    supporterId: supporter.id,
    response,
    stance,
  };
}

// ============================================================================
// Consensus Checking
// ============================================================================

interface ConsensusResult {
  reached: boolean;
  severity?: 'HARSHLY_CRITICAL' | 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED';
  reasoning?: string;
}

function checkConsensus(round: DiscussionRound, discussion: Discussion, isLastRound = false): ConsensusResult {
  const supporters = round.supporterResponses;

  // No consensus possible with zero participants
  if (supporters.length === 0) {
    return { reached: false };
  }

  // All agree — preserve the discussion's original severity
  const allAgree = supporters.every((s) => s.stance === 'agree');
  if (allAgree) {
    return {
      reached: true,
      severity: discussion.severity as ConsensusResult['severity'],
      reasoning: 'All supporters agreed on the issue',
    };
  }

  // All disagree
  const allDisagree = supporters.every((s) => s.stance === 'disagree');
  if (allDisagree) {
    return {
      reached: true,
      severity: 'DISMISSED',
      reasoning: 'All supporters rejected the issue',
    };
  }

  // Majority agree (>50% excluding neutrals) — preserve original severity
  const agreeCount = supporters.filter((s) => s.stance === 'agree').length;
  const disagreeCount = supporters.filter((s) => s.stance === 'disagree').length;
  const decidingVotes = agreeCount + disagreeCount;

  if (decidingVotes > 0 && agreeCount > decidingVotes / 2) {
    return {
      reached: true,
      severity: discussion.severity as ConsensusResult['severity'],
      reasoning: `Majority consensus (${agreeCount}/${supporters.length} agree)`,
    };
  }

  if (decidingVotes > 0 && disagreeCount > decidingVotes / 2) {
    return {
      reached: true,
      severity: 'DISMISSED',
      reasoning: `Majority rejected (${disagreeCount}/${supporters.length} disagree)`,
    };
  }

  // Tie (agree === disagree) on last round: forced decision — preserve original severity
  if (isLastRound && decidingVotes > 0 && agreeCount === disagreeCount) {
    return {
      reached: true,
      severity: discussion.severity as ConsensusResult['severity'],
      reasoning: `Tie broken by forced decision on last round (${agreeCount} agree, ${disagreeCount} disagree)`,
    };
  }

  return { reached: false };
}

// ============================================================================
// Moderator Forced Decision
// ============================================================================

async function moderatorForcedDecision(
  discussion: Discussion,
  rounds: DiscussionRound[],
  config: ModeratorConfig
): Promise<{ severity: 'HARSHLY_CRITICAL' | 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED'; reasoning: string }> {
  const prompt = `You are the moderator. The discussion has reached max rounds without consensus.

Issue: ${discussion.issueTitle}
Severity claimed: ${discussion.severity}

Review all rounds and make a final decision:
- Severity (HARSHLY_CRITICAL, CRITICAL, WARNING, SUGGESTION, or DISMISSED)
- Reasoning

Rounds:
${rounds.map((r, i) => `Round ${i + 1}:\n${r.supporterResponses.map(s => `- ${s.supporterId}: ${s.stance} — ${s.response.substring(0, 200)}`).join('\n')}`).join('\n\n')}
`;

  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    provider: config.provider,
    prompt,
    timeout: 120,
  });

  return parseForcedDecision(response);
}

// ============================================================================
// Helpers
// ============================================================================

function buildModeratorPrompt(discussion: Discussion, roundNum: number, language?: 'en' | 'ko'): string {
  const isKo = language === 'ko';

  if (isKo) {
    const snippetSection = discussion.codeSnippet && discussion.codeSnippet.trim()
      ? `코드 스니펫:
\`\`\`
${discussion.codeSnippet}
\`\`\``
      : `코드 스니펫: (사용 불가 - 파일이 diff에 없을 수 있음)`;

    return `라운드 ${roundNum}

이슈: ${discussion.issueTitle}
파일: ${discussion.filePath}:${discussion.lineRange[0]}-${discussion.lineRange[1]}
주장된 심각도: ${discussion.severity}

근거 문서: ${discussion.evidenceDocs.length}명의 리뷰어

${snippetSection}

이 이슈에 대한 판단을 내려주세요:
- 동의: 근거가 타당합니다
- 반대: 근거가 부족합니다
- 중립: 추가 정보가 필요합니다

판단과 이유를 제시해 주세요.`;
  }

  const snippetSection = discussion.codeSnippet && discussion.codeSnippet.trim()
    ? `Code snippet:
\`\`\`
${discussion.codeSnippet}
\`\`\``
    : `Code snippet: (not available - file may not be in diff)`;

  return `Round ${roundNum}

Issue: ${discussion.issueTitle}
File: ${discussion.filePath}:${discussion.lineRange[0]}-${discussion.lineRange[1]}
Claimed Severity: ${discussion.severity}

Evidence documents: ${discussion.evidenceDocs.length} reviewer(s)

${snippetSection}

Evaluate the evidence and provide your verdict.`;
}

type Stance = 'agree' | 'disagree' | 'neutral';
type Severity = 'HARSHLY_CRITICAL' | 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED';

/**
 * Parse supporter stance from LLM response.
 *
 * Priority:
 * 1. Structured patterns: "Stance: AGREE", "**Verdict:** disagree", JSON "stance": "agree"
 * 2. First-line keyword (DISAGREE checked before AGREE to avoid substring match)
 * 3. Weighted section scan (headings and bold markers get extra weight)
 * 4. Default: neutral
 */
export function parseStance(response: string): Stance {
  // P1: Structured field patterns (case-insensitive)
  const structuredMatch = response.match(
    /(?:stance|verdict|decision|judgment|판단)\s*[:=]\s*\*{0,2}\s*(agree|disagree|neutral|동의|반대|중립)/im
  );
  if (structuredMatch) {
    return normalizeStance(structuredMatch[1]);
  }

  // P1b: JSON-like pattern: "stance": "agree"
  const jsonMatch = response.match(/"stance"\s*:\s*"(agree|disagree|neutral)"/i);
  if (jsonMatch) {
    return jsonMatch[1].toLowerCase() as Stance;
  }

  // P2: First-line explicit keyword (check DISAGREE before AGREE)
  const firstLine = response.split('\n')[0].toUpperCase().trim();
  if (/\bDISAGREE\b/.test(firstLine)) return 'disagree';
  if (/\bAGREE\b/.test(firstLine)) return 'agree';
  if (/\bNEUTRAL\b/.test(firstLine)) return 'neutral';

  // P3: Weighted keyword scan — headings/bold get 3x weight
  const lines = response.split('\n');
  let agreeScore = 0;
  let disagreeScore = 0;

  for (const line of lines) {
    const isEmphasis = /^#{1,3}\s|^\*\*/.test(line.trim());
    const weight = isEmphasis ? 3 : 1;
    const lower = line.toLowerCase();

    // Count word-boundary matches; \bagree\b won't match inside "disagree"
    const dMatches = (lower.match(/\bdisagree\b|반대/g) ?? []).length;
    const aMatches = (lower.match(/\bagree\b|동의/g) ?? []).length;

    disagreeScore += dMatches * weight;
    agreeScore += aMatches * weight;
  }

  if (agreeScore > disagreeScore) return 'agree';
  if (disagreeScore > agreeScore) return 'disagree';
  return 'neutral';
}

function normalizeStance(raw: string): Stance {
  const lower = raw.toLowerCase().trim();
  if (lower === 'disagree' || lower === '반대') return 'disagree';
  if (lower === 'agree' || lower === '동의') return 'agree';
  return 'neutral';
}

/**
 * Parse moderator forced decision from LLM response.
 *
 * Priority:
 * 1. Structured patterns: "Severity: WARNING", "**Severity:** CRITICAL"
 * 2. JSON-like: "severity": "WARNING"
 * 3. Keyword scan on full response (most specific first)
 * 4. Default: WARNING
 */
export function parseForcedDecision(response: string): { severity: Severity; reasoning: string } {
  const SEVERITY_ORDER: Severity[] = [
    'HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION', 'DISMISSED',
  ];

  // P1: Structured field pattern
  const structuredMatch = response.match(
    /(?:severity|심각도)\s*[:=]\s*\*{0,2}\s*(harshly[_\s]critical|critical|warning|suggestion|dismissed?)/im
  );
  if (structuredMatch) {
    const normalized = normalizeSeverity(structuredMatch[1]);
    if (normalized) return { severity: normalized, reasoning: response.trim() };
  }

  // P1b: JSON-like pattern
  const jsonMatch = response.match(
    /"severity"\s*:\s*"(HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION|DISMISSED)"/i
  );
  if (jsonMatch) {
    const normalized = normalizeSeverity(jsonMatch[1]);
    if (normalized) return { severity: normalized, reasoning: response.trim() };
  }

  // P2: First 10 lines keyword scan, most specific first
  const scanLines = response.split('\n').slice(0, 10).join('\n').toLowerCase();

  for (const sev of SEVERITY_ORDER) {
    const pattern = sev === 'HARSHLY_CRITICAL'
      ? /\bharshly[_\s]critical\b/
      : sev === 'DISMISSED'
        ? /\bdismissed?\b/
        : new RegExp(`\\b${sev.toLowerCase()}\\b`);

    if (pattern.test(scanLines)) {
      // Guard against false "critical" in phrases like "not critical"
      if (sev === 'CRITICAL' && /\bnot\s+critical\b/.test(scanLines)) continue;
      return { severity: sev, reasoning: response.trim() };
    }
  }

  return { severity: 'WARNING', reasoning: response.trim() };
}

function normalizeSeverity(raw: string): Severity | null {
  const lower = raw.toLowerCase().replace(/\s+/g, '_').replace(/dismissed$/, 'dismissed');
  const map: Record<string, Severity> = {
    harshly_critical: 'HARSHLY_CRITICAL',
    critical: 'CRITICAL',
    warning: 'WARNING',
    suggestion: 'SUGGESTION',
    dismissed: 'DISMISSED',
  };
  return map[lower] ?? null;
}
