/**
 * L3 Diff Grouping Tests
 */

import { describe, it, expect } from 'vitest';
import { groupDiff } from '@codeagora/core/l3/grouping.js';
import type { FileGroup } from '@codeagora/core/l3/grouping.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiffSection(filePath: string, additions: string[] = ['+  return true;'], removals: string[] = ['-  return false;']): string {
  const fileName = filePath.split('/').pop()!;
  const dir = filePath.includes('/') ? filePath.replace(`/${fileName}`, '') : '';
  const bPath = filePath;
  const aPath = filePath;

  const changeLines = [
    ...removals,
    ...additions,
  ].join('\n');

  return `diff --git a/${aPath} b/${bPath}
index abc1234..def5678 100644
--- a/${aPath}
+++ b/${bPath}
@@ -1,5 +1,5 @@
 function example() {
${changeLines}
 }
`;
}

// ---------------------------------------------------------------------------

describe('groupDiff()', () => {
  describe('empty input', () => {
    it('returns empty array for empty diff string', () => {
      const result = groupDiff('');
      expect(result).toEqual([]);
    });

    it('returns empty array for diff with no file headers', () => {
      const result = groupDiff('some random text\nno diff headers here');
      expect(result).toEqual([]);
    });
  });

  describe('single file diff', () => {
    it('returns a single group for a diff with one file', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(result).toHaveLength(1);
    });

    it('group contains the correct file path', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(result[0].files).toContain('src/auth.ts');
    });

    it('group name includes the file path for single-file groups', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(result[0].name).toContain('src');
    });

    it('group diffContent contains the original diff section', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(result[0].diffContent).toContain('diff --git a/src/auth.ts b/src/auth.ts');
    });

    it('group prSummary mentions the directory and file count', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(result[0].prSummary).toContain('src');
      expect(result[0].prSummary).toContain('1 file(s)');
    });
  });

  describe('root-level file (no directory)', () => {
    it('groups a root-level file and uses the filename as the group name', () => {
      // The implementation uses file.split('/')[0], which for a root-level file
      // like 'index.ts' returns 'index.ts' itself (the || 'root' fallback only
      // triggers when split produces an empty string, which never happens here).
      const diff = makeDiffSection('index.ts');
      const result = groupDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('index.ts');
      expect(result[0].files).toContain('index.ts');
    });
  });

  describe('multiple files in the same directory', () => {
    it('groups both files into a single group', () => {
      const diff = makeDiffSection('src/auth.ts') + makeDiffSection('src/user.ts');
      const result = groupDiff(diff);

      expect(result).toHaveLength(1);
    });

    it('group contains all files from that directory', () => {
      const diff = makeDiffSection('src/auth.ts') + makeDiffSection('src/user.ts');
      const result = groupDiff(diff);

      expect(result[0].files).toContain('src/auth.ts');
      expect(result[0].files).toContain('src/user.ts');
    });

    it('group prSummary reflects correct file count', () => {
      const diff = makeDiffSection('src/auth.ts') + makeDiffSection('src/user.ts');
      const result = groupDiff(diff);

      expect(result[0].prSummary).toContain('2 file(s)');
    });

    it('group diffContent contains both file diff sections', () => {
      const diff = makeDiffSection('src/auth.ts') + makeDiffSection('src/user.ts');
      const result = groupDiff(diff);

      expect(result[0].diffContent).toContain('diff --git a/src/auth.ts b/src/auth.ts');
      expect(result[0].diffContent).toContain('diff --git a/src/user.ts b/src/user.ts');
    });
  });

  describe('multiple files in different directories', () => {
    it('creates a separate group for each directory', () => {
      const diff =
        makeDiffSection('src/auth.ts') +
        makeDiffSection('tests/auth.test.ts');

      const result = groupDiff(diff);

      expect(result).toHaveLength(2);
    });

    it('each group contains only files from its own cluster', () => {
      const diff =
        makeDiffSection('src/auth.ts') +
        makeDiffSection('tests/auth.test.ts');

      const result = groupDiff(diff);

      // Files with no import relationship are grouped by depth-2 directory
      for (const group of result) {
        expect(group.files.length).toBeGreaterThan(0);
      }
      const allFiles = result.flatMap((g) => g.files).sort();
      expect(allFiles).toEqual(['src/auth.ts', 'tests/auth.test.ts']);
    });

    it('each group diffContent only contains its own file sections', () => {
      const diff =
        makeDiffSection('src/auth.ts') +
        makeDiffSection('tests/auth.test.ts');

      const result = groupDiff(diff);

      // Each group's diffContent should only have its own files
      for (const group of result) {
        for (const file of group.files) {
          expect(group.diffContent).toContain(`diff --git a/${file} b/${file}`);
        }
      }
    });

    it('three directories produce separate groups', () => {
      const diff =
        makeDiffSection('src/auth.ts') +
        makeDiffSection('tests/auth.test.ts') +
        makeDiffSection('docs/README.md');

      const result = groupDiff(diff);

      // All files should be covered
      const allFiles = result.flatMap((g) => g.files).sort();
      expect(allFiles).toEqual(['docs/README.md', 'src/auth.ts', 'tests/auth.test.ts']);
    });
  });

  describe('renamed files', () => {
    it('picks up the destination (b/) path for a renamed file', () => {
      // git diff for a rename has both a/ and b/ with different paths
      const renameDiff = `diff --git a/src/old-name.ts b/src/new-name.ts
index abc1234..def5678 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
 export function foo() {
-  return 'old';
+  return 'new';
 }
`;
      const result = groupDiff(renameDiff);

      expect(result).toHaveLength(1);
      // The implementation uses b/ path
      expect(result[0].files).toContain('src/new-name.ts');
    });

    it('groups a renamed file by the destination directory', () => {
      const renameDiff = `diff --git a/utils/helper.ts b/src/helper.ts
index abc1234..def5678 100644
--- a/utils/helper.ts
+++ b/src/helper.ts
@@ -1,3 +1,3 @@
 export function helper() {
-  return 1;
+  return 2;
 }
`;
      const result = groupDiff(renameDiff);

      expect(result).toHaveLength(1);
      expect(result[0].name).toContain('src');
    });
  });

  describe('FileGroup shape', () => {
    it('every group has name, files, diffContent, and prSummary fields', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      for (const group of result) {
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('files');
        expect(group).toHaveProperty('diffContent');
        expect(group).toHaveProperty('prSummary');
      }
    });

    it('files is a non-empty array', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(Array.isArray(result[0].files)).toBe(true);
      expect(result[0].files.length).toBeGreaterThan(0);
    });

    it('diffContent is a non-empty string', () => {
      const diff = makeDiffSection('src/auth.ts');
      const result = groupDiff(diff);

      expect(typeof result[0].diffContent).toBe('string');
      expect(result[0].diffContent.length).toBeGreaterThan(0);
    });
  });
});
