import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/frontend/render/**', 'jsdom'],
    ],
    setupFiles: ['tests/frontend/render/setup.ts'],
  },
  resolve: {
    alias: {
      '@codeagora/core': path.resolve(__dirname, '../core/src'),
      '@codeagora/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
