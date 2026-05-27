import { defineConfig } from 'tsup';
import { copyFile, mkdir } from 'fs/promises';
import { resolve } from 'path';

async function copyAssets(): Promise<void> {
  const dist = resolve('dist');
  await mkdir(dist, { recursive: true });
  await copyFile(resolve('src/index.html'), resolve(dist, 'index.html'));
  await copyFile(resolve('src/styles.css'), resolve(dist, 'styles.css'));
}

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: false,
  clean: true,
  outDir: 'dist',
  bundle: true,
  noExternal: ['@codeagora/shared'],
  splitting: false,
  onSuccess: copyAssets,
});
