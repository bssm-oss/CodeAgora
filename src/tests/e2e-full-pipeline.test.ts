/**
 * E2E Full Pipeline Test — Real API Integration
 *
 * Runs the complete CodeAgora review pipeline (L1 -> L2 -> L3) against real APIs:
 *   - L1 Reviewers: 5x Groq (free tier)
 *   - L2 Supporters/Moderator: Claude CLI backend (uses Claude Code)
 *   - L3 Head Verdict: Claude CLI backend (uses Claude Code)
 *   - Input: examples/vulnerable-api/server.ts (intentionally vulnerable code)
 *
 * Requirements:
 *   - CODEAGORA_RUN_LIVE_E2E=1
 *   - GROQ_API_KEY env var set
 *   - `claude` CLI available in PATH (Claude Code)
 *
 * Unless CODEAGORA_RUN_LIVE_E2E=1 is set, or when GROQ_API_KEY is missing
 * or claude CLI is not found, the entire suite is skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// ============================================================================
// Environment Gate
// ============================================================================

import { execFileSync } from 'child_process';

const liveE2EEnabled = process.env['CODEAGORA_RUN_LIVE_E2E'] === '1';
const hasGroq = !!process.env['GROQ_API_KEY'];
const hasClaude = (() => {
  try { execFileSync('which', ['claude'], { stdio: 'pipe' }); return true; } catch { return false; }
})();
const canRun = liveE2EEnabled && hasGroq && hasClaude;

const describeFn = canRun ? describe : describe.skip;

// ============================================================================
// Vulnerable server.ts as unified diff (new file)
// ============================================================================

const VULNERABLE_SERVER_PATH = path.resolve(
  __dirname,
  '../../examples/vulnerable-api/server.ts',
);

async function buildDiff(): Promise<string> {
  const content = await fs.readFile(VULNERABLE_SERVER_PATH, 'utf-8');
  const lines = content.split('\n');
  const addedLines = lines.map((l) => `+${l}`).join('\n');
  const lineCount = lines.length;

  return [
    'diff --git a/server.ts b/server.ts',
    'new file mode 100644',
    'index 0000000..abcdef1',
    '--- /dev/null',
    '+++ b/server.ts',
    `@@ -0,0 +1,${lineCount} @@`,
    addedLines,
  ].join('\n');
}

// ============================================================================
// Config for the test
// ============================================================================

function buildConfig() {
  return {
    mode: 'strict',
    language: 'en',
    reviewers: [
      { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
      { id: 'r2', model: 'deepseek-r1-distill-llama-70b', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
      { id: 'r3', model: 'qwen-qwq-32b', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
      { id: 'r4', model: 'llama-3.1-8b-instant', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
      { id: 'r5', model: 'llama3-70b-8192', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
    ],
    supporters: {
      pool: [
        { id: 's1', model: 'claude-sonnet-4-6', backend: 'claude', enabled: true, timeout: 180 },
        { id: 's2', model: 'claude-sonnet-4-6', backend: 'claude', enabled: true, timeout: 180 },
      ],
      pickCount: 2,
      pickStrategy: 'random',
      devilsAdvocate: { id: 'da', model: 'claude-sonnet-4-6', backend: 'claude', enabled: true, timeout: 180 },
      personaPool: ['.ca/personas/strict.md', '.ca/personas/security-focused.md'],
      personaAssignment: 'random',
    },
    moderator: { model: 'claude-sonnet-4-6', backend: 'claude' },
    head: { model: 'claude-sonnet-4-6', backend: 'claude', enabled: true },
    discussion: {
      maxRounds: 3,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 1,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
    },
    errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
  };
}

// ============================================================================
// Quick mode config — skip discussion and head verdict
// ============================================================================

function buildQuickConfig() {
  const base = buildConfig();
  return {
    ...base,
    discussion: {
      ...base.discussion,
      enabled: false,
    },
  };
}

// ============================================================================
// Valid severities for assertions
// ============================================================================

const VALID_SEVERITIES = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'];
const VALID_DECISIONS = ['ACCEPT', 'REJECT', 'NEEDS_HUMAN'];

// ============================================================================
// Test Suite
// ============================================================================

describeFn('E2E: Full Pipeline with Real APIs', () => {
  let tmpDir: string;
  let originalCwd: string;
  let diffPath: string;

  // Shared pipeline result for phases 3-6 (run once, verify many)
  let fullResult: Awaited<ReturnType<typeof import('@codeagora/core/pipeline/orchestrator.js').runPipeline>> | undefined;

  beforeAll(async () => {
    originalCwd = process.cwd();

    // Create isolated temp directory
    tmpDir = path.join(tmpdir(), `codeagora-e2e-full-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
    process.chdir(tmpDir);

    // Create .ca directory structure
    await fs.mkdir(path.join(tmpDir, '.ca'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.ca', 'personas'), { recursive: true });

    // Write config
    await fs.writeFile(
      path.join(tmpDir, '.ca', 'config.json'),
      JSON.stringify(buildConfig(), null, 2),
    );

    // Write persona files
    await fs.writeFile(
      path.join(tmpDir, '.ca', 'personas', 'strict.md'),
      [
        '# Strict Reviewer Persona',
        '',
        'You are an extremely thorough code reviewer.',
        'Focus on security vulnerabilities, data leaks, and unsafe coding practices.',
        'Do not let any issue slide — flag everything that could be a risk.',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(tmpDir, '.ca', 'personas', 'security-focused.md'),
      [
        '# Security-Focused Reviewer Persona',
        '',
        'You specialize in application security review.',
        'Look for OWASP Top 10 vulnerabilities: injection, broken auth, XSS, SSRF, etc.',
        'Rate severity based on real-world exploitability.',
      ].join('\n'),
    );

    // Write diff file
    const diff = await buildDiff();
    diffPath = path.join(tmpDir, 'vulnerable-server.diff');
    await fs.writeFile(diffPath, diff, 'utf-8');
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // ==========================================================================
  // Phase 1: Environment Verification
  // ==========================================================================

  describe('Phase 1: Environment Verification', () => {
    it('doctor — Node version and config exist', async () => {
      const { runDoctor } = await import('@codeagora/cli/commands/doctor.js');
      const report = await runDoctor(tmpDir);

      // Node version should pass
      const nodeCheck = report.checks.find((c) => c.name === 'Node.js version');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toBe('pass');

      // Config file should exist
      const configCheck = report.checks.find((c) => c.name === 'Config file');
      expect(configCheck).toBeDefined();
      expect(configCheck!.status).toBe('pass');
    }, 30_000);

    it('providers — groq and anthropic API keys detected', async () => {
      const { listProviders } = await import('@codeagora/cli/commands/providers.js');
      const providers = listProviders();

      const groq = providers.find((p) => p.name === 'groq');
      expect(groq).toBeDefined();
      expect(groq!.apiKeySet).toBe(true);

      // Claude CLI backend doesn't need an API key — just verify provider exists in list
      const anthropic = providers.find((p) => p.name === 'anthropic');
      expect(anthropic).toBeDefined();
    }, 10_000);
  });

  // ==========================================================================
  // Phase 2: Config Validation
  // ==========================================================================

  describe('Phase 2: Config Validation', () => {
    it('loadConfigFrom — loads and validates config', async () => {
      const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
      const config = await loadConfigFrom(tmpDir);

      expect(config).toBeDefined();
      expect(Array.isArray(config.reviewers)).toBe(true);
      if (Array.isArray(config.reviewers)) {
        expect(config.reviewers.length).toBe(5);
      }
      expect(config.supporters.pool.length).toBe(2);
      expect(config.discussion.maxRounds).toBe(3);
    }, 10_000);

    it('strictValidateConfig — passes strict validation', async () => {
      const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
      const { strictValidateConfig } = await import('@codeagora/core/config/validator.js');

      const config = await loadConfigFrom(tmpDir);
      const result = strictValidateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }, 10_000);
  });

  // ==========================================================================
  // Phase 3-5: Full Pipeline (L1 + L2 + L3) — run once, verify many
  // ==========================================================================

  describe('Phase 3-5: Full Pipeline Execution', () => {
    beforeAll(async () => {
      // Ensure we are in the tmpDir
      process.chdir(tmpDir);

      const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
      fullResult = await runPipeline({
        diffPath,
        noCache: true,
        contextLines: 0,
      });
    }, 300_000);

    // -- Phase 3: L1 Review --

    it('pipeline returns success status', () => {
      expect(fullResult).toBeDefined();
      expect(fullResult!.status).toBe('success');
      expect(fullResult!.sessionId).toMatch(/^\d{3}$/);
      expect(fullResult!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('evidence documents exist with correct structure', () => {
      expect(fullResult!.evidenceDocs).toBeDefined();
      expect(Array.isArray(fullResult!.evidenceDocs)).toBe(true);
      // Vulnerable code should produce at least some issues
      expect(fullResult!.evidenceDocs!.length).toBeGreaterThan(0);

      for (const doc of fullResult!.evidenceDocs!) {
        expect(doc.issueTitle).toBeTruthy();
        expect(typeof doc.issueTitle).toBe('string');
        expect(VALID_SEVERITIES).toContain(doc.severity);
        expect(doc.filePath).toBeTruthy();
        expect(typeof doc.filePath).toBe('string');
        expect(Array.isArray(doc.lineRange)).toBe(true);
        expect(doc.lineRange).toHaveLength(2);
        expect(typeof doc.lineRange[0]).toBe('number');
        expect(typeof doc.lineRange[1]).toBe('number');
      }
    });

    it('summary has valid structure', () => {
      expect(fullResult!.summary).toBeDefined();
      const summary = fullResult!.summary!;

      expect(summary.totalReviewers).toBeGreaterThanOrEqual(3);
      expect(typeof summary.forfeitedReviewers).toBe('number');
      expect(summary.forfeitedReviewers).toBeLessThan(summary.totalReviewers);
      expect(typeof summary.severityCounts).toBe('object');
      expect(Array.isArray(summary.topIssues)).toBe(true);

      // Verify severity counts keys are valid
      for (const key of Object.keys(summary.severityCounts)) {
        expect(VALID_SEVERITIES).toContain(key);
      }
    });

    // -- Phase 4: L2 Discussion --

    it('discussions occurred for vulnerable code', () => {
      expect(fullResult!.discussions).toBeDefined();
      expect(Array.isArray(fullResult!.discussions)).toBe(true);
      // Strict mode + highly vulnerable code should produce at least 1 discussion
      expect(fullResult!.discussions!.length).toBeGreaterThanOrEqual(1);

      for (const discussion of fullResult!.discussions!) {
        expect(discussion.discussionId).toBeTruthy();
        expect(discussion.filePath).toBeTruthy();
        expect(Array.isArray(discussion.lineRange)).toBe(true);
        expect(typeof discussion.consensusReached).toBe('boolean');
        expect(typeof discussion.rounds).toBe('number');
        expect(typeof discussion.reasoning).toBe('string');
      }
    });

    it('discussion rounds have supporter stances', () => {
      expect(fullResult!.roundsPerDiscussion).toBeDefined();

      const roundsMap = fullResult!.roundsPerDiscussion!;
      const discussionIds = Object.keys(roundsMap);

      // At least one discussion should have round data
      if (discussionIds.length > 0) {
        const firstId = discussionIds[0];
        const rounds = roundsMap[firstId];
        expect(Array.isArray(rounds)).toBe(true);

        if (rounds.length > 0) {
          const firstRound = rounds[0];
          expect(typeof firstRound.round).toBe('number');
          expect(Array.isArray(firstRound.supporterResponses)).toBe(true);

          for (const resp of firstRound.supporterResponses) {
            expect(resp.supporterId).toBeTruthy();
            expect(typeof resp.response).toBe('string');
            expect(['agree', 'disagree', 'neutral']).toContain(resp.stance);
          }
        }
      }
    });

    // -- Phase 5: L3 Verdict --

    it('final verdict is a valid decision', () => {
      expect(fullResult!.summary).toBeDefined();
      expect(VALID_DECISIONS).toContain(fullResult!.summary!.decision);
      expect(typeof fullResult!.summary!.reasoning).toBe('string');
      expect(fullResult!.summary!.reasoning.length).toBeGreaterThan(0);
    });

    it('summary discussion counts are consistent', () => {
      const summary = fullResult!.summary!;
      expect(typeof summary.totalDiscussions).toBe('number');
      expect(typeof summary.resolved).toBe('number');
      expect(typeof summary.escalated).toBe('number');
      expect(summary.resolved + summary.escalated).toBeLessThanOrEqual(summary.totalDiscussions);
    });
  });

  // ==========================================================================
  // Phase 6: Session Chain
  // ==========================================================================

  describe('Phase 6: Session Persistence', () => {
    it('session directory was created', async () => {
      expect(fullResult).toBeDefined();
      const sessionDir = path.join(
        tmpDir,
        '.ca',
        'sessions',
        fullResult!.date,
        fullResult!.sessionId,
      );
      const stat = await fs.stat(sessionDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('reviews directory has files', async () => {
      const reviewsDir = path.join(
        tmpDir,
        '.ca',
        'sessions',
        fullResult!.date,
        fullResult!.sessionId,
        'reviews',
      );
      const files = await fs.readdir(reviewsDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it('listSessions finds the session', async () => {
      const { listSessions } = await import('@codeagora/core/session/queries.js');
      const sessions = await listSessions(tmpDir, { limit: 10 });

      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const found = sessions.find(
        (s) => s.id === `${fullResult!.date}/${fullResult!.sessionId}`,
      );
      expect(found).toBeDefined();
      expect(found!.status).toBe('completed');
    });

    it('showSession returns session detail', async () => {
      const { showSession } = await import('@codeagora/core/session/queries.js');
      const detail = await showSession(
        tmpDir,
        `${fullResult!.date}/${fullResult!.sessionId}`,
      );

      expect(detail.entry).toBeDefined();
      expect(detail.entry.status).toBe('completed');
      expect(detail.metadata).toBeDefined();
    });
  });

  // ==========================================================================
  // Phase 7: Quick Mode (L1 only, skip discussion + verdict)
  // ==========================================================================

  describe('Phase 7: Quick Mode (L1 only)', () => {
    let quickResult: Awaited<ReturnType<typeof import('@codeagora/core/pipeline/orchestrator.js').runPipeline>> | undefined;

    beforeAll(async () => {
      process.chdir(tmpDir);

      // Write quick config (maxRounds=0)
      await fs.writeFile(
        path.join(tmpDir, '.ca', 'config.json'),
        JSON.stringify(buildQuickConfig(), null, 2),
      );

      const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
      quickResult = await runPipeline({
        diffPath,
        skipDiscussion: true,
        skipHead: true,
        noCache: true,
        contextLines: 0,
      });
    }, 180_000);

    afterAll(async () => {
      // Restore full config for subsequent tests
      await fs.writeFile(
        path.join(tmpDir, '.ca', 'config.json'),
        JSON.stringify(buildConfig(), null, 2),
      );
    });

    it('returns success with evidence', () => {
      expect(quickResult).toBeDefined();
      expect(quickResult!.status).toBe('success');
      expect(quickResult!.evidenceDocs).toBeDefined();
      expect(quickResult!.evidenceDocs!.length).toBeGreaterThan(0);
    });

    it('discussions are empty in quick mode', () => {
      // In skipDiscussion mode, discussions should be empty
      expect(quickResult!.discussions).toBeDefined();
      expect(quickResult!.discussions).toHaveLength(0);
    });

    it('verdict is NEEDS_HUMAN in lightweight mode', () => {
      expect(quickResult!.summary).toBeDefined();
      expect(quickResult!.summary!.decision).toBe('NEEDS_HUMAN');
      expect(quickResult!.summary!.reasoning).toContain('Lightweight');
    });
  });

  // ==========================================================================
  // Phase 8: Empty Diff
  // ==========================================================================

  describe('Phase 8: Empty Diff', () => {
    it('empty diff returns success with no evidence', async () => {
      process.chdir(tmpDir);

      const emptyDiffPath = path.join(tmpDir, 'empty.diff');
      await fs.writeFile(emptyDiffPath, '', 'utf-8');

      const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
      const result = await runPipeline({
        diffPath: emptyDiffPath,
        noCache: true,
        contextLines: 0,
      });

      // Empty diff should complete successfully (no chunks to process)
      expect(result.status).toBe('success');
      // No evidence expected from an empty diff
      expect(result.evidenceDocs ?? []).toHaveLength(0);
    }, 30_000);
  });

  // ==========================================================================
  // Phase 9: Review Rules Engine
  // ==========================================================================

  describe('Phase 9: Review Rules (.reviewrules)', () => {
    let rulesResult: Awaited<ReturnType<typeof import('@codeagora/core/pipeline/orchestrator.js').runPipeline>> | undefined;

    beforeAll(async () => {
      process.chdir(tmpDir);

      // Create .reviewrules YAML file with a simple regex pattern.
      // The vulnerable server.ts contains hardcoded passwords and dangerous function calls.
      const rulesYaml = [
        'rules:',
        '  - id: no-hardcoded-secret',
        "    pattern: \"(password|secret|api.key).*=.*'\"",
        '    severity: CRITICAL',
        '    message: "Hardcoded secret detected in source code"',
        '    filePatterns:',
        '      - "*.ts"',
      ].join('\n');

      await fs.writeFile(path.join(tmpDir, '.reviewrules'), rulesYaml, 'utf-8');

      // Run pipeline with rules (quick mode to save API calls)
      const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
      rulesResult = await runPipeline({
        diffPath,
        skipDiscussion: true,
        skipHead: true,
        noCache: true,
        contextLines: 0,
      });
    }, 180_000);

    afterAll(async () => {
      // Clean up rules file
      await fs.unlink(path.join(tmpDir, '.reviewrules')).catch(() => {});
    });

    it('returns success', () => {
      expect(rulesResult).toBeDefined();
      expect(rulesResult!.status).toBe('success');
    });

    it('evidence includes rule-sourced documents', () => {
      const docs = rulesResult!.evidenceDocs ?? [];
      const ruleDocs = docs.filter((d) => d.source === 'rule');

      // The vulnerable server has hardcoded passwords that match the rule pattern
      expect(ruleDocs.length).toBeGreaterThan(0);

      for (const doc of ruleDocs) {
        expect(doc.source).toBe('rule');
        expect(doc.issueTitle).toMatch(/^Rule:/);
        expect(VALID_SEVERITIES).toContain(doc.severity);
      }
    });
  });

}, { timeout: 600_000 });
