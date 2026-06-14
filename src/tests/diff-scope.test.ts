import { describe, expect, it } from 'vitest';
import { classifyNoCodeDiffScope } from '@codeagora/shared/utils/diff.js';

function diffFor(filePath: string, addedLine = 'new line'): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    'index 1111111..2222222 100644',
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -1 +1 @@',
    '-old line',
    `+${addedLine}`,
    '',
  ].join('\n');
}

describe('classifyNoCodeDiffScope()', () => {
  it('classifies markdown and docs paths as docs-only', () => {
    const diff = `${diffFor('README.md')}\n${diffFor('docs/setup.md')}`;

    expect(classifyNoCodeDiffScope(diff)).toBe('docs-only');
  });

  it('classifies generated bundle artifacts as generated-only', () => {
    const diff = `${diffFor('dist/action.js')}\n${diffFor('packages/cli/dist/index.js.map')}`;

    expect(classifyNoCodeDiffScope(diff)).toBe('generated-only');
  });

  it('keeps mixed docs and source diffs on the normal code-change path', () => {
    const diff = `${diffFor('README.md')}\n${diffFor('packages/core/src/index.ts', 'export const value = 1;')}`;

    expect(classifyNoCodeDiffScope(diff)).toBe('code-change');
  });
});
