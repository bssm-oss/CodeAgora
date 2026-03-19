/**
 * E2E Pipeline Test
 * Tests complete V3 pipeline with mock backends
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import * as backend from '@codeagora/core/l1/backend.js';

describe('E2E Pipeline', () => {
  let testBaseDir: string;
  let originalCwd: string;
  const testDiffPath = '/tmp/test-v3-diff.txt';
  const testDiff = `diff --git a/auth.ts b/auth.ts
index 123..456 789
--- a/auth.ts
+++ b/auth.ts
@@ -10,5 +10,5 @@
-const query = "SELECT * FROM users WHERE username = '" + username + "'";
+const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
`;

  const mockConfig = {
    reviewers: [
      { id: 'r1', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
      { id: 'r2', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
      { id: 'r3', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    ],
    supporters: {
      pool: [
        { id: 'sp1', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
        { id: 'sp2', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
      ],
      pickCount: 2,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 's-devil',
        backend: 'codex',
        model: 'test',
        enabled: true,
        timeout: 120,
      },
      personaPool: ['/tmp/test-persona.md'],
      personaAssignment: 'random',
    },
    moderator: { backend: 'codex', model: 'test' },
    discussion: {
      maxRounds: 3,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 2,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
    },
    errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
  };

  beforeEach(async () => {
    // Isolate each test in a unique temp directory (requires pool: 'forks' via poolMatchGlobs)
    originalCwd = process.cwd();
    testBaseDir = path.join(tmpdir(), `codeagora-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testBaseDir, { recursive: true });
    process.chdir(testBaseDir);

    // Create test diff
    await fs.writeFile(testDiffPath, testDiff, 'utf-8');

    // Create test persona
    await fs.writeFile('/tmp/test-persona.md', '# Test Persona\nYou are a test reviewer.', 'utf-8');

    // Create mock config in isolated temp dir
    await fs.mkdir('.ca', { recursive: true });
    await fs.writeFile('.ca/config.json', JSON.stringify(mockConfig));

    // Mock backend executor
    vi.spyOn(backend, 'executeBackend').mockResolvedValue(`
## Issue: SQL Injection Risk

### 문제
In auth.ts:10, template literal doesn't prevent SQL injection

### 근거
1. User input is still not sanitized
2. Template literals don't escape SQL
3. Should use parameterized queries

### 심각도
CRITICAL

### 제안
Use prepared statements: db.query('SELECT * FROM users WHERE username = ?', [username])
    `);
  });

  afterEach(async () => {
    // Restore original CWD before cleanup
    process.chdir(originalCwd);

    // Cleanup isolated temp directory
    await fs.rm(testBaseDir, { recursive: true, force: true });
    await fs.unlink(testDiffPath).catch(() => {});
    await fs.unlink('/tmp/test-persona.md').catch(() => {});
    vi.restoreAllMocks();
  });

  it('should run complete pipeline successfully', async () => {
    const result = await runPipeline({ diffPath: testDiffPath });

    expect(result.status).toBe('success');
    expect(result.sessionId).toBe('001');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify session directory created
    const sessionDir = `.ca/sessions/${result.date}/${result.sessionId}`;
    const stat = await fs.stat(sessionDir);
    expect(stat.isDirectory()).toBe(true);

    // Verify reviews written
    const reviewsDir = `${sessionDir}/reviews`;
    const reviewFiles = await fs.readdir(reviewsDir);
    expect(reviewFiles.length).toBeGreaterThan(0);

    // Verify report written
    const reportPath = `${sessionDir}/report.md`;
    const reportExists = await fs.stat(reportPath).then(() => true).catch(() => false);
    expect(reportExists).toBe(true);

    // Verify result written
    const resultPath = `${sessionDir}/result.md`;
    const resultExists = await fs.stat(resultPath).then(() => true).catch(() => false);
    expect(resultExists).toBe(true);
  }, 30000);

  it('should handle backend failures gracefully', async () => {
    // Clear previous mocks
    vi.restoreAllMocks();

    // Mock all backends to fail
    vi.spyOn(backend, 'executeBackend').mockRejectedValue(new Error('Backend failed'));

    const result = await runPipeline({ diffPath: testDiffPath });

    // Should fail gracefully when backends fail
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
  });

  it('should create discussions from CRITICAL issues found by reviewers', async () => {
    vi.restoreAllMocks();

    // All 3 reviewers find the same CRITICAL issue at the same location.
    // With registrationThreshold.CRITICAL = 1, a single CRITICAL evidence doc
    // at a location is enough to register a discussion.
    // The mock backend returns the same response for all reviewers which the
    // parser will turn into identical EvidenceDocuments that group together.
    vi.spyOn(backend, 'executeBackend').mockResolvedValue(`## Issue: SQL Injection Vulnerability

### 문제
In auth.ts:10

The user input is directly interpolated into SQL query without sanitization.

### 근거
1. Username parameter is taken directly from user input
2. Template literals do not escape SQL special characters
3. No input validation or escaping is performed

### 심각도
CRITICAL

### 제안
Use parameterized queries: db.query('SELECT * FROM users WHERE username = ?', [username])
`);

    const result = await runPipeline({ diffPath: testDiffPath });

    expect(result.status).toBe('success');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify session directory and report exist
    const sessionDir = `.ca/sessions/${result.date}/${result.sessionId}`;
    const reportPath = `${sessionDir}/report.md`;
    const reportContent = await fs.readFile(reportPath, 'utf-8');

    // The report should contain discussion content (not just "0 issue(s)")
    // A CRITICAL issue from 3 reviewers at auth.ts:10 should produce at least 1 discussion
    expect(reportContent).toContain('Total Discussions');
    // The discussions dir should exist with at least one discussion subfolder
    const discussionsDir = `${sessionDir}/discussions`;
    const discussionExists = await fs.stat(discussionsDir).then(() => true).catch(() => false);
    expect(discussionExists).toBe(true);
  }, 30000);

  it('should fail with forfeit error when too many reviewers fail', async () => {
    vi.restoreAllMocks();

    // Use a config with a low forfeit threshold
    const strictConfig = {
      ...mockConfig,
      errorHandling: { maxRetries: 0, forfeitThreshold: 0.5 },
    };
    await fs.writeFile('.ca/config.json', JSON.stringify(strictConfig));

    // Make 2 out of 3 reviewers fail (67% > 50% threshold)
    let callCount = 0;
    vi.spyOn(backend, 'executeBackend').mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        // First two calls are for the two failing reviewers (each retried 0+1 times)
        throw new Error('Backend unavailable');
      }
      // Third reviewer succeeds
      return `## Issue: Minor Style Issue

### 문제
In auth.ts:10

Minor formatting issue.

### 근거
1. Inconsistent style

### 심각도
SUGGESTION

### 제안
Reformat the line.
`;
    });

    const result = await runPipeline({ diffPath: testDiffPath });

    expect(result.status).toBe('error');
    expect(result.error).toContain('forfeited');
  }, 30000);
});
