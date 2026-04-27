import { defineConfig } from 'tsup';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Plugin } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function workspaceResolver(): Plugin {
  const packagesDir = path.resolve(__dirname, '..');
  return {
    name: 'workspace-resolver',
    setup(build) {
      build.onResolve({ filter: /^@codeagora\// }, (args) => {
        const parts = args.path.replace('@codeagora/', '').split('/');
        const pkg = parts[0];
        const rest = parts.slice(1).join('/');
        if (!rest) {
          return { path: path.join(packagesDir, pkg!, 'src', 'index.ts') };
        }
        const tsPath = rest.replace(/\.js$/, '.ts');
        return { path: path.join(packagesDir, pkg!, 'src', tsPath) };
      });
    },
  };
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  bundle: true,
  splitting: false,
  noExternal: [/^@codeagora\/(core|shared)/],
  external: [
    /^@ai-sdk\//,
    /^@openrouter\//,
    /^@codeagora\/cli/,
    /^@codeagora\/github/,
    '@modelcontextprotocol/sdk',
    'ai',
    'zod',
    'yaml',
    'picocolors',
    'p-limit',
  ],
  esbuildPlugins: [workspaceResolver()],
});
