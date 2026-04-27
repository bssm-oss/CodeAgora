import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: false,
  clean: true,
  outDir: 'dist',
  bundle: true,
  splitting: false,
});
