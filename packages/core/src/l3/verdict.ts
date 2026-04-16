/**
 * L3 Head - Final Verdict
 * LLM-based verdict with rule-based fallback.
 * When head config is provided and enabled, the LLM evaluates reasoning quality
 * rather than just counting severities. Falls back to rule-based logic on failure.
 */

import type { ModeratorReport, HeadVerdict, EvidenceDocument } from '../types/core.js';
import type { HeadConfig } from '../types/config.js';

// ============================================================================
// LLM-Based Verdict
// ============================================================================

/**
 * Head makes final verdict based on moderator report.
 * If headConfig is provided and enabled, uses LLM for reasoning-quality evaluation.
 * Falls back to rule-based logic if LLM fails or headConfig is not provided.
 */
export async function makeHeadVerdict(
  report: ModeratorReport,
  headConfig?: HeadConfig,
  mode?: 'strict' | 'pragmatic',
  language?: 'en' | 'ko',
): Promise<HeadVerdict> {
  // Try LLM-based verdict if configured
  if (headConfig?.enabled !== false && headConfig?.model) {
    try {
      return await llmVerdict(report, headConfig, language);
    } catch {
      // Fallback to rule-based on any LLM failure
    }
  }

  return ruleBasedVerdict(report, mode);
}

async function llmVerdict(report: ModeratorReport, config: HeadConfig, language?: 'en' | 'ko'): Promise<HeadVerdict> {
  const { executeBackend } = await import('../l1/backend.js');
  const { retryOnError } = await import('@codeagora/shared/utils/recovery.js');
  const { classifyError } = await import('../l1/error-classifier.js');

  const prompt = buildHeadPrompt(report, language);
  const response = await retryOnError(
    () => executeBackend({
      backend: config.backend,
      model: config.model,
      provider: config.provider,
      prompt,
      timeout: config.timeout ?? 120,
      temperature: 0.2,
    }),
    (err) => {
      const cls = classifyError(err);
      return cls.kind === 'rate-limited' || cls.kind === 'transient';
    },
    { maxRetries: 1, baseDelay: 3000, maxDelay: 15000, backoffFactor: 2 },
  );

  return parseHeadResponse(response, report);
}

function buildHeadPrompt(report: ModeratorReport, language?: 'en' | 'ko'): string {
  const isKo = language === 'ko';

  const discussionSummary = report.discussions.map((d) => {
    const consensus = d.consensusReached
      ? (isKo ? '합의 도달' : 'consensus reached')
      : (isKo ? '합의 미달' : 'no consensus');
    const confStr = d.avgConfidence != null
      ? (isKo ? `, 신뢰도: ${d.avgConfidence}%` : `, confidence: ${d.avgConfidence}%`)
      : '';
    return `- [${d.finalSeverity}] ${d.discussionId} (${d.filePath}:${d.lineRange[0]}) — ${consensus}, ${d.rounds} ${isKo ? '라운드' : 'round(s)'}${confStr}: ${d.reasoning}`;
  }).join('\n');

  // Build condensed evidence for CRITICAL+ findings (#310)
  const criticalDiscussions = report.discussions.filter(
    (d) => d.finalSeverity === 'CRITICAL' || d.finalSeverity === 'HARSHLY_CRITICAL'
  );
  const evidenceSummary = criticalDiscussions.map((d) => {
    const rounds = report.roundsPerDiscussion?.[d.discussionId] ?? [];
    const snippets = rounds.flatMap((r) =>
      r.supporterResponses.map((s) => {
        const text = s.response.slice(0, 200);
        return `  - [${s.stance}] ${s.supporterId}: ${text}${s.response.length > 200 ? '…' : ''}`;
      })
    );
    if (snippets.length === 0) return null;
    return `- ${d.discussionId} (${d.filePath}:${d.lineRange[0]}):\n${snippets.join('\n')}`;
  }).filter(Boolean).join('\n');

  const evidenceSection = evidenceSummary
    ? `\n### ${isKo ? 'CRITICAL+ 토론 근거' : 'CRITICAL+ Discussion Evidence'}\n${evidenceSummary}\n`
    : '';

  const unconfirmedSummary = report.unconfirmedIssues.length > 0
    ? `\n${isKo ? '미확인 이슈 (단일 리뷰어)' : 'Unconfirmed issues (single reviewer)'}: ${report.unconfirmedIssues.length}`
    : '';

  const suggestionsSummary = report.suggestions.length > 0
    ? `\n${isKo ? '제안' : 'Suggestions'}: ${report.suggestions.length}`
    : '';

  // Quantitative counts per severity
  const countBySeverity = (sev: string) =>
    report.discussions.filter((d) => d.finalSeverity === sev).length;
  const harshlyCount = countBySeverity('HARSHLY_CRITICAL');
  const criticalCount = countBySeverity('CRITICAL');
  const warningCount = countBySeverity('WARNING');
  const suggestionCount = report.suggestions?.length ?? 0;
  const unresolvedCount = report.discussions.filter((d) => !d.consensusReached).length;

  const quantSection = isKo
    ? `## 정량 요약
- HARSHLY_CRITICAL: ${harshlyCount}건
- CRITICAL: ${criticalCount}건
- WARNING: ${warningCount}건
- SUGGESTION: ${suggestionCount}건
- 미해결 토론: ${unresolvedCount}건

## 판단 지침 (신뢰도 기반 분류 필수)
- CRITICAL+ 이슈를 신뢰도 구간별로 분류할 것
- 신뢰도 >50% CRITICAL+: 실제 문제 가능성 높음 — REJECT 고려
- 신뢰도 ≤15% CRITICAL+: 미검증 — NEEDS_HUMAN으로 라우팅, REJECT 금지
- 미해결 토론이 남아있으면: NEEDS_HUMAN 고려
- 0% 신뢰도 이슈를 "차단 이슈"로 표시할 경우 반드시 "미검증" 표기 필요
- 모든 CRITICAL+ 이슈가 저신뢰도라면: REJECT 대신 NEEDS_HUMAN + 트리아지 가이드 반환`
    : `## Quantitative Summary
- HARSHLY_CRITICAL: ${harshlyCount} issues
- CRITICAL: ${criticalCount} issues
- WARNING: ${warningCount} issues
- SUGGESTION: ${suggestionCount} issues
- Unresolved discussions: ${unresolvedCount}

## Triage Guidance (#236)
- Group findings by confidence tier before deciding
- CRITICAL+ with confidence >50%: likely real — consider REJECT
- CRITICAL+ with confidence ≤15%: unverified — route to NEEDS_HUMAN, NOT REJECT
- Do NOT mark zero-confidence findings as "Blocking Issues" without flagging them as unverified
- If all critical findings are low-confidence, return NEEDS_HUMAN with triage guidance`;

  if (isKo) {
    return `당신은 멀티 에이전트 코드 리뷰 시스템의 최종 판관입니다. 여러 AI 리뷰어가 독립적으로 코드 변경을 검토한 후 토론을 진행했습니다. 최종 판결을 내려주세요.

## 토론 결과

전체 토론: ${report.summary.totalDiscussions}
해결됨 (합의): ${report.summary.resolved}
에스컬레이션 (미합의): ${report.summary.escalated}
${unconfirmedSummary}
${suggestionsSummary}

${quantSection}

### 토론 상세
${discussionSummary || '(토론 없음)'}
${evidenceSection}
## 작업

각 토론의 추론 품질을 평가하세요. 심각도 수치만 보지 마세요:
1. CRITICAL/HARSHLY_CRITICAL 결과가 충분한 근거를 갖추고 있나요, 아니면 추측성인가요?
2. 토론에서 거짓 긍정(false positive)이 밝혀졌나요?
3. 에스컬레이션된 이슈가 진정으로 모호한가요, 아니면 단순히 토론이 부족한 건가요?
4. 전반적으로 코드 변경이 병합하기 안전한가요?

## 응답 형식

정확히 다음 형식으로 응답하세요:

DECISION: ACCEPT | REJECT | NEEDS_HUMAN
REASONING: <근거 품질을 바탕으로 한 결정 설명 (한 단락)>
QUESTIONS: <인간 리뷰어를 위한 질문 목록 (쉼표 구분), 없으면 "none">
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
${discussionSummary || '(no discussions)'}
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

function parseHeadResponse(response: string, report: ModeratorReport): HeadVerdict {
  const decisionMatch = response.match(/DECISION:\s*(ACCEPT|REJECT|NEEDS_HUMAN)/i);
  const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=\nQUESTIONS:|$)/is);
  const questionsMatch = response.match(/QUESTIONS:\s*(.+)/is);

  if (!decisionMatch) {
    // Can't parse — fallback
    console.warn('[Head] Failed to parse LLM response, falling back to rule-based verdict');
    return ruleBasedVerdict(report);
  }

  const decision = decisionMatch[1].toUpperCase() as HeadVerdict['decision'];
  const reasoning = reasoningMatch?.[1]?.trim() || 'LLM verdict without detailed reasoning.';

  let questionsForHuman: string[] | undefined;
  if (questionsMatch) {
    const raw = questionsMatch[1].trim();
    if (raw.toLowerCase() !== 'none' && raw.length > 0) {
      questionsForHuman = raw.split(/[,\n]/).map((q) => q.trim()).filter((q) => q.length > 0);
    }
  }

  return {
    decision,
    reasoning,
    questionsForHuman: questionsForHuman?.length ? questionsForHuman : undefined,
  };
}

// ============================================================================
// Rule-Based Verdict (Fallback)
// ============================================================================

/**
 * Issues at or below this confidence (%) are treated as unverified — routed to
 * NEEDS_HUMAN instead of REJECT. (#229: 0% confidence should not be HARSHLY_CRITICAL)
 */
const ZERO_CONFIDENCE_THRESHOLD = 15;

function ruleBasedVerdict(report: ModeratorReport, mode?: 'strict' | 'pragmatic'): HeadVerdict {
  // Separate high-confidence critical issues from unverified (zero/very-low confidence) ones (#229)
  const allCritical = report.discussions.filter(
    (d) => d.finalSeverity === 'CRITICAL' || d.finalSeverity === 'HARSHLY_CRITICAL'
  );
  const criticalIssues = allCritical.filter(
    (d) => d.avgConfidence == null || d.avgConfidence > ZERO_CONFIDENCE_THRESHOLD
  );
  const unverifiedCritical = allCritical.filter(
    (d) => d.avgConfidence != null && d.avgConfidence <= ZERO_CONFIDENCE_THRESHOLD
  );

  const escalatedIssues = report.discussions.filter((d) => !d.consensusReached);

  // Strict mode: 3+ WARNING issues trigger NEEDS_HUMAN
  if (mode === 'strict') {
    const warningIssues = report.discussions.filter((d) => d.finalSeverity === 'WARNING');
    if (warningIssues.length >= 3) {
      return {
        decision: 'NEEDS_HUMAN',
        reasoning: `Strict mode: ${warningIssues.length} warning-level issue(s) found. Review each to confirm they are acceptable.`,
        questionsForHuman: [
          ...warningIssues.slice(0, 3).map(
            (d) => `Check: ${d.discussionId} (${d.filePath}:${d.lineRange[0]}) — WARNING`
          ),
          ...(warningIssues.length > 3 ? [`...and ${warningIssues.length - 3} more warnings`] : []),
          ...(escalatedIssues.length > 0 ? [`${escalatedIssues.length} unresolved discussion(s) also need judgment`] : []),
        ],
      };
    }
  }

  if (criticalIssues.length > 0) {
    const unverifiedNote = unverifiedCritical.length > 0
      ? ` Additionally, ${unverifiedCritical.length} low-confidence critical finding(s) need verification.`
      : '';
    const questions = [
      ...(escalatedIssues.length > 0 ? [`${escalatedIssues.length} issue(s) need human judgment`] : []),
      ...(unverifiedCritical.length > 0
        ? [`${unverifiedCritical.length} low-confidence finding(s) need verification: ${unverifiedCritical.map((d) => d.discussionId).join(', ')}`]
        : []),
    ];
    return {
      decision: 'REJECT',
      reasoning: `Found ${criticalIssues.length} critical issue(s) that must be fixed before merging.${unverifiedNote}`,
      questionsForHuman: questions.length > 0 ? questions : undefined,
    };
  }

  // Only unverified critical (zero confidence) — escalate to human instead of hard reject
  if (unverifiedCritical.length > 0) {
    return {
      decision: 'NEEDS_HUMAN',
      reasoning: `Found ${unverifiedCritical.length} critical finding(s) with very low confidence (≤${ZERO_CONFIDENCE_THRESHOLD}%). These may be false positives — human verification required before rejecting.`,
      questionsForHuman: unverifiedCritical.map(
        (d) => `Verify: ${d.discussionId} (${d.filePath}:${d.lineRange[0]}) — ${d.finalSeverity}, ${d.avgConfidence}% confidence`
      ),
    };
  }

  if (escalatedIssues.length > 0) {
    const fileList = escalatedIssues
      .map((d) => `${d.filePath}:${d.lineRange[0]}`)
      .slice(0, 5)
      .join(', ');
    return {
      decision: 'NEEDS_HUMAN',
      reasoning: `${escalatedIssues.length} issue(s) could not reach reviewer consensus after max discussion rounds. ` +
        `Human review needed at: ${fileList}${escalatedIssues.length > 5 ? ` (+${escalatedIssues.length - 5} more)` : ''}.`,
      questionsForHuman: escalatedIssues.map(
        (d) => `Verify ${d.discussionId} (${d.filePath}:${d.lineRange[0]}-${d.lineRange[1]}): ${d.finalSeverity} — reviewers disagreed on severity/validity`
      ),
    };
  }

  return {
    decision: 'ACCEPT',
    reasoning: 'All issues resolved or deemed acceptable. Code is ready to merge.',
  };
}

// ============================================================================
// Unconfirmed Queue Scanner
// ============================================================================

/**
 * Scan unconfirmed queue - issues flagged by only 1 reviewer
 * Head decides if these are real issues
 */
export function scanUnconfirmedQueue(
  unconfirmed: EvidenceDocument[]
): {
  promoted: EvidenceDocument[];
  dismissed: EvidenceDocument[];
} {
  // Promote CRITICAL/HARSHLY_CRITICAL, dismiss others
  const promoted = unconfirmed.filter(
    (doc) => doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL'
  );
  const dismissed = unconfirmed.filter(
    (doc) => doc.severity !== 'CRITICAL' && doc.severity !== 'HARSHLY_CRITICAL'
  );

  return { promoted, dismissed };
}
