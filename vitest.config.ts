import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

const resolveReal = (mod: string) => fs.realpathSync(path.resolve(__dirname, 'node_modules', mod));

export default defineConfig({
  resolve: {
    alias: [
      // Subpath imports: @codeagora/cli/commands/doctor.js → packages/cli/src/commands/doctor.js
      { find: /^@codeagora\/(shared|core|github|notifications|cli|tui|mcp|web)\/(.+)$/, replacement: path.resolve(__dirname, 'packages/$1/src/$2') },
      // Bare imports: @codeagora/core → packages/core/src
      { find: '@codeagora/shared', replacement: path.resolve(__dirname, 'packages/shared/src') },
      { find: '@codeagora/core', replacement: path.resolve(__dirname, 'packages/core/src') },
      { find: '@codeagora/github', replacement: path.resolve(__dirname, 'packages/github/src') },
      { find: '@codeagora/notifications', replacement: path.resolve(__dirname, 'packages/notifications/src') },
      { find: '@codeagora/cli', replacement: path.resolve(__dirname, 'packages/cli/src') },
      { find: '@codeagora/tui', replacement: path.resolve(__dirname, 'packages/tui/src') },
      { find: '@codeagora/mcp', replacement: path.resolve(__dirname, 'packages/mcp/src') },
      { find: '@codeagora/web', replacement: path.resolve(__dirname, 'packages/web/src') },
      // Pin npm deps to real pnpm store paths for vi.mock interception
      { find: 'ai', replacement: resolveReal('ai') },
      { find: '@ai-sdk/groq', replacement: resolveReal('@ai-sdk/groq') },
      { find: '@ai-sdk/google', replacement: resolveReal('@ai-sdk/google') },
      { find: '@ai-sdk/openai', replacement: resolveReal('@ai-sdk/openai') },
      { find: '@ai-sdk/openai-compatible', replacement: resolveReal('@ai-sdk/openai-compatible') },
      { find: '@ai-sdk/anthropic', replacement: resolveReal('@ai-sdk/anthropic') },
      { find: '@openrouter/ai-sdk-provider', replacement: resolveReal('@openrouter/ai-sdk-provider') },
      { find: '@octokit/rest', replacement: resolveReal('@octokit/rest') },
    ],
    // Deduplicate React/Ink to single instance (prevents "multiple copies" in monorepo)
    dedupe: ['react', 'ink', 'ink-select-input', 'ink-testing-library', 'zod', 'yaml'],
  },
  test: {
    globals: true,
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx', 'packages/*/src/tests/**/*.test.ts'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/tui/**'],
    },
  },
});
