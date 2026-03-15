/**
 * L1 Reviewer - Evidence Document Writer
 * Executes 5 reviewers in parallel, each writes evidence documents
 */

import type { ReviewerConfig } from '../types/config.js';
import type { ReviewOutput } from '../types/core.js';
import { parseEvidenceResponse } from './parser.js';
import { executeBackend } from './backend.js';
import { extractFileListFromDiff } from '../utils/diff.js';

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
}

/**
 * Execute a single reviewer
 */
export async function executeReviewer(
  input: ReviewerInput,
  retries: number = 2
): Promise<ReviewOutput> {
  const { config, groupName, diffContent, prSummary } = input;

  let lastError: Error | undefined;

  // Extract file list from diff for fallback parsing
  const diffFilePaths = extractFileListFromDiff(diffContent);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    try {
      const response = await executeBackend({
        backend: config.backend,
        model: config.model,
        provider: config.provider,
        prompt: buildReviewerPrompt(diffContent, prSummary),
        timeout: config.timeout,
        signal: controller.signal,
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

  // All retries failed — try fallback if configured
  if (lastError && config.fallback) {
    try {
      const response = await executeBackend({
        backend: config.fallback.backend,
        model: config.fallback.model,
        provider: config.fallback.provider,
        prompt: buildReviewerPrompt(diffContent, prSummary),
        timeout: config.timeout,
      });

      const evidenceDocs = parseEvidenceResponse(response, diffFilePaths);

      return {
        reviewerId: config.id,
        model: config.fallback.model,
        group: groupName,
        evidenceDocs,
        rawResponse: response,
        status: 'success',
      };
    } catch {
      // fallback also failed — forfeit
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
 * Execute multiple reviewers with concurrency limit and graceful degradation
 */
export async function executeReviewers(
  inputs: ReviewerInput[],
  maxRetries: number = 2,
  concurrency: number = 5
): Promise<ReviewOutput[]> {
  const results: ReviewOutput[] = [];

  // Process in batches to avoid 429 rate limit storms
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((input) => executeReviewer(input, maxRetries))
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
 * Check forfeit threshold
 */
export function checkForfeitThreshold(
  results: ReviewOutput[],
  threshold: number = 0.7
): { passed: boolean; forfeitRate: number } {
  const totalReviewers = results.length;
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

function buildReviewerPrompt(diffContent: string, prSummary: string): string {
  return `# Code Review Task

## PR Summary
${prSummary}

## Your Task
Review the following code changes and identify any issues. For each issue you find, write an evidence document in the following format:

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
[HARSHLY_CRITICAL / CRITICAL / WARNING / SUGGESTION]

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
HARSHLY_CRITICAL (See Severity Guide above)

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
