#!/usr/bin/env node
/**
 * CodeAgora MCP Server (6.1)
 * Exposes code review pipeline as MCP tools via stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerReviewQuick } from './tools/review-quick.js';
import { registerReviewFull } from './tools/review-full.js';
import { registerReviewPr } from './tools/review-pr.js';
import { registerDryRun } from './tools/dry-run.js';
import { registerExplain } from './tools/explain.js';
import { registerLeaderboard } from './tools/leaderboard.js';
import { registerStats } from './tools/stats.js';
import { registerConfigGet } from './tools/config-get.js';
import { registerConfigSet } from './tools/config-set.js';

const server = new McpServer({
  name: 'codeagora',
  version: '2.2.1',
});

// Register all tools
registerReviewQuick(server);
registerReviewFull(server);
registerReviewPr(server);
registerDryRun(server);
registerExplain(server);
registerLeaderboard(server);
registerStats(server);
registerConfigGet(server);
registerConfigSet(server);

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
