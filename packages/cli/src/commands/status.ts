/**
 * Status Command
 * Show a one-screen overview of CodeAgora state.
 */

import fs from 'fs/promises';
import path from 'path';
import { bold, dim, statusColor } from '../utils/colors.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';

// ============================================================================
// Helpers
// ============================================================================

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Calculate total size of a directory tree (bytes).
 */
async function dirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        total += stat.size;
      }
    }
  } catch {
    // directory may not exist
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ============================================================================
// Public API
// ============================================================================

export async function getStatus(baseDir: string): Promise<string> {
  const caDir = path.join(baseDir, '.ca');
  const lines: string[] = [];

  lines.push(bold(t('cli.status.title')));
  lines.push('\u2500'.repeat(40));

  // --- Config ---
  lines.push('');
  lines.push(bold(t('cli.status.config')));

  const jsonPath = path.join(caDir, 'config.json');
  const yamlPath = path.join(caDir, 'config.yaml');
  const jsonExists = await fileExists(jsonPath);
  const yamlExists = await fileExists(yamlPath);

  if (jsonExists || yamlExists) {
    const configPath = jsonExists ? jsonPath : yamlPath;
    const format = jsonExists ? 'json' : 'yaml';
    const config = await readJsonFile(configPath);
    const lang = config ? String(config['language'] ?? 'en') : 'en';
    const mode = config && typeof config['reviewers'] === 'object' && config['reviewers'] !== null
      && !Array.isArray(config['reviewers']) && 'count' in (config['reviewers'] as Record<string, unknown>)
      ? 'declarative' : 'explicit';
    lines.push(`  ${statusColor.pass('\u2713')} Found (.ca/config.${format})`);
    lines.push(`  Language: ${lang}  Mode: ${mode}`);
  } else {
    lines.push(`  ${statusColor.fail('\u2717')} Not found`);
  }

  // --- Providers ---
  lines.push('');
  lines.push(bold(t('cli.status.providers')));

  const providerNames = Object.keys(PROVIDER_ENV_VARS);
  const configured: string[] = [];
  const withKeys: string[] = [];

  for (const name of providerNames) {
    const envVar = PROVIDER_ENV_VARS[name]!;
    const hasKey = Boolean(process.env[envVar]);
    if (hasKey) {
      configured.push(name);
      withKeys.push(name);
    }
  }

  lines.push(`  ${configured.length} with API keys: ${withKeys.length > 0 ? withKeys.join(', ') : dim('none')}`);

  // --- Sessions ---
  lines.push('');
  lines.push(bold(t('cli.status.sessions')));

  const sessionsDir = path.join(caDir, 'sessions');
  if (await dirExists(sessionsDir)) {
    let totalSessions = 0;
    let lastDate = '';
    let lastVerdict = '';

    try {
      const dateDirs = (await fs.readdir(sessionsDir))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
        .reverse();

      for (const dateDir of dateDirs) {
        const datePath = path.join(sessionsDir, dateDir);
        try {
          const sessionIds = await fs.readdir(datePath);
          const dirs = [];
          for (const sid of sessionIds) {
            try {
              const stat = await fs.stat(path.join(datePath, sid));
              if (stat.isDirectory()) dirs.push(sid);
            } catch { /* skip */ }
          }
          totalSessions += dirs.length;
          if (!lastDate && dirs.length > 0) {
            lastDate = dateDir;
            // Try reading verdict from the most recent session
            const latestSid = dirs.sort().reverse()[0];
            if (latestSid) {
              const verdictData = await readJsonFile(
                path.join(datePath, latestSid, 'head-verdict.json'),
              );
              if (verdictData) {
                lastVerdict = String(verdictData['decision'] ?? '');
              }
            }
          }
        } catch { /* skip */ }
      }

      lines.push(`  Total: ${totalSessions}`);
      if (lastDate) {
        lines.push(`  ${t('cli.status.lastReview')}: ${lastDate}${lastVerdict ? ` (${lastVerdict})` : ''}`);
      }
    } catch {
      lines.push(`  ${t('cli.status.noSessions')}`);
    }
  } else {
    lines.push(`  ${t('cli.status.noSessions')}`);
  }

  // --- Models (top 3 by win rate) ---
  const modelQualityPath = path.join(caDir, 'model-quality.json');
  if (await fileExists(modelQualityPath)) {
    const mqData = await readJsonFile(modelQualityPath);
    if (mqData && typeof mqData['arms'] === 'object' && mqData['arms'] !== null) {
      const arms = mqData['arms'] as Record<string, { alpha?: number; beta?: number }>;
      const entries = Object.entries(arms)
        .map(([name, arm]) => {
          const alpha = arm.alpha ?? 1;
          const beta = arm.beta ?? 1;
          const winRate = alpha / (alpha + beta);
          return { name, winRate };
        })
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 3);

      if (entries.length > 0) {
        lines.push('');
        lines.push(bold('Models (top 3)'));
        for (const e of entries) {
          lines.push(`  ${e.name}  ${dim(`win rate: ${(e.winRate * 100).toFixed(1)}%`)}`);
        }
      }
    }
  }

  // --- Disk usage ---
  const sessionSize = await dirSize(sessionsDir);
  if (sessionSize > 0) {
    lines.push('');
    lines.push(bold('Disk'));
    lines.push(`  Sessions: ${formatBytes(sessionSize)}`);
  }

  return lines.join('\n');
}
