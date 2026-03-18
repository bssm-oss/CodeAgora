import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

const resolveReal = (mod: string) => fs.realpathSync(path.resolve(__dirname, 'node_modules', mod));

export default defineConfig({
  resolve: {
    alias: {
      '@codeagora/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@codeagora/core': path.resolve(__dirname, 'packages/core/src'),
      '@codeagora/github': path.resolve(__dirname, 'packages/github/src'),
      '@codeagora/notifications': path.resolve(__dirname, 'packages/notifications/src'),
      '@codeagora/cli': path.resolve(__dirname, 'packages/cli/src'),
      '@codeagora/tui': path.resolve(__dirname, 'packages/tui/src'),
      // Pin npm deps to real pnpm store paths for vi.mock interception
      'ai': resolveReal('ai'),
      '@ai-sdk/groq': resolveReal('@ai-sdk/groq'),
      '@ai-sdk/google': resolveReal('@ai-sdk/google'),
      '@ai-sdk/openai': resolveReal('@ai-sdk/openai'),
      '@ai-sdk/openai-compatible': resolveReal('@ai-sdk/openai-compatible'),
      '@ai-sdk/anthropic': resolveReal('@ai-sdk/anthropic'),
      '@openrouter/ai-sdk-provider': resolveReal('@openrouter/ai-sdk-provider'),
      '@octokit/rest': resolveReal('@octokit/rest'),
    },
    // Deduplicate React/Ink to single instance (prevents "multiple copies" in monorepo)
    dedupe: ['react', 'ink', 'ink-select-input', 'ink-testing-library', 'zod', 'yaml'],
  },
  test: {
    globals: true,
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    poolMatchGlobs: [
      ['**/e2e-*.test.ts', 'forks'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['src/tests/**', 'packages/tui/**'],
    },
  },
});
