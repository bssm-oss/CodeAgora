<!-- Parent: AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# Product Surface and Lightweight Plan

## Decision

CodeAgora is simplifying product surfaces, not removing intelligence layers.

Keep the Agora brain:

- L0 model intelligence
- pre-analysis
- L1 parallel specialist reviewers
- hallucination filter
- confidence scoring
- L2 discussion / debate
- L3 head verdict
- session storage
- rules, learning, and plugins where they support review quality

Reduce the doors into that brain:

- retired optional UI packages
- duplicated human-facing surfaces
- stale notification/web/TUI configuration
- dependencies only needed by retired surfaces
- documentation that describes old product surfaces as current

Short version:

```txt
Fewer doors into Agora.
Same Agora brain.
```

## Supported Product Surfaces

The supported product surfaces are:

```txt
CLI
MCP
GitHub Actions
Desktop App
```

### CLI

The CLI is the primary automation and agent surface.

It should remain optimized for:

- local terminal use
- LLM agents
- scripts
- CI
- stable machine-readable output
- direct pipeline execution

CLI commands should stay dependable and scriptable. Rich human UI belongs elsewhere.

### MCP

MCP is the AI IDE / agent integration surface.

It exposes CodeAgora to clients like Claude Code, Cursor, Windsurf, and other MCP-compatible tools.

MCP should remain a thin adapter over the review engine and CLI formatting behavior. It should not grow its own review logic.

### GitHub Actions

GitHub Actions is the PR automation surface.

It should own:

- PR diff acquisition
- pipeline execution in CI
- PR review posting
- SARIF generation
- status/check result
- merge-blocking behavior

It should not own local UI concerns.

### Desktop App

The desktop app is the single human-facing local UI.

It replaces:

- old web dashboard
- old terminal TUI
- old notification package surface

The desktop app should own:

- session browsing
- result exploration
- pipeline progress display
- basic config editing
- local desktop notifications
- cost/model visibility

It should not own core review logic.

## Retired Surfaces

The following are retired as first-class product surfaces:

```txt
packages/web
packages/tui
packages/notifications
```

The following commands are retired:

```txt
agora dashboard
agora tui
agora notify
agora review --notify
```

This does not mean the product no longer has UI or alerts. It means UI and local alerts belong in one desktop app instead of three disconnected surfaces.

## Current Architecture

Current workspace packages:

```txt
packages/
├── shared
├── core
├── github
├── cli
└── mcp
```

### shared

Foundation package:

- shared types
- zod schemas
- i18n
- provider metadata
- utility functions
- diff/path/cache helpers

It should stay broadly reusable and avoid product-surface dependencies.

### core

The review engine:

- L0 model selection and quality tracking
- pre-analysis
- L1 reviewers and backends
- hallucination filtering
- L2 debate
- L3 verdict
- learning/rules/plugins
- session persistence
- pipeline orchestration

This is the heart of CodeAgora. Do not remove L0/L2/L3 for lightweight work.

### github

GitHub integration package:

- diff parsing for GitHub positions
- PR review mapping
- PR review posting
- SARIF output
- GitHub Action entrypoint

It depends on core/shared but should not depend on CLI or desktop.

### cli

CLI adapter package:

- command registration
- terminal output
- review option parsing
- GitHub PR command flow
- session commands
- config commands
- provider/model diagnostics

It may call core and github. It should not import desktop UI, web UI, or notification packages.

### mcp

MCP adapter package:

- MCP server startup
- tool schemas
- mapping MCP parameters to core/CLI helpers
- compact output for agents

It should remain adapter-like. No separate review engine.

## Intelligence Layers Stay

The review pipeline remains the product differentiator:

```txt
L0 model intelligence
  -> pre-analysis
  -> L1 parallel reviewers
  -> hallucination filter
  -> confidence scoring
  -> L2 debate
  -> L3 head verdict
```

This is what makes CodeAgora different from "ask one model to review my diff".

Speed concerns should be handled through modes and options:

- `--quick`
- `--no-discussion`
- reviewer count
- timeouts
- config presets
- future desktop quick/full/deep controls

Do not solve speed by deleting the architecture.

## Lightweight Work

Lightweight work should target leftovers from retired surfaces.

Remove or simplify:

- stale docs for web/TUI/notifications
- stale i18n keys
- stale config fields that only powered retired surfaces
- stale test references
- unused dependencies
- old command modules
- release workflow paths for retired packages
- docs that describe CodeAgora as a dashboard/webhook platform

Keep:

- session storage
- pipeline telemetry
- L0 leaderboard data if used by CLI/desktop
- L2 debate transcripts
- L3 verdict outputs
- GitHub mapper/SARIF
- MCP tool set
- CLI machine-readable outputs

## Desktop App Boundary

The desktop app now has an initial private scaffold at:

```txt
packages/desktop
```

Suggested first data flow:

```txt
Desktop UI
  -> Tauri command
  -> local CLI/core bridge
  -> .ca/sessions
  -> Desktop UI reads session/result files
```

This keeps desktop aligned with CLI/GitHub/MCP results.

## Recommended Phases

### Phase A: Surface Reset

- remove retired packages
- rename npm package to `@codeagora/review`
- reset version to `0.1.0-alpha.0`
- update release workflow
- update docs
- preserve L0/L2/L3

Exit criteria:

- `pnpm typecheck`
- `pnpm build`
- `npm pack --dry-run`
- no active imports of web/TUI/notifications

### Phase B: Residual Cleanup

- remove stale config and i18n fields
- update old architecture docs
- simplify test suite after retired surfaces
- ensure release workflow publishes only active packages

Exit criteria:

- docs consistently describe four surfaces
- no stale product surface references outside archive/history
- tests do not import retired packages

### Phase C: Agent Contract

- stabilize CLI JSON output
- document JSON-stream events
- document exit codes
- define machine-readable result schema
- make MCP reuse the same semantics

Exit criteria:

- agents can call CLI predictably
- MCP tool output stays compact and schema-aware

### Phase D: Desktop MVP

- scaffold Tauri app
- session list
- session detail
- run review on current repo
- local desktop notification
- basic config view/edit

Exit criteria:

- desktop replaces the old dashboard/TUI for the basic local human workflow

### Phase E: opencode Integration

- add opencode plugin/adapter
- use CLI or core as backend
- expose simple review command

Exit criteria:

- opencode users can run an Agora review without leaving their agent workflow

## Non-Goals

Do not do these as part of lightweight cleanup:

- delete L0
- delete L2 debate
- delete L3 verdict
- remove session storage
- remove GitHub Action
- turn CodeAgora into a single-model reviewer
- rebuild the old web dashboard inside desktop all at once

The product should get smaller around the engine, not smaller instead of the engine.
