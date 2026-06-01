# packages/

## Responsibility
Workspace package atlas for CodeAgora. These packages split the system into shared foundations, review engine, CLI, GitHub integration, MCP server, and desktop UI.

## Design
- `@codeagora/shared` is the foundation layer: types, utilities, schemas, i18n, and provider metadata.
- `@codeagora/core` is the pipeline engine: L0→L3 review flow, config/session handling, plugins, rules, learning.
- `@codeagora/cli` is the command surface: parses user input and orchestrates core + GitHub output.
- `@codeagora/github` adapts pipeline results to GitHub PR comments, diffs, SARIF, and Actions.
- `@codeagora/mcp` exposes pipeline capabilities as MCP tools for other agents.
- `@codeagora/desktop` is the local Tauri UI shell and stays thin over core/CLI data.

## Package Atlas
| Package | Responsibility | Key deps | Entry points |
|---------|----------------|----------|--------------|
| `shared/` | Foundation utilities, validators, data, i18n | `zod`, `picocolors` | `src/index.ts` + subpaths under `src/*` |
| `core/` | Review pipeline engine and config/session logic | `shared`, `ai`, `@ai-sdk/*`, `yaml`, `zod`, `commander` | `src/index.ts`, `src/pipeline/orchestrator.ts`, `src/config/loader.ts` |
| `cli/` | CLI commands, formatters, prompts, orchestration | `core`, `github`, `shared`, `commander`, `ora`, `@clack/prompts` | `src/index.ts`, `src/commands/*` |
| `github/` | PR diff parsing, mapping, posting, SARIF | `core`, `shared`, `@octokit/rest` | `src/index.ts`, `src/action.ts`, `src/client.ts`, `src/pr-diff.ts` |
| `mcp/` | MCP server and tool wrappers | `core`, `cli`, `shared`, `@modelcontextprotocol/sdk`, `ai`, `@octokit/*` | `src/index.ts`, `src/tools/*`, `src/helpers.ts` |
| `desktop/` | Tauri desktop scaffold and bridge UI | `core`, `shared`, `@tauri-apps/api` | `src/main.ts`, `src/api/desktop-bridge.ts`, `src-tauri/src/main.rs` |

## Flow
Shared data and schemas feed core; core produces review/session results; CLI and MCP expose those results to humans and agents; GitHub turns them into PR-native artifacts; desktop reads session/config state through a thin bridge.

## Integration
- Cross-package imports use `@codeagora/*` workspace aliases.
- Public package entry points are `dist/index.js` (and `dist/index.d.ts` where present).
- CLI, GitHub, and MCP depend on shared input validation and core pipeline contracts.
- Desktop intentionally avoids reimplementing review logic and reuses core/shared semantics.
