/**
 * Costs Command
 * Show cost analytics from past review sessions.
 */

import fs from 'fs/promises';
import path from 'path';
import { bold, dim } from '../utils/colors.js';
import { t } from '@codeagora/shared/i18n/index.js';

// ============================================================================
// Types
// ============================================================================

interface SessionCostEntry {
  sessionId: string;
  date: string;
  totalCost: number;
  reviewer?: string;
  provider?: string;
}


// ============================================================================
// Helpers
// ============================================================================

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractCostEntries(
  sessionId: string,
  date: string,
  data: Record<string, unknown>,
): SessionCostEntry[] {
  const entries: SessionCostEntry[] = [];

  // Try telemetry.costs or result.costs arrays
  const costs = data['costs'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(costs)) {
    for (const c of costs) {
      entries.push({
        sessionId,
        date,
        totalCost: Number(c['totalCost'] ?? 0),
        reviewer: String(c['reviewerId'] ?? c['model'] ?? ''),
        provider: String(c['provider'] ?? ''),
      });
    }
    return entries;
  }

  // Try flat totalCost in metadata or result
  const totalCost = data['totalCost'] ?? data['cost'];
  if (typeof totalCost === 'number' && totalCost > 0) {
    entries.push({
      sessionId,
      date,
      totalCost,
      reviewer: String(data['model'] ?? ''),
      provider: String(data['provider'] ?? ''),
    });
    return entries;
  }

  // Try performanceText or telemetry with token counts
  const tokenUsage = data['tokenUsage'] as Record<string, unknown> | undefined;
  if (tokenUsage && typeof tokenUsage['totalTokens'] === 'number') {
    // Estimate cost at ~$0.001/1K tokens as rough fallback
    const tokens = tokenUsage['totalTokens'] as number;
    entries.push({
      sessionId,
      date,
      totalCost: (tokens / 1000) * 0.001,
    });
    return entries;
  }

  return entries;
}

// ============================================================================
// Public API
// ============================================================================

export async function getCostSummary(
  baseDir: string,
  options: { last?: number; by?: string },
): Promise<string> {
  const sessionsDir = path.join(baseDir, '.ca', 'sessions');
  const allEntries: SessionCostEntry[] = [];

  let dateDirs: string[];
  try {
    const entries = await fs.readdir(sessionsDir);
    dateDirs = entries.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  } catch {
    return 'No sessions found. Run a review first.';
  }

  // Filter by --last N days
  const cutoffDate = options.last
    ? new Date(Date.now() - options.last * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : undefined;

  for (const dateDir of dateDirs) {
    if (cutoffDate && dateDir < cutoffDate) continue;

    const datePath = path.join(sessionsDir, dateDir);
    let sessionIds: string[];
    try {
      const entries = await fs.readdir(datePath);
      sessionIds = entries.sort();
    } catch {
      continue;
    }

    for (const sid of sessionIds) {
      const sessionPath = path.join(datePath, sid);
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(sessionPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      // Try reading result.json, then metadata.json, then telemetry.json
      const filesToTry = ['result.json', 'metadata.json', 'telemetry.json'];
      for (const fileName of filesToTry) {
        const data = await readJsonFile(path.join(sessionPath, fileName));
        if (data) {
          const costEntries = extractCostEntries(`${dateDir}/${sid}`, dateDir, data);
          allEntries.push(...costEntries);
          if (costEntries.length > 0) break;
        }
      }
    }
  }

  if (allEntries.length === 0) {
    return 'No cost data found in sessions.';
  }

  // Group by session for totals
  const sessionTotals = new Map<string, number>();
  for (const e of allEntries) {
    sessionTotals.set(e.sessionId, (sessionTotals.get(e.sessionId) ?? 0) + e.totalCost);
  }

  const totalCost = [...sessionTotals.values()].reduce((a, b) => a + b, 0);
  const sessionCount = sessionTotals.size;
  const averageCost = sessionCount > 0 ? totalCost / sessionCount : 0;

  const lines: string[] = [];
  lines.push(bold('Cost Summary'));
  lines.push('─'.repeat(40));
  lines.push(`${t('cli.costs.total')}:              $${totalCost.toFixed(4)}`);
  lines.push(`${t('cli.costs.sessions')}:          ${sessionCount}`);
  lines.push(`${t('cli.costs.average')}:  $${averageCost.toFixed(4)}`);

  // Group by reviewer or provider if requested
  if (options.by === 'reviewer' || options.by === 'provider') {
    const groupKey = options.by === 'reviewer' ? 'reviewer' : 'provider';
    const groups = new Map<string, { cost: number; count: number }>();
    for (const e of allEntries) {
      const key = (groupKey === 'reviewer' ? e.reviewer : e.provider) || 'unknown';
      const existing = groups.get(key) ?? { cost: 0, count: 0 };
      existing.cost += e.totalCost;
      existing.count += 1;
      groups.set(key, existing);
    }

    lines.push('');
    lines.push(bold(`By ${options.by}`));
    lines.push('─'.repeat(40));

    const sorted = [...groups.entries()].sort((a, b) => b[1].cost - a[1].cost);
    for (const [name, data] of sorted) {
      lines.push(`  ${name.padEnd(30)} $${data.cost.toFixed(4)} ${dim(`(${data.count} calls)`)}`);
    }
  }

  return lines.join('\n');
}
