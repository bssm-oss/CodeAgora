import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/tests/**', '!src/**/*.test.ts'],
  format: ['esm'],
  target: 'node20',
  dts: false,
  clean: true,
  outDir: 'dist',
  bundle: false,
  external: [/^@codeagora\//],
});
