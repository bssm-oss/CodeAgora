/**
 * Model Leaderboard CLI Command (4.1)
 * Shows model performance rankings from BanditStore data.
 */

import { BanditStore } from '@codeagora/core/l0/bandit-store.js';
import type { BanditArm } from '@codeagora/core/types/l0.js';

export interface LeaderboardEntry {
  model: string;
  winRate: number;
  reviews: number;
  alpha: number;
  beta: number;
}

/**
 * Load model leaderboard data from .ca/model-quality.json
 */
export async function getModelLeaderboard(): Promise<LeaderboardEntry[]> {
  const store = new BanditStore();
  await store.load();
  const arms = store.getAllArms();

  const entries: LeaderboardEntry[] = [];
  for (const [model, arm] of arms.entries()) {
    const winRate = arm.alpha / (arm.alpha + arm.beta);
    entries.push({
      model,
      winRate,
      reviews: arm.reviewCount,
      alpha: arm.alpha,
      beta: arm.beta,
    });
  }

  // Sort by win rate descending
  entries.sort((a, b) => b.winRate - a.winRate);
  return entries;
}

/**
 * Format leaderboard as CLI output text
 */
export function formatLeaderboard(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return 'No model data yet. Run some reviews first.';
  }

  const lines: string[] = [];
  lines.push('Model Leaderboard (.ca/model-quality.json)');
  lines.push('');
  lines.push('  #  \u2502 Model                              \u2502 Win Rate \u2502 Reviews \u2502 \u03B1/\u03B2');
  lines.push('  \u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rank = String(i + 1).padStart(3);
    const model = e.model.padEnd(33);
    const wr = `${(e.winRate * 100).toFixed(1)}%`.padStart(8);
    const rev = String(e.reviews).padStart(7);
    const ab = `${e.alpha.toFixed(0)}/${e.beta.toFixed(0)}`;
    lines.push(`  ${rank} \u2502 ${model} \u2502 ${wr} \u2502 ${rev} \u2502 ${ab}`);
  }

  lines.push('');
  lines.push('  Win rate = \u03B1 / (\u03B1 + \u03B2) from Thompson Sampling arms');

  return lines.join('\n');
}
