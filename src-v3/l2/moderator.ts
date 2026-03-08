/**
 * L2 Moderator - Discussion Orchestration
 * Manages discussion lifecycle, coordinates supporters, writes final report
 */

import type { Discussion, DiscussionRound, DiscussionVerdict, ModeratorReport, EvidenceDocument } from '../types/core.js';
import type { ModeratorConfig, SupporterConfig, DiscussionSettings, SupporterPoolConfig, AgentConfig } from '../types/config.js';
import { executeBackend } from '../l1/backend.js';
import { writeDiscussionRound, writeDiscussionVerdict, writeSupportersLog } from './writer.js';
import { readFile } from 'fs/promises';
import path from 'path';

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
 * Random pick N elements from array without duplicates
 */
function randomPick<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Random pick one element from array
 */
function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================================================
// Persona Loading
// ============================================================================

/**
 * Load persona file content
 */
async function loadPersona(personaPath: string): Promise<string> {
  try {
    // Resolve path relative to project root
    const fullPath = path.isAbsolute(personaPath)
      ? personaPath
      : path.join(process.cwd(), personaPath);

    const content = await readFile(fullPath, 'utf-8');
    return content.trim();
  } catch (error) {
    // Gracefully handle missing persona files
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
}

/**
 * Run all discussions and generate final report
 */
export async function runModerator(input: ModeratorInput): Promise<ModeratorReport> {
  const { config, supporterPoolConfig, discussions, settings, date, sessionId } = input;

  const verdicts: DiscussionVerdict[] = [];

  for (const discussion of discussions) {
    const verdict = await runDiscussion(
      discussion,
      config,
      supporterPoolConfig,
      settings,
      date,
      sessionId
    );
    verdicts.push(verdict);
  }

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
  sessionId: string
): Promise<DiscussionVerdict> {
  const rounds: DiscussionRound[] = [];

  // HARSHLY_CRITICAL: Skip discussion, escalate immediately
  if (discussion.severity === 'HARSHLY_CRITICAL') {
    const verdict: DiscussionVerdict = {
      discussionId: discussion.id,
      finalSeverity: 'HARSHLY_CRITICAL',
      reasoning: 'HARSHLY_CRITICAL issues are escalated to Head without discussion',
      consensusReached: false, // Escalated
      rounds: 0,
    };

    // Write verdict file
    await writeDiscussionVerdict(date, sessionId, verdict);

    return verdict;
  }

  // Select supporters for this discussion
  const selectedSupporters = selectSupporters(supporterPoolConfig);

  // Log supporter combination
  await writeSupportersLog(date, sessionId, discussion.id, selectedSupporters);

  // Run up to maxRounds
  for (let roundNum = 1; roundNum <= settings.maxRounds; roundNum++) {
    const round = await runRound(
      discussion,
      roundNum,
      moderatorConfig,
      selectedSupporters
    );

    rounds.push(round);

    // Write round file
    await writeDiscussionRound(date, sessionId, discussion.id, round);

    // Check for consensus
    const consensus = checkConsensus(round, discussion);
    if (consensus.reached) {
      const verdict: DiscussionVerdict = {
        discussionId: discussion.id,
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
  selectedSupporters: SelectedSupporter[]
): Promise<DiscussionRound> {
  // Moderator prompts the discussion
  const moderatorPrompt = buildModeratorPrompt(discussion, roundNum);

  // Supporters respond in parallel
  const supporterResponses = await Promise.all(
    selectedSupporters.map((supporter) =>
      executeSupporterResponse(supporter, discussion, moderatorPrompt)
    )
  );

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
  severity?: 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED';
  reasoning?: string;
}

function checkConsensus(round: DiscussionRound, discussion: Discussion): ConsensusResult {
  const supporters = round.supporterResponses;

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

  return { reached: false };
}

// ============================================================================
// Moderator Forced Decision
// ============================================================================

async function moderatorForcedDecision(
  discussion: Discussion,
  rounds: DiscussionRound[],
  config: ModeratorConfig
): Promise<{ severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED'; reasoning: string }> {
  const prompt = `You are the moderator. The discussion has reached max rounds without consensus.

Issue: ${discussion.issueTitle}
Severity claimed: ${discussion.severity}

Review all rounds and make a final decision:
- Severity (CRITICAL, WARNING, SUGGESTION, or DISMISSED)
- Reasoning

Rounds:
${rounds.map((r, i) => `Round ${i + 1}:\n${r.supporterResponses.map(s => `- ${s.supporterId}: ${s.stance}`).join('\n')}`).join('\n\n')}
`;

  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    prompt,
    timeout: 120,
  });

  return parseForcedDecision(response);
}

// ============================================================================
// Helpers
// ============================================================================

function buildModeratorPrompt(discussion: Discussion, roundNum: number): string {
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

function parseStance(response: string): 'agree' | 'disagree' | 'neutral' {
  const lower = response.toLowerCase();
  if (lower.includes('agree') && !lower.includes('disagree')) return 'agree';
  if (lower.includes('disagree')) return 'disagree';
  return 'neutral';
}

function parseForcedDecision(response: string): { severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED'; reasoning: string } {
  const lower = response.toLowerCase();

  let severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'DISMISSED' = 'SUGGESTION';
  if (lower.includes('critical')) severity = 'CRITICAL';
  else if (lower.includes('warning')) severity = 'WARNING';
  else if (lower.includes('dismissed')) severity = 'DISMISSED';

  return {
    severity,
    reasoning: response.trim(),
  };
}
