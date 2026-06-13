import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReviewQuick } from './tools/review-quick.js';
import { registerReviewFull } from './tools/review-full.js';
import { registerReviewPr } from './tools/review-pr.js';
import { registerDryRun } from './tools/dry-run.js';
import { registerExplain } from './tools/explain.js';
import { registerLeaderboard } from './tools/leaderboard.js';
import { registerStats } from './tools/stats.js';
import { registerConfigGet } from './tools/config-get.js';
import { registerConfigSet } from './tools/config-set.js';

export const REQUIRED_MCP_TOOL_NAMES = [
  'review_quick',
  'review_full',
  'review_pr',
  'dry_run',
  'explain_session',
  'get_leaderboard',
  'get_stats',
  'config_get',
  'config_set',
] as const;

export type RequiredMcpToolName = typeof REQUIRED_MCP_TOOL_NAMES[number];

export function registerMcpTools(server: McpServer): void {
  registerReviewQuick(server);
  registerReviewFull(server);
  registerReviewPr(server);
  registerDryRun(server);
  registerExplain(server);
  registerLeaderboard(server);
  registerStats(server);
  registerConfigGet(server);
  registerConfigSet(server);
}
