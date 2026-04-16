import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    pool: 'forks',
  },
  resolve: {
    alias: [
      {
        find: /^@codeagora\/(shared|core)\/(.+)$/,
        replacement: path.resolve(__dirname, '../$1/src/$2'),
      },
      { find: '@codeagora/shared', replacement: path.resolve(__dirname, '../shared/src') },
      { find: '@codeagora/core', replacement: path.resolve(__dirname, '../core/src') },
    ],
    dedupe: ['react', 'ink', 'ink-select-input', 'ink-testing-library'],
  },
});
