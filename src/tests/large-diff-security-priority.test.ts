import { describe, expect, it } from 'vitest';
import { chunkDiffWithMetadata } from '@codeagora/core/pipeline/chunker.js';
import { redactSecrets } from '@codeagora/shared/utils/redaction.js';

function fileDiff(filePath: string, addedLines: string[]): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -1,1 +1,2 @@',
    '-old',
    ...addedLines.map((line) => `+${line}`),
  ].join('\n');
}

describe('large-diff security priority surfaces', () => {
  it('prioritizes security-sensitive chunks before docs/noise chunks', async () => {
    const docsLines = Array.from({ length: 80 }, (_, index) => `docs line ${index} with harmless release note text`);
    const diff = [
      fileDiff('docs/runbook.md', docsLines),
      fileDiff('.github/workflows/ci.yml', ['permissions: write-all', 'Authorization: Bearer test-secret']),
      fileDiff('src/auth/session.ts', ['const token = process.env.GITHUB_TOKEN;', 'if (role === "admin") return true;']),
      fileDiff('src/config/secrets.ts', ['const fallback = "OPENAI_API_KEY=sk-test-secret";']),
      fileDiff('docs/changelog.md', docsLines),
    ].join('\n');

    const result = await chunkDiffWithMetadata(diff, { maxTokens: 120 });

    expect(result.metadata.diffChunking.priorityFiles).toEqual([
      '.github/workflows/ci.yml',
      'src/auth/session.ts',
      'src/config/secrets.ts',
    ]);
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks[0]?.files).toContain('.github/workflows/ci.yml');
    expect(result.chunks[0]?.files).not.toContain('docs/changelog.md');
  });

  it('keeps security-priority evidence sanitized for public surfaces', async () => {
    const diff = [
      fileDiff('src/auth/session.ts', ['const token = "OPENAI_API_KEY=sk-test-secret";', 'Authorization: Bearer test-secret']),
      fileDiff('docs/readme.md', ['safe docs update']),
    ].join('\n');

    const result = await chunkDiffWithMetadata(diff, { maxTokens: 80 });
    const publicSurfacePayload = redactSecrets(JSON.stringify({
      cli: result.chunks[0]?.files,
      github: result.metadata.diffChunking.priorityFiles,
      mcp: result.metadata.diffChunking.priorityFiles,
      diff: result.chunks[0]?.diffContent,
    }));

    expect(publicSurfacePayload).toContain('src/auth/session.ts');
    expect(publicSurfacePayload).not.toContain('sk-test-secret');
    expect(publicSurfacePayload).not.toContain('Bearer test-secret');
  });
});
