import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.{ts,tsx}',
      'src/server/tests/**/*.test.ts',
    ],
    environmentMatchGlobs: [
      ['tests/frontend/render/**', 'jsdom'],
      ['tests/frontend/hooks-*.test.ts', 'jsdom'],
    ],
    // jest-dom matchers only needed for jsdom render tests; safe in node env (no-op).
    setupFiles: ['tests/frontend/render/setup.ts'],
  },
  resolve: {
    alias: {
      '@codeagora/core': path.resolve(__dirname, '../core/src'),
      '@codeagora/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
