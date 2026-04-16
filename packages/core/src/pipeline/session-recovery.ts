/**
 * Pipeline Session Recovery & Project Context Detection
 * Handles stale session recovery and project context auto-detection.
 */

import type { ReviewContext } from '../types/config.js';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Project Context Detection (#237)
// ============================================================================

/**
 * Auto-detect project context from package.json and monorepo indicators.
 * Returned string is injected into reviewer prompts to prevent false positives
 * (e.g. flagging workspace:* in pnpm monorepos, suggesting wrong libraries).
 */
export async function detectProjectContext(repoPath: string, userContext?: ReviewContext): Promise<string | undefined> {
  try {
    const lines: string[] = [];

    // ── 1. User-defined deployment type (highest priority) ──────────────
    if (userContext?.deploymentType) {
      const deployDescriptions: Record<string, string> = {
        'github-action': 'Deployment: GitHub Action — dist/ is a SELF-CONTAINED BUNDLE. All dependencies MUST be inlined. Do NOT flag bundled dependencies as external or missing.',
        'cli': 'Deployment: CLI tool — distributed as a standalone executable or npm package.',
        'library': 'Deployment: Library — published to a package registry. Public API surface matters.',
        'web-app': 'Deployment: Web application — bundled for browser delivery.',
        'api-server': 'Deployment: API server — runs as a long-lived process.',
        'lambda': 'Deployment: Serverless function (Lambda/Cloud Function) — cold-start and bundle size matter.',
        'docker': 'Deployment: Docker container — multi-stage builds and image size matter.',
        'edge-function': 'Deployment: Edge function — strict runtime constraints, limited APIs.',
        'monorepo': 'Architecture: monorepo (workspace:* dependencies are STANDARD and correct — do NOT flag them).',
      };
      lines.push(deployDescriptions[userContext.deploymentType] ?? `Deployment: ${userContext.deploymentType}`);
    }

    // ── 2. Auto-detect build/deploy from marker files ──────────────────
    const markerFiles: Array<[string[], string]> = [
      [['action.yml', 'action.yaml'], 'Deployment: GitHub Action — dist/ is a SELF-CONTAINED BUNDLE. All dependencies MUST be inlined. Do NOT flag bundled dependencies as external or missing.'],
      [['Dockerfile'], 'Build: Docker container detected.'],
      [['serverless.yml', 'serverless.yaml'], 'Deployment: Serverless Framework detected.'],
      [['vercel.json'], 'Deployment: Vercel detected.'],
      [['netlify.toml'], 'Deployment: Netlify detected.'],
      [['fly.toml'], 'Deployment: Fly.io detected.'],
      [['wrangler.toml'], 'Deployment: Cloudflare Workers detected.'],
    ];

    for (const [files, label] of markerFiles) {
      for (const f of files) {
        const exists = await fs.access(path.join(repoPath, f)).then(() => true).catch(() => false);
        if (exists) {
          lines.push(label);
          break; // only add once per marker group
        }
      }
    }

    // ── 3. User-defined bundled outputs ────────────────────────────────
    if (userContext?.bundledOutputs && userContext.bundledOutputs.length > 0) {
      lines.push(`Bundled outputs: ${userContext.bundledOutputs.join(', ')} — all deps inlined, do NOT flag external/missing dependency issues in these paths.`);
    }

    // ── 4. package.json analysis (existing logic) ──────────────────────
    const pkgPath = path.join(repoPath, 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf-8').catch(() => null);
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        packageManager?: string;
      };

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps);

      if (pkg.name) lines.push(`Project: ${pkg.name}`);

      // Monorepo detection
      const isMonorepo = await fs.access(path.join(repoPath, 'pnpm-workspace.yaml')).then(() => true).catch(() => false)
        || await fs.access(path.join(repoPath, 'lerna.json')).then(() => true).catch(() => false)
        || await fs.access(path.join(repoPath, 'nx.json')).then(() => true).catch(() => false);
      if (isMonorepo) {
        lines.push('Architecture: monorepo (workspace:* dependencies are STANDARD and correct — do NOT flag them)');
      }

      // Package manager
      if (pkg.packageManager?.startsWith('pnpm') || depNames.includes('pnpm')) {
        lines.push('Package manager: pnpm');
      }

      // Key frameworks / libraries — used to prevent wrong-library suggestions
      const knownLibs: Array<[string[], string]> = [
        [['zod'], 'Validation: zod (do NOT suggest joi, yup, or other validation libraries)'],
        [['joi'], 'Validation: joi'],
        [['express'], 'Framework: Express'],
        [['fastify'], 'Framework: Fastify'],
        [['hono'], 'Framework: Hono'],
        [['next'], 'Framework: Next.js'],
        [['nuxt'], 'Framework: Nuxt'],
        [['react'], 'UI: React'],
        [['vue'], 'UI: Vue'],
        [['prisma', '@prisma/client'], 'ORM: Prisma'],
        [['typeorm'], 'ORM: TypeORM'],
        [['drizzle-orm'], 'ORM: Drizzle'],
        [['vitest'], 'Test: vitest'],
        [['jest'], 'Test: jest'],
        [['typescript'], 'Language: TypeScript (strict mode expected)'],
      ];

      for (const [keys, label] of knownLibs) {
        if (keys.some((k) => depNames.includes(k))) {
          lines.push(label);
        }
      }
    }

    // ── 5. User-defined notes (appended last) ─────────────────────────
    if (userContext?.notes && userContext.notes.length > 0) {
      for (const note of userContext.notes) {
        lines.push(note);
      }
    }

    if (lines.length === 0) return undefined;
    return `## Project Context\n${lines.map((l) => `- ${l}`).join('\n')}\n\nDo NOT flag items that conform to the above context as issues.`;
  } catch {
    return undefined;
  }
}
