/**
 * L1 Reviewer - Evidence Document Writer
 * Executes 5 reviewers in parallel, each writes evidence documents
 */

import type { ReviewerConfig, FallbackConfig } from '../types/config.js';
import type { ReviewOutput } from '../types/core.js';
import { parseEvidenceResponse } from './parser.js';
import { executeBackend } from './backend.js';
import { extractFileListFromDiff } from '@codeagora/shared/utils/diff.js';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
import { HealthMonitor } from '../l0/health-monitor.js';

// ============================================================================
// Fallback Normalization
// ============================================================================

/**
 * Normalize fallback config to an array for uniform iteration.
 * Supports both single-object and array forms for backward compatibility.
 */
export function normalizeFallbacks(
  fallback: FallbackConfig | FallbackConfig[] | undefined
): FallbackConfig[] {
  if (!fallback) return [];
  return Array.isArray(fallback) ? fallback : [fallback];
}

// ============================================================================
// Reviewer Execution
// ============================================================================

export interface ReviewerInput {
  config: ReviewerConfig;
  groupName: string;
  diffContent: string;
  prSummary: string;
  selectionMeta?: {
    selectionReason: string;
    family: string;
    isReasoning: boolean;
  };
  /** Surrounding code context from source files (context-aware review) */
  surroundingContext?: string;
}

/**
 * Execute a single reviewer
 */
export async function executeReviewer(
  input: ReviewerInput,
  retries: number = 2
): Promise<ReviewOutput> {
  const { config, groupName, diffContent, prSummary, surroundingContext } = input;

  let lastError: Error | undefined;

  // Extract file list from diff for fallback parsing
  const diffFilePaths = extractFileListFromDiff(diffContent);

  // Load persona if configured (prepended to review prompt)
  let personaPrefix = '';
  if (config.persona) {
    const { loadPersona } = await import('../l2/moderator.js');
    const content = await loadPersona(config.persona);
    if (content) {
      personaPrefix = `${content}\n\n---\n\n`;
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    try {
      const response = await executeBackend({
        backend: config.backend,
        model: config.model,
        provider: config.provider,
        prompt: personaPrefix + buildReviewerPrompt(diffContent, prSummary, surroundingContext),
        timeout: config.timeout,
        signal: controller.signal,
        temperature: config.temperature,
      });

      // Parse response into evidence documents with diff file paths for fallback
      const evidenceDocs = parseEvidenceResponse(response, diffFilePaths);

      return {
        reviewerId: config.id,
        model: config.model,
        group: groupName,
        evidenceDocs,
        rawResponse: response,
        status: 'success',
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // All retries failed — try fallback chain if configured
  const fallbacks = normalizeFallbacks(config.fallback);
  for (const fb of fallbacks) {
    try {
      const response = await executeBackend({
        backend: fb.backend,
        model: fb.model,
        provider: fb.provider,
        prompt: personaPrefix + buildReviewerPrompt(diffContent, prSummary, surroundingContext),
        timeout: config.timeout,
        temperature: config.temperature,
      });

      const evidenceDocs = parseEvidenceResponse(response, diffFilePaths);

      return {
        reviewerId: config.id,
        model: fb.model,
        group: groupName,
        evidenceDocs,
        rawResponse: response,
        status: 'success',
      };
    } catch {
      // this fallback failed — continue to next in chain
    }
  }

  return {
    reviewerId: config.id,
    model: config.model,
    group: groupName,
    evidenceDocs: [],
    rawResponse: '',
    status: 'forfeit',
    error: lastError?.message || 'Unknown error',
  };
}

// ============================================================================
// Module-level circuit breaker + health monitor (D-2, D-4)
// Circuit breaker and RPD tracking only apply to API backends with an explicit
// provider field. CLI backends (codex, gemini, claude, etc.) have no provider
// and are intentionally excluded from tracking to prevent cross-test state bleed.
// ============================================================================

const _defaultCircuitBreaker = new CircuitBreaker();
const _defaultHealthMonitor = new HealthMonitor();

export interface ExecuteReviewersOptions {
  circuitBreaker?: CircuitBreaker;
  healthMonitor?: HealthMonitor;
}

/**
 * Execute multiple reviewers with concurrency limit and graceful degradation.
 * Applies circuit breaker per provider/model and records RPD budget usage
 * for API backends (those with an explicit provider field).
 */
export async function executeReviewers(
  inputs: ReviewerInput[],
  maxRetries: number = 2,
  concurrency: number = 5,
  options: ExecuteReviewersOptions = {}
): Promise<ReviewOutput[]> {
  const cb = options.circuitBreaker ?? _defaultCircuitBreaker;
  const hm = options.healthMonitor ?? _defaultHealthMonitor;
  const results: ReviewOutput[] = [];

  // Process in batches to avoid 429 rate limit storms
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((input) => executeReviewerWithGuards(input, maxRetries, cb, hm))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Unexpected rejection — executeReviewer should catch all errors,
        // but handle gracefully just in case
        results.push({
          reviewerId: batch[j].config.id,
          model: batch[j].config.model,
          group: batch[j].groupName,
          evidenceDocs: [],
          rawResponse: '',
          status: 'forfeit',
          error: result.reason?.message || 'Unexpected execution error',
        });
      }
    }
  }

  return results;
}

/**
 * Execute a single reviewer with circuit breaker + health monitor guards.
 * Guards are only active when the reviewer config has an explicit provider
 * (i.e. API backends). CLI backends skip guarding entirely.
 */
async function executeReviewerWithGuards(
  input: ReviewerInput,
  retries: number,
  cb: CircuitBreaker,
  hm: HealthMonitor
): Promise<ReviewOutput> {
  const { config, groupName, diffContent, prSummary, surroundingContext } = input;
  // Only guard API backends — those have an explicit provider field.
  const provider = config.provider;
  const useGuards = !!provider;

  // Check circuit breaker before attempting (API backends only)
  if (useGuards && cb.isOpen(provider!, config.model)) {
    return {
      reviewerId: config.id,
      model: config.model,
      group: groupName,
      evidenceDocs: [],
      rawResponse: '',
      status: 'forfeit',
      error: `Circuit open for ${provider}/${config.model}`,
    };
  }

  // Load persona if configured (prepended to review prompt)
  let personaPrefix = '';
  if (config.persona) {
    const { loadPersona } = await import('../l2/moderator.js');
    const content = await loadPersona(config.persona);
    if (content) {
      personaPrefix = `${content}\n\n---\n\n`;
    }
  }

  let lastError: Error | undefined;
  const diffFilePaths = extractFileListFromDiff(diffContent);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    try {
      if (useGuards) hm.recordRequest(provider!);

      const response = await executeBackend({
        backend: config.backend,
        model: config.model,
        provider: config.provider,
        prompt: personaPrefix + buildReviewerPrompt(diffContent, prSummary, surroundingContext),
        timeout: config.timeout,
        signal: controller.signal,
        temperature: config.temperature,
      });

      if (useGuards) cb.recordSuccess(provider!, config.model);
      const evidenceDocs = parseEvidenceResponse(response, diffFilePaths);

      return {
        reviewerId: config.id,
        model: config.model,
        group: groupName,
        evidenceDocs,
        rawResponse: response,
        status: 'success',
      };
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return {
          reviewerId: config.id,
          model: config.model,
          group: groupName,
          evidenceDocs: [],
          rawResponse: '',
          status: 'forfeit',
          error: error.message,
        };
      }
      if (useGuards) cb.recordFailure(provider!, config.model);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // All retries failed — try fallback chain if configured
  const fallbacks = normalizeFallbacks(config.fallback);
  for (const fb of fallbacks) {
    const fallbackProvider = fb.provider;
    const useFallbackGuards = !!fallbackProvider;
    try {
      if (useFallbackGuards) hm.recordRequest(fallbackProvider!);

      const response = await executeBackend({
        backend: fb.backend,
        model: fb.model,
        provider: fb.provider,
        prompt: personaPrefix + buildReviewerPrompt(diffContent, prSummary, surroundingContext),
        timeout: config.timeout,
        temperature: config.temperature,
      });

      if (useFallbackGuards) cb.recordSuccess(fallbackProvider!, fb.model);
      const evidenceDocs = parseEvidenceResponse(response, diffFilePaths);

      return {
        reviewerId: config.id,
        model: fb.model,
        group: groupName,
        evidenceDocs,
        rawResponse: response,
        status: 'success',
      };
    } catch {
      if (useFallbackGuards) cb.recordFailure(fallbackProvider!, fb.model);
      // this fallback failed — continue to next in chain
    }
  }

  return {
    reviewerId: config.id,
    model: config.model,
    group: groupName,
    evidenceDocs: [],
    rawResponse: '',
    status: 'forfeit',
    error: lastError?.message || 'Unknown error',
  };
}

/**
 * Check forfeit threshold
 */
export function checkForfeitThreshold(
  results: ReviewOutput[],
  threshold: number = 0.7
): { passed: boolean; forfeitRate: number } {
  const totalReviewers = results.length;
  if (totalReviewers === 0) {
    return { passed: true, forfeitRate: 0 };
  }
  const forfeitCount = results.filter((r) => r.status === 'forfeit').length;
  const forfeitRate = forfeitCount / totalReviewers;

  return {
    passed: forfeitRate < threshold,
    forfeitRate,
  };
}

// ============================================================================
// Prompt Building
// ============================================================================

function buildReviewerPrompt(diffContent: string, prSummary: string, surroundingContext?: string): string {
  const contextSection = surroundingContext
    ? `## Surrounding Code Context

The following code context shows the surrounding lines of the changed files to help you understand the full picture:

${surroundingContext}

`
    : '';

  return `# Code Review Task

You are a ruthless, senior code reviewer. Your job is to find **real bugs, security holes, and logic errors** that will break production. This code WILL be deployed if you don't catch the problems. Be thorough. Be aggressive. Miss nothing.

## PR Summary (Intent of the change)
${prSummary}

**First, understand what this change is trying to do. Then ask: does the implementation actually achieve it? What could go wrong?**

${contextSection}## Analysis Checklist

Before writing issues, systematically check:
1. **Input validation**: Are all external inputs validated? Can malformed data crash or corrupt?
2. **Error paths**: What happens when things fail? Are errors caught, logged, propagated correctly?
3. **Security boundaries**: Any user input reaching SQL/shell/file/network? Any auth/authz gaps?
4. **Resource lifecycle**: Are connections/handles/memory properly acquired and released?
5. **Logic correctness**: Do conditionals cover all cases? Off-by-one? Race conditions? Null derefs?

## Your Task
For each **real, actionable issue** in the **newly added or modified code**, write an evidence document:

\`\`\`markdown
## Issue: [Clear, concise title]

### 문제
In {filePath}:{startLine}-{endLine}

[What is the problem? Describe the issue in detail.]

### 근거
1. [Specific evidence 1]
2. [Specific evidence 2]
3. [Specific evidence 3]

### 심각도
[HARSHLY_CRITICAL / CRITICAL / WARNING / SUGGESTION] ([confidence 0-100]%)

### 제안
[How to fix it?]
\`\`\`

**CRITICAL FORMAT REQUIREMENTS:**

1. **File location (MANDATORY)**: The first line of "### 문제" section MUST follow this exact format:
   - \`In {filePath}:{startLine}-{endLine}\`
   - Example: \`In auth.ts:10-15\`
   - Example: \`In src/components/Login.tsx:42-42\`
   - Example: \`In utils/validation.js:18-25\`

2. **After the file location**, add a blank line and then describe the problem.

## Severity Guide

Decide severity by answering TWO questions:

**Q1. Impact**: Does this cause direct harm to production users?
  - YES → High Impact (go to Q2)
  - NO → WARNING or SUGGESTION

**Q2. Reversibility**: Can the harm be fully undone by \`git revert\` + redeploy?
  - YES → CRITICAL
  - NO → HARSHLY_CRITICAL

### HARSHLY_CRITICAL = High Impact + Irreversible
Examples:
- Data loss/corruption (wrong DELETE, broken migration with no rollback)
- Security breach (SQL injection, credential exposure, auth bypass)
- Data already leaked (secrets pushed to public repo)

### CRITICAL = High Impact + Reversible
Examples:
- API returns 500 (revert fixes it)
- Memory leak causing OOM (restart fixes it)
- Broken authentication flow (revert restores it)

### WARNING = Low Impact
Examples:
- Performance degradation (not a crash)
- Missing error handling (edge case)
- Accessibility issues

### SUGGESTION = Not a bug
Examples:
- Code style, naming conventions
- Refactoring opportunities
- Better abstractions

⚠️ **When uncertain between CRITICAL and HARSHLY_CRITICAL, choose CRITICAL.**
Default to the lower severity — false HC escalation wastes resources.

## Confidence Score

For each issue, assign a **confidence score (0-100%)** in the 심각도 section:
- **80-100%**: You are certain this is a real bug/vulnerability. You can point to specific code that proves it.
- **50-79%**: Likely a real issue, but you'd need more context to be sure.
- **20-49%**: Possible issue, but could be a false positive. Downgrade severity to SUGGESTION.
- **0-19%**: Speculative. Do NOT report it.

Format: \`CRITICAL (85%)\` or \`WARNING (60%)\`

**If your confidence is below 20%, do not report the issue.**

## Do NOT Flag (wastes everyone's time)

- **Deleted code** (lines starting with \`-\`) — it's being removed, not introduced
- **Things handled elsewhere** — check context before claiming "missing error handling"
- **Style opinions** — naming, formatting, import order are NOT bugs
- **"What if" speculation** — cite concrete code, not hypotheticals
- **Config values** — JSON/YAML values are intentional choices
- **Test patterns** — mocks, stubs, simplified logic are intentional in tests

**Example Evidence Document:**

\`\`\`markdown
## Issue: SQL Injection Vulnerability

### 문제
In auth.ts:10-12

The user input is directly concatenated into SQL query without sanitization, creating a SQL injection vulnerability.

### 근거
1. Username parameter is taken directly from user input
2. String concatenation is used instead of parameterized queries
3. No input validation or escaping is performed

### 심각도
HARSHLY_CRITICAL (90%)

### 제안
Use parameterized queries: \`db.query('SELECT * FROM users WHERE username = ?', [username])\`
\`\`\`

## Code Changes

\`\`\`diff
${diffContent}
\`\`\`

---

Write your evidence documents below. If you find no issues, write "No issues found."
`;
}
