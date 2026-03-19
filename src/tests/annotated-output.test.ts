/**
 * Annotated Output Formatter Tests
 */

import { describe, it, expect } from 'vitest';
import { formatAnnotated } from '@codeagora/cli/formatters/annotated-output.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SIMPLE_DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index abc..def 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -9,4 +9,4 @@
 const host = 'localhost';
-const query = "SELECT * FROM users WHERE name = '" + name + "'";
+const query = \`SELECT * FROM users WHERE name = '\${name}'\`;
 const result = await db.execute(query);
 return result;
`;

const TWO_FILE_DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index abc..def 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,3 +10,3 @@
-const query = "bad query";
+const query = \`good query\`;
 const result = await db.execute(query);
diff --git a/src/utils/cache.ts b/src/utils/cache.ts
index 123..456 100644
--- a/src/utils/cache.ts
+++ b/src/utils/cache.ts
@@ -1,5 +1,5 @@
 const a = 1;
 const b = 2;
 const c = 3;
+const d = 4;
 const e = 5;
`;

function makeIssue(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'SQL injection vulnerability',
    problem: 'Unparameterized query',
    evidence: ['line 10'],
    severity: 'CRITICAL',
    suggestion: 'Use parameterized queries',
    filePath: 'src/auth/login.ts',
    lineRange: [10, 10],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatAnnotated()', () => {
  it('includes the file header for a single file', () => {
    const result = formatAnnotated(SIMPLE_DIFF, []);
    expect(result).toContain('src/auth/login.ts');
  });

  it('shows collapsed notice when there are no issues', () => {
    const result = formatAnnotated(SIMPLE_DIFF, []);
    expect(result).toMatch(/no issues.*lines collapsed/i);
  });

  it('shows diff lines with line numbers when issues are present', () => {
    const issue = makeIssue();
    const result = formatAnnotated(SIMPLE_DIFF, [issue]);
    // Line numbers should appear
    expect(result).toMatch(/\d+/);
    // + and - diff lines from SIMPLE_DIFF should appear
    expect(result).toContain('SELECT * FROM users');
  });

  it('renders the issue badge after the matching line', () => {
    const issue = makeIssue({ lineRange: [10, 10] });
    const result = formatAnnotated(SIMPLE_DIFF, [issue]);
    expect(result).toContain('SQL injection vulnerability');
    expect(result).toContain('CRITICAL');
  });

  it('badge uses severity-appropriate symbol for HARSHLY_CRITICAL', () => {
    const issue = makeIssue({ severity: 'HARSHLY_CRITICAL', issueTitle: 'XSS vector' });
    const result = formatAnnotated(SIMPLE_DIFF, [issue]);
    expect(result).toContain('HARSHLY_CRITICAL');
    expect(result).toContain('XSS vector');
  });

  it('badge uses SUGGESTION severity', () => {
    const issue = makeIssue({ severity: 'SUGGESTION', issueTitle: 'Consider caching' });
    const result = formatAnnotated(SIMPLE_DIFF, [issue]);
    expect(result).toContain('SUGGESTION');
    expect(result).toContain('Consider caching');
  });

  it('handles multiple files — two file headers present', () => {
    const result = formatAnnotated(TWO_FILE_DIFF, []);
    expect(result).toContain('src/auth/login.ts');
    expect(result).toContain('src/utils/cache.ts');
  });

  it('collapses file with no issues and shows issues in file that has them', () => {
    const issue = makeIssue({ filePath: 'src/auth/login.ts', lineRange: [10, 10] });
    const result = formatAnnotated(TWO_FILE_DIFF, [issue]);
    // auth/login.ts has an issue — should NOT be collapsed
    expect(result).toContain('SQL injection vulnerability');
    // cache.ts has no issues — should be collapsed
    const cacheSection = result.slice(result.indexOf('src/utils/cache.ts'));
    expect(cacheSection).toMatch(/no issues.*lines collapsed/i);
  });

  it('returns no-diff message for empty diff', () => {
    const result = formatAnnotated('', []);
    expect(result).toContain('no diff content');
  });

  it('multiple issues on the same line both appear', () => {
    const issue1 = makeIssue({ issueTitle: 'SQL injection vulnerability', lineRange: [10, 10] });
    const issue2 = makeIssue({ issueTitle: 'Missing validation', lineRange: [10, 10] });
    const result = formatAnnotated(SIMPLE_DIFF, [issue1, issue2]);
    expect(result).toContain('SQL injection vulnerability');
    expect(result).toContain('Missing validation');
  });
});
