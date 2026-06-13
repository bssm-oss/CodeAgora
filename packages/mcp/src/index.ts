#!/usr/bin/env node
/**
 * CodeAgora MCP Server (6.1)
 * Exposes code review pipeline as MCP tools via stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerMcpTools } from './registry.js';
import { readMcpPackageVersion } from './version.js';

const server = new McpServer({
  name: 'codeagora',
  version: readMcpPackageVersion(),
});

registerMcpTools(server);

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
