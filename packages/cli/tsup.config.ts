import { defineConfig } from 'tsup';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { Plugin } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));
const PKG_VERSION = rootPkg.version;

/**
 * esbuild plugin that resolves @codeagora/* subpath imports
 * to their TypeScript source files in the monorepo.
 */
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
          return { path: path.join(packagesDir, pkg, 'src', 'index.ts') };
        }

        const tsPath = rest.replace(/\.js$/, '.ts');
        return { path: path.join(packagesDir, pkg, 'src', tsPath) };
      });
    },
  };
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  bundle: true,
  splitting: false,
  // shebang already in src/index.ts — tsup preserves it
  noExternal: [/^@codeagora\/(?!mcp)/],
  // Keep all npm dependencies external — they'll be installed from package.json
  external: [
    /^@ai-sdk\//,
    /^@openrouter\//,
    /^@octokit\//,
    /^@clack\//,
    /^@modelcontextprotocol\//,
    'ai',
    'zod',
    'commander',
    'ora',
    'yaml',
    'picocolors',
    'p-limit',
    /^@codeagora\/mcp/,
  ],
  define: {
    'process.env.CODEAGORA_VERSION': JSON.stringify(PKG_VERSION),
  },
  esbuildPlugins: [workspaceResolver()],
});
