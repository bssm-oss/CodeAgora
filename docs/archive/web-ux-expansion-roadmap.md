# CodeAgora — Web & UX Expansion Report

> **Date:** 2026-03-19
> **Status:** Planning
> **Scope:** Monorepo migration, GitHub UX enhancement, webhook expansion, real-time Discord integration, meme mode, web dashboard roadmap

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Monorepo Migration](#3-monorepo-migration)
4. [Feature Catalog](#4-feature-catalog)
   - [Phase 1: GitHub Comment Enrichment](#phase-1-github-comment-enrichment)
   - [Phase 1.5: Webhook Expansion](#phase-15-webhook-expansion)
   - [Phase 2: Real-time Discord Integration](#phase-2-real-time-discord-integration)
   - [Phase 3: Meme Mode](#phase-3-meme-mode)
   - [Phase 4: CLI Intelligence Features](#phase-4-cli-intelligence-features)
   - [Phase 5: Web Dashboard](#phase-5-web-dashboard)
   - [Phase 6: MCP Server & Platform Integration](#phase-6-mcp-server--platform-integration)
5. [Difficulty Matrix](#5-difficulty-matrix)
6. [Dependency Graph](#6-dependency-graph)
7. [Technical Feasibility Notes](#7-technical-feasibility-notes)
8. [TypeScript Limitations](#8-typescript-limitations)
9. [Test Strategy](#9-test-strategy)
10. [Recommended Execution Order](#10-recommended-execution-order)

---

## 1. Executive Summary

CodeAgora generates rich structured data across its 4-layer pipeline (L0 model intelligence, L1 parallel reviewers, L2 discussion/debate, L3 head verdict), but the majority of this data is either written to disk and never surfaced, or reduced to minimal summaries in GitHub comments and webhooks.

This report catalogs **25+ concrete features** that expose this hidden data to users through GitHub PR comments, Discord/Slack webhooks, CLI commands, and eventually a web dashboard. Most features are ★~★★ difficulty because the data already exists — only the presentation layer is missing.

**Four keystone changes** unlock the majority of downstream features:
1. **Monorepo migration** — restructure into pnpm workspace packages before feature work begins
2. **DiscussionRound data propagation** — rounds data currently dies in memory after being written to disk
3. **Moderator event emitter** — enables real-time streaming to Discord and future web dashboard
4. **Generic webhook** — opens the door for custom integrations and self-hosted dashboards

---

## 2. Current State Analysis

### v1 Architecture & Maturity Baseline

| Metric | Value |
|--------|-------|
| Source code | ~19,200 lines (110 files) |
| Test code | ~19,900 lines (91 files, 1,443 tests) |
| Overall completeness | ~90% |
| Overall maturity | Beta |

#### Core Pipeline (L0 → L1 → L2 → L3)

| Layer | Files | Lines | Completeness | Maturity | Tests | Key Gaps |
|-------|-------|-------|-------------|----------|-------|----------|
| **L0** Model Intelligence | 8 | ~700 | 95% | Beta | 7 files, excellent | No time-based arm decay (6-month-old data persists forever). Static JSON model registry (no auto-update). |
| **L1** Parallel Reviewers | 7 | ~750 | 95% | Beta/Prod | 10 files, excellent | No per-reviewer progress events. Parser hardcoded to Korean section headers (`### 문제`). |
| **L2** Discussion/Debate | 5 | ~750 | 90% | Beta | 6 files, good | Naive keyword-counting stance parser. No inter-round context passing. |
| **L3** Head Verdict | 3 | ~330 | 90% | Beta | 3 files, good | `codeChanges` field unused (dead code). Import path resolution skips extension fallback. |
| **Pipeline** Orchestrator | 10 | ~1,700 | 85% | Beta | 9 files, good | Telemetry instance created but unused. DSL parser not wired in. No pipeline-level retry. |

#### Infrastructure

| System | Files | Lines | Completeness | Maturity | Tests | Notes |
|--------|-------|-------|-------------|----------|-------|-------|
| Config | 7 | ~1,150 | 95% | **Prod-ready** | 7 files, excellent | JSON/YAML + Zod validation, migration, init wizard, credentials, mode presets |
| CLI | 11 | ~2,700 | 95% | Beta/Prod | 9 files, good | review, init, doctor, providers, sessions, notify, tui, learn. 5 output formats. |
| TUI | 23 | ~4,300 | 85% | Alpha/Beta | 11 files, good | 8 screens, 14 components, theme system, React/Ink |
| GitHub | 9 | ~1,200 | 90% | Beta | 7 files, good | PR diff, inline comments, SARIF, commit status, NEEDS_HUMAN, Action |
| Plugins | 5 | ~430 | 70% | **Alpha** | 2 files | **Not wired to orchestrator — ~650 lines dead code** |
| Learning | 3 | ~200 | 80% | Alpha/Beta | 2 files | Dismiss pattern storage + auto suppress/downgrade |
| Rules | 3 | ~225 | 80% | Alpha/Beta | None | Regex-based custom rules. **Not wired to orchestrator.** |
| Session | 1 | 93 | 100% | **Prod-ready** | — | — |
| Notifications | 1 | 247 | 95% | **Prod-ready** | — | Discord + Slack webhooks |
| i18n | 3 | — | 90% | Beta | — | ~180 keys, en/ko |
| Utils | 9 | ~920 | 90% | Beta/Prod | — | diff, fs, logger, concurrency |
| Types | 3 | ~360 | 95% | **Prod-ready** | — | Zod schemas + TS types |

#### Maturity Map

```
Prod-ready ██████░   Config, Types, Session, Notifications, Providers
Beta       ████████████████  L0, L1, L2, L3, Pipeline, CLI, GitHub, i18n, Utils
Alpha/Beta ████░   TUI, Learning, Rules
Alpha      ██░     Plugins
```

#### Architecture TOP 5 Findings

| # | Finding | Impact | Relevant Expansion Phase |
|---|---------|--------|------------------------|
| 1 | **Unwired subsystems** — Rules Engine + Plugin System implemented but not called from orchestrator (~650 lines dead code) | High | Sprint 0 (monorepo) — decide: wire in or extract to separate packages for later |
| 2 | **Duplicate circuit breakers** — L0 `HealthMonitor` and L1 `CircuitBreaker` implemented independently with separate state | Medium | Sprint 0 — consolidate into `@codeagora/core` single implementation |
| 3 | **Unused telemetry** — `PipelineTelemetry` instance created in orchestrator but no methods called | Medium | Sprint 1 (1.4 Performance Report) — wire telemetry to enable cost/latency tracking |
| 4 | **Hardcoded Korean parser** — L1 parser coupled to Korean section headers (`### 문제`, `### 근거`) | Medium | Monorepo — extract parser patterns to i18n-aware config in `@codeagora/shared` |
| 5 | **No real LLM integration tests** — All 1,443 tests use mocks, vulnerable to prompt drift | High | Sprint 5 — add smoke tests with real API calls (gated by env var) |

These findings inform the expansion roadmap: **monorepo migration (Sprint 0) is the right time to address findings #1, #2, and #4** as structural cleanup during the move.

---

### What Data Exists but Isn't Surfaced

| Data | Where It Lives | Currently Exposed |
|------|---------------|-------------------|
| `DiscussionRound[]` (per-round supporter stances + responses) | `.ca/sessions/{date}/{id}/discussions/{dId}/round-N.md` | Only `DiscussionVerdict` (summary) reaches GitHub/webhook |
| `PerformanceReport` (per-reviewer latency, tokens, cost) | Computed in `pipeline/report.ts` | Console only |
| `BanditStoreData` (Thompson Sampling arms, 1000-entry review history) | `.ca/model-quality.json` | No CLI command to view |
| `DryRunResult` (reviewer config, layer-by-layer cost estimate, health) | Returned by `pipeline/dryrun.ts` | CLI `--dry-run` only |
| Learned patterns (suppress/downgrade history) | `.ca/learned-patterns.json` | Applied silently, no user feedback |
| `SpecificityBreakdown` (per-evidence scoring criteria) | Computed in `l0/specificity-scorer.ts` | Only aggregate score used |
| Reviewer agreement data | `reviewerMap` in `PipelineResult` | Not cross-analyzed |
| Supporter combination log | `.ca/sessions/.../supporters.json` | Written to disk, never shown |
| Session diff (added/removed/unchanged issues) | `sessions.ts:diffSessions()` | CLI only, not automated |
| SARIF discussion metadata | Not included | `properties` field available but empty |

### Current GitHub Comment Structure

**Inline comment** (`mapper.ts:mapToInlineCommentBody`):
- Severity badge + issue title
- Confidence badge
- Problem + evidence + suggestion
- Discussion verdict (reasoning only, no round details)
- Flagged-by reviewer IDs

**Summary comment** (`mapper.ts:buildSummaryBody`):
- Verdict line (ACCEPT/REJECT/NEEDS_HUMAN) + severity counts
- Blocking issues table
- Collapsible warnings/suggestions
- Agent consensus log (table: discussionId, rounds, consensus, finalSeverity — **no round details**)
- Open questions (NEEDS_HUMAN)

### Current Webhook Structure

**`NotificationPayload`** contains:
- decision, reasoning
- severityCounts, topIssues (max 5)
- sessionId, date
- totalDiscussions, resolved, escalated

**Missing from webhook**: per-reviewer performance, cost, discussion details, learned pattern suppressions.

### Current Discord/Slack Formatting

- Discord: single embed with color-coded verdict, severity field, top issues field
- Slack: header + sections with mrkdwn
- Both: fire-and-forget, single POST at pipeline completion

---

## 3. Monorepo Migration

### Why Before Features

The 25+ features in this report land across 6+ distinct surfaces (GitHub, Discord, webhooks, CLI, TUI, web). Building these in a single-package monolith and extracting later means:
- Import paths get coupled across unrelated surfaces
- Dependency bloat — every consumer pulls ink, react, @octokit, ai-sdk
- "Extract later" always costs more than "structure first"

The current codebase has **zero circular dependencies** and clean unidirectional import flow, making this the lowest-cost moment to migrate.

### Current Pain Points

| Problem | Impact |
|---------|--------|
| Single `package.json` with 20+ deps spanning CLI, TUI, AI, GitHub | `npm i -g codeagora` installs ink+react even for CI-only usage |
| GitHub Action bundles entire package | 5-10s `npm install` overhead per run |
| No way to import `@codeagora/core` as a library | Can't build external integrations against the pipeline |
| Adding web dashboard means dumping express/vite into the same deps | TUI users shouldn't download a web server |

### Package Structure

```
codeagora/
├── pnpm-workspace.yaml
├── package.json              # root (workspace scripts, shared devDeps)
├── tsconfig.base.json        # shared compiler options
│
├── packages/
│   ├── shared/               # @codeagora/shared
│   │   └── src/
│   │       ├── utils/        # diff, fs, logger, concurrency
│   │       ├── i18n/         # en, ko locales
│   │       ├── data/         # pricing.json, model-rankings.json, groq-models.json
│   │       ├── providers/    # env-vars
│   │       └── meme/         # (Phase 3) meme text pools
│   │
│   ├── core/                 # @codeagora/core
│   │   └── src/
│   │       ├── types/        # Zod schemas, type definitions
│   │       ├── l0/           # Model intelligence (bandit, registry, health, quality)
│   │       ├── l1/           # Reviewers (backend, parser, provider, circuit-breaker)
│   │       ├── l2/           # Discussion (moderator, dedup, objection)
│   │       ├── l3/           # Head verdict (verdict, grouping)
│   │       ├── pipeline/     # Orchestrator, chunking, telemetry, cost, progress
│   │       ├── config/       # Loader, validation, migration, credentials
│   │       ├── session/      # Session manager
│   │       ├── learning/     # Pattern learning/filter
│   │       ├── rules/        # Rule matching
│   │       ├── plugins/      # Plugin system
│   │       └── index.ts      # Public API barrel export
│   │
│   ├── github/               # @codeagora/github
│   │   └── src/
│   │       ├── mapper.ts     # Domain → GitHub review shapes
│   │       ├── poster.ts     # Review posting orchestration
│   │       ├── sarif.ts      # SARIF 2.1.0 report generation
│   │       ├── diff-parser.ts
│   │       ├── pr-diff.ts
│   │       ├── comment.ts
│   │       ├── dedup.ts
│   │       ├── client.ts
│   │       ├── types.ts
│   │       └── action.ts     # GitHub Action entrypoint
│   │
│   ├── notifications/        # @codeagora/notifications
│   │   └── src/
│   │       ├── webhook.ts          # Existing Discord/Slack
│   │       ├── generic.ts          # (Phase 1.5) Generic webhook + HMAC
│   │       ├── discord-live.ts     # (Phase 2) Real-time Discord
│   │       └── event-stream.ts     # (Phase 2) Event stream
│   │
│   ├── cli/                  # @codeagora/cli
│   │   ├── bin/
│   │   │   └── codeagora.js  # Executable entrypoint
│   │   └── src/
│   │       ├── index.ts
│   │       ├── commands/     # review, init, doctor, sessions, learn, models...
│   │       ├── formatters/   # review-output, annotated-output
│   │       └── utils/        # colors, errors
│   │
│   ├── tui/                  # @codeagora/tui
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── screens/      # Home, ReviewSetup, Pipeline, Results, Debate, Config, Sessions
│   │       ├── components/   # Panel, ScrollableList, TabBar, DiffViewer, etc.
│   │       ├── hooks/        # useRouter
│   │       └── theme.ts
│   │
│   └── web/                  # @codeagora/web (Phase 5, created empty)
│       └── src/
│           ├── server/       # Hono.js REST API + WebSocket
│           └── frontend/     # React SPA
```

### Package Dependency Graph

```
                     shared
                    ╱  │  ╲
                   ╱   │   ╲
                core   │    │
               ╱ │ ╲   │    │
              ╱  │  ╲  │    │
         github  │  notifications
              ╲  │  ╱
               ╲ │ ╱
                cli ←── tui
                 │
                web (future)
```

| Package | Dependencies | Key Externals |
|---------|-------------|---------------|
| `shared` | (none) | `picocolors`, `zod` |
| `core` | `shared` | `ai`, `@ai-sdk/*`, `yaml`, `zod`, `commander` |
| `github` | `core`, `shared` | `@octokit/rest` |
| `notifications` | `core`, `shared` | (none — uses native `fetch`) |
| `cli` | `core`, `github`, `notifications`, `shared` | `commander`, `ora`, `@clack/prompts` |
| `tui` | `core`, `shared` | `ink`, `react`, `ink-select-input` |
| `web` | `core`, `shared` | `hono`, `react-dom`, `vite` |

### Dependency Distribution Benefit

| Dependency | Current (all in one) | After (goes to) | Others stop pulling |
|-----------|---------------------|-----------------|-------------------|
| `ink`, `react`, `ink-select-input` | root | `tui` only | cli, github, notifications, web |
| `@octokit/rest` | root | `github` only | core, tui, notifications |
| `commander`, `ora`, `@clack/prompts` | root | `cli` only | core, github, tui |
| `ai`, `@ai-sdk/*` (5 packages) | root | `core` only | cli, github, notifications, tui |

**GitHub Action bundle** drops from full package to `core` + `github` + `shared` — no ink, react, commander, ora.

### Migration Steps

| Step | Description | Difficulty | Estimated Time |
|------|------------|-----------|---------------|
| 1 | Create `pnpm-workspace.yaml`, `tsconfig.base.json`, root `package.json` scripts | ★☆☆☆☆ | 30 min |
| 2 | Extract `shared` (utils, i18n, data, providers) | ★☆☆☆☆ | 30 min |
| 3 | Extract `core` (types, l0-l3, pipeline, config, session, learning, rules, plugins) | ★★☆☆☆ | 1-2 hours |
| 4 | Extract `github` + `notifications` | ★★☆☆☆ | 30 min |
| 5 | Extract `cli` + `tui` | ★★☆☆☆ | 30 min |
| 6 | Update all cross-package imports (`../` → `@codeagora/*`) | ★★☆☆☆ | 1-2 hours |
| 7 | Per-package `tsup` build configs + root build orchestration | ★★☆☆☆ | 1 hour |
| 8 | CI pipeline update (test/lint/typecheck per package) | ★★☆☆☆ | 30 min |
| **Total** | | **★★★☆☆** | **Half day ~ 1 day** |

The migration is mechanical — no logic changes, no new code. Current import graph has zero circular dependencies, confirmed via static analysis.

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2023"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

```json
// packages/core/tsconfig.json (example)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../shared" }
  ]
}
```

```json
// root package.json scripts
{
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "dev": "pnpm --filter @codeagora/cli dev"
  }
}
```

### Import Path Changes

```typescript
// BEFORE: relative cross-layer imports
import { EvidenceDocument } from '../types/core.js';
import { formatCost } from '../pipeline/cost-estimator.js';
import { t } from '../../i18n/index.js';

// AFTER: package imports across boundaries
import { EvidenceDocument, formatCost } from '@codeagora/core';
import { t } from '@codeagora/shared';

// Within a package: relative paths remain unchanged
import { checkConsensus } from './consensus.js';  // same as before
```

### npm Distribution Strategy

The monorepo is an internal development structure — users should not be exposed to package complexity.

**Principle: Install one thing, add more if needed.**

```bash
npm i -g codeagora          # CLI + core + github + notifications + shared (everything included)
npm i -g @codeagora/tui     # TUI usage (adds ink, react)
npm i    @codeagora/core    # External developers using as a library
npm i    @codeagora/mcp     # MCP server standalone
```

**Implementation:** The `codeagora` package publishes `@codeagora/cli` with workspace dependencies bundled:

```json
{
  "name": "codeagora",
  "bin": { "codeagora": "./dist/index.js" },
  "dependencies": {
    "@codeagora/core": "workspace:*",
    "@codeagora/github": "workspace:*",
    "@codeagora/notifications": "workspace:*",
    "@codeagora/shared": "workspace:*"
  }
}
```

pnpm publish automatically replaces `workspace:*` with actual versions.

**Per-package publish scope:**

| Package | npm Public | Target Users | Key External Deps |
|---------|----------|-------------|-------------------|
| `codeagora` | Public | General users (CLI) | commander, ora, @clack/prompts |
| `@codeagora/core` | Public | External devs, custom integrations | ai, @ai-sdk/*, yaml, zod |
| `@codeagora/github` | Public | GitHub Action standalone | @octokit/rest |
| `@codeagora/notifications` | Public | Webhook custom integrations | (none — native fetch) |
| `@codeagora/shared` | Public | Dependency of other packages | picocolors, zod |
| `@codeagora/tui` | Public | TUI users (opt-in) | ink, react |
| `@codeagora/mcp` | Public | MCP client integrations | @modelcontextprotocol/sdk |
| `@codeagora/web` | Public | Self-hosted dashboard | hono, react-dom |

**Install size comparison:**

| Install Method | Includes | Excludes | Effect |
|---------------|---------|---------|--------|
| v1 `npm i -g codeagora` | Everything (ink, react, octokit, ai-sdk) | Nothing | Heavy |
| v2 `npm i -g codeagora` | core + cli + github + notifications + shared | ink, react, hono, react-dom | **Lighter — ink/react removed** |
| v2 GitHub Action | core + github + shared only | commander, ora, ink, react | **Action startup time reduced** |

**Versioning:** All packages maintain synchronized versions. Managed via changesets or manual bump.

```bash
pnpm changeset version
pnpm -r publish
```

**Precedent:** This pattern is industry standard — ESLint, Jest, Turborepo all use monorepos with single-command installs. Users never need to know about internal package structure.

---

## 4. Feature Catalog

### Phase 1: GitHub Comment Enrichment

#### 1.1 DiscussionRound Propagation (Keystone)

**Problem:** `runModerator()` returns `ModeratorReport` with only `DiscussionVerdict[]`. The `DiscussionRound[]` data (per-round supporter stances, responses, moderator prompts) is written to files but discarded from memory.

**Change:** Add `roundsPerDiscussion: Record<string, DiscussionRound[]>` to `ModeratorReport`. Propagate through `PipelineResult` to mapper/webhook consumers.

**Files:** `types/core.ts`, `l2/moderator.ts`, `pipeline/orchestrator.ts`

**Difficulty:** ★★☆☆☆

---

#### 1.2 Inline Comment Debate Logs

**Description:** Expand `mapToInlineCommentBody()` to render per-round supporter stances inside `<details>`.

**Rendering:**
```markdown
<details>
<summary>Discussion d001 — 2 round(s), consensus</summary>

**Round 1**
| Supporter | Model | Stance | Summary |
|-----------|-------|--------|---------|
| devil-advocate | gpt-4o | DISAGREE | Evidence is circumstantial... |
| supporter-1 | claude-sonnet | AGREE | The null check is clearly... |

**Round 2**
| Supporter | Model | Stance | Summary |
|-----------|-------|--------|---------|
| devil-advocate | gpt-4o | AGREE | After reviewing, the evidence... |

**Verdict:** CRITICAL — Consensus after 2 rounds
</details>
```

**Truncation strategy:** Supporter responses truncated to first 2-3 sentences (GitHub comment limit: 65535 chars).

**Depends on:** 1.1

**Difficulty:** ★★☆☆☆

---

#### 1.3 Summary Comment Debate Detail

**Description:** Expand the "Agent consensus log" section in `buildSummaryBody()` from a flat table to per-discussion collapsible sections with round-by-round detail.

**Depends on:** 1.1

**Difficulty:** ★★☆☆☆

---

#### 1.4 Performance Report in Summary Comment

**Description:** Add a collapsible performance section to `buildSummaryBody()`. Data source: `PerformanceReport` from `pipeline/report.ts` — already has `formatReportText()` producing a markdown table.

**Rendering:**
```markdown
<details>
<summary>Performance (4 reviewers, $0.0832, 12.3s avg)</summary>

| Reviewer | Provider | Model | Latency | Tokens | Cost | Status |
|----------|----------|-------|---------|--------|------|--------|
| r1-claude | anthropic | claude-sonnet-4 | 8.2s | 3421 | $0.0341 | OK |
| ... |

Slowest: r3-llama (18.4s)
Most expensive: r1-claude ($0.0341)
</details>
```

**Difficulty:** ★☆☆☆☆ — `formatReportText()` output wrapped in `<details>`.

---

#### 1.5 Suppressed Issues Transparency

**Description:** Show which issues were suppressed by learned patterns in the summary comment.

**Change:** Propagate `suppressed: EvidenceDocument[]` from `applyLearnedPatterns()` through `PipelineResult`.

**Rendering:**
```markdown
<details>
<summary>3 issue(s) suppressed by learned patterns</summary>

- `src/auth.ts:42` — "Missing null check" (dismissed 5 times previously)
- `src/api.ts:15` — "Unused import" (dismissed 12 times previously)
- `src/utils.ts:8` — "Magic number" (dismissed 3 times previously)
</details>
```

**Difficulty:** ★★☆☆☆

---

#### 1.6 Confidence-based Comment Filtering

**Description:** Add `github.minConfidence` config option. Issues below threshold appear only in the summary table, not as inline comments. Reduces noise.

**Files:** `types/config.ts`, `github/mapper.ts`

**Difficulty:** ★★☆☆☆

---

#### 1.7 SARIF Discussion Metadata

**Description:** Populate `properties` field in SARIF results with discussion data.

```typescript
properties: {
  codeagora_discussionId: 'd001',
  codeagora_consensusReached: true,
  codeagora_rounds: 2,
  codeagora_finalSeverity: 'CRITICAL',
  codeagora_confidence: 85,
}
```

SARIF 2.1.0 spec allows arbitrary `properties` — no schema violation.

**Difficulty:** ★☆☆☆☆

---

#### 1.8 Session-over-Session Diff

**Description:** When re-running a review on the same PR, auto-compare with previous session and add a delta summary to the comment.

**Rendering:**
```markdown
**Delta from previous review (2026-03-18/002):**
+1 new issue, -3 resolved, 4 unchanged
```

**Leverages:** `sessions.ts:diffSessions()` already implemented.

**Difficulty:** ★★☆☆☆ — Needs session tracking by PR number.

---

#### 1.9 Issue Heatmap in Summary

**Description:** File-by-file issue density bar in summary comment.

```markdown
### Issue Distribution
| File | Issues |
|------|--------|
| `src/auth/login.ts` | ████████████ 12 |
| `src/api/handler.ts` | ██████ 6 |
| `src/utils/crypto.ts` | ███ 3 |
```

**Difficulty:** ★☆☆☆☆ — Pure formatting from `EvidenceDocument[].filePath`.

---

#### 1.10 Dry-Run Preview Comment

**Description:** In GitHub Action dry-run mode, post a cost/config preview comment to the PR before running the actual review.

**Difficulty:** ★★☆☆☆

---

#### 1.11 Review Status Badge

**Description:** Generate shields.io badge URL as GitHub Action output.

```
![CodeAgora](https://img.shields.io/badge/CodeAgora-REJECT%20(3%20critical)-red)
```

**Difficulty:** ★☆☆☆☆

---

### Phase 1.5: Webhook Expansion

#### 1.5.1 Webhook Payload Enrichment

**Description:** Expand `NotificationPayload` with:
- `discussions`: per-discussion verdict + round count + consensus status
- `performance`: total cost, avg latency, slowest/most expensive reviewer
- `suppressed`: count of learned-pattern suppressions
- `reviewerDiversity`: family count, reasoning model count

**Difficulty:** ★☆☆☆☆

---

#### 1.5.2 Generic Webhook

**Description:** Add `notifications.webhook` config with arbitrary URL (not restricted to Discord/Slack hosts). Sends raw JSON `PipelineResult`.

**Security:** HMAC-SHA256 signature in `X-CodeAgora-Signature` header using a user-provided secret.

**Config:**
```yaml
notifications:
  webhook:
    url: "https://my-dashboard.example.com/api/reviews"
    secret: "hmac-secret-here"
```

**Difficulty:** ★★☆☆☆

---

#### 1.5.3 Event Stream Webhook

**Description:** Instead of single POST at completion, send events at each pipeline stage by attaching a listener to `ProgressEmitter`.

```json
{"event": "stage-start", "stage": "review", "timestamp": 1710835200}
{"event": "reviewer-complete", "reviewerId": "r1-claude", "issues": 4}
{"event": "stage-start", "stage": "discuss", "discussions": 3}
{"event": "supporter-response", "discussionId": "d001", "supporter": "devil-advocate", "stance": "disagree"}
{"event": "consensus", "discussionId": "d001", "severity": "CRITICAL", "rounds": 2}
{"event": "pipeline-complete", "verdict": "REJECT", "cost": "$0.1832"}
```

**Difficulty:** ★★★☆☆

---

### Phase 2: Real-time Discord Integration

#### 2.1 Moderator Event Emitter (Keystone)

**Description:** Add a `DiscussionEmitter` (extending EventEmitter) to the moderator flow. Events:

| Event | Payload | Timing |
|-------|---------|--------|
| `discussion-start` | discussionId, issueTitle, filePath, severity | Before first round |
| `round-start` | discussionId, roundNum | Before supporters respond |
| `supporter-response` | discussionId, roundNum, supporterId, model, persona, stance, response | Per supporter |
| `consensus-check` | discussionId, roundNum, reached, severity | After each round |
| `objection` | discussionId, supporterId, reasoning | When objection raised |
| `forced-decision` | discussionId, severity, reasoning | When max rounds exceeded |
| `discussion-end` | discussionId, verdict | Final |

**Implementation:** Pass optional `DiscussionEmitter` through `runModerator()` → `runDiscussion()` → `runRound()`. Zero impact when no listener attached.

**Difficulty:** ★★☆☆☆

---

#### 2.2 Discord Live Chat

**Description:** Attach a Discord webhook listener to `DiscussionEmitter`. Each event becomes a Discord embed message.

**Message flow per discussion:**

```
[Main Channel]
  📌 "Discussion d001 started — SQL Injection in auth.ts:42"
    └─ [Thread: d001 — SQL Injection]
        💬 devil-advocate (gpt-4o): DISAGREE — "The ORM handles..."
        💬 supporter-1 (claude-sonnet): AGREE — "The raw query on L42..."
        💬 supporter-2 (llama-3.3): AGREE — "Confirmed. db.raw()..."
        📍 Round 1 result: 2/3 agree, no consensus yet
        💬 devil-advocate (gpt-4o): AGREE — "I concede..."
        ✅ Consensus reached: CRITICAL (3/3 agree, 2 rounds)
```

**Discord Thread implementation:**
```typescript
// Post discussion start with ?wait=true to get message ID
const startMsg = await postWebhook(url + '?wait=true', embed);
const threadId = startMsg.id;

// Subsequent messages go into the thread
await postWebhook(url + '?wait=true', { ...embed, thread_id: threadId });
```

**Rate limit budget:** Discord allows 30 requests/60s per webhook. Worst case: 5 discussions x 3 rounds x 3 supporters = 45 messages. Mitigation: batch supporters per round into single embed, or queue with 2s delay.

**Difficulty:** ★★★☆☆

---

#### 2.3 Discord Pipeline Summary

**Description:** Final verdict posted to main channel (not thread) with full embed:
- Verdict badge + reasoning
- Severity breakdown
- Top issues
- Performance summary (cost, latency)
- Links to discussion threads

**Difficulty:** ★★☆☆☆

---

### Phase 3: Meme Mode

#### 3.1 Meme Text System

**Description:** `memeMode: true` in config activates alternate text for all badges, verdicts, and status messages. Logic unchanged — presentation only.

**Architecture:**
```
src/meme/
├── badges.ts          # Severity/verdict/confidence badge mappings
├── verdicts.ts        # Verdict message pools (random pick)
├── discussions.ts     # Discussion situation message pools
└── performance.ts     # Performance report messages
```

**Verdict Messages (random pool per decision):**

| Decision | Examples |
|----------|---------|
| ACCEPT | "LGTM ship it", "The mass has been prayed. Deploy in peace.", "You may pass." |
| REJECT | "This is fine. (Nothing is fine.)", "git push --force-with-sadness", "This PR has more red flags than a Soviet parade." |
| NEEDS_HUMAN | "Above my pay grade.", "I showed this to 5 AIs and we all started crying.", "404: Consensus Not Found." |

**Severity Badges:**

| Severity | Meme Badge |
|----------|------------|
| HARSHLY_CRITICAL | DEFCON 1 — "DELETE THIS" |
| CRITICAL | SIR — "Sir, this is a production server" |
| WARNING | SUS — "I'm not saying it's wrong, but..." |
| SUGGESTION | WELL ACTUALLY — "Not to be that guy, but..." |

**Discussion Events:**

| Situation | Meme Text |
|-----------|-----------|
| All agree | "The Council has spoken" |
| All disagree | "We don't do that here" |
| Majority pass | "Democracy has prevailed (barely)" |
| Majority reject | "Skill issue" |
| Tie → forced | "Civil War — moderator pulled rank" |
| Devil's advocate flips | "Character development arc" |
| Devil's advocate holds | "Even the devil agrees this is bad" |

**Confidence Badges:**

| Range | Meme |
|-------|------|
| 80%+ | "we're pretty sure about this one" |
| 40-79% | "trust me bro" |
| <40% | "vibes-based analysis" |

**Performance (meme ver.):**
```
Speed Run Results
  Slowest: gemini-2.0-flash (ironic, 45.2s)
  Most Expensive: claude-opus ($0.0834) — bougie but worth it
  Fastest: groq/llama-3.3 (2.1s) — zoom zoom
  Total damage: $0.1832
```

**i18n:** Korean meme variants using existing en/ko i18n system.

| EN | KO |
|----|----|
| "DELETE THIS" | "당장 삭제해" |
| "Sir, this is a production server" | "여기 프로덕션인데요" |
| "Trust me bro" | "ㄹㅇㅋㅋ 믿어봐" |
| "Vibes-based analysis" | "감으로 찾음" |
| "The Council has spoken" | "AI 회의 결과 만장일치" |
| "Skill issue" | "실력 이슈" |

**Config:**
```yaml
memeMode: true  # one line, that's it
```

**Difficulty:** ★★☆☆☆ — No logic changes. Formatter branching + meme text pools.

---

### Phase 4: CLI Intelligence Features

#### 4.1 Model Leaderboard Command

**Command:** `codeagora models`

```
Model Leaderboard (.ca/model-quality.json)

  # │ Model                      │ Win Rate │ Reviews │ Avg Q  │ Specificity
  1 │ anthropic/claude-sonnet-4   │ 87.5%    │ 16      │ 0.782  │ 0.85
  2 │ openai/gpt-4o              │ 71.4%    │ 14      │ 0.651  │ 0.72
  3 │ groq/llama-3.3-70b         │ 60.0%    │ 10      │ 0.543  │ 0.61
  ↓ │ google/gemini-2.0-flash    │ 33.3%    │  6      │ 0.312  │ 0.45

  Win rate = alpha / (alpha + beta) from Thompson Sampling arms
  Avg Q = mean compositeQ from review history
```

**Data source:** `BanditStore.getAllArms()` + `BanditStore.getHistory()`

**Difficulty:** ★★☆☆☆

---

#### 4.2 Reviewer Agreement Matrix

**Description:** Cross-reviewer agreement analysis for a session.

```
Agreement Matrix (session 2026-03-19/003)
          │ r1-claude │ r2-gpt4o │ r3-llama
r1-claude │     -     │  72.3%   │  45.1%
r2-gpt4o  │  72.3%    │     -    │  38.9%
r3-llama  │  45.1%    │  38.9%   │     -
```

**Data source:** `PipelineResult.reviewerMap`

**Difficulty:** ★★☆☆☆

---

#### 4.3 Session Explain Command

**Command:** `codeagora explain <session-path>`

Reads all session artifacts and produces a narrative summary:

```
Session 2026-03-19/003 — REJECT

L1: 5 reviewers examined 3 file groups
  → claude-sonnet found 4 issues, gpt-4o found 6 issues, llama found 2 issues
  → 3 issues agreed by 2+ reviewers, 5 unique

L2: 3 discussions opened
  → d001 (SQL injection, auth.ts:42): 2 rounds, devil's advocate initially
    disagreed but conceded after evidence review. Consensus: CRITICAL
  → d002 (unused import, utils.ts:1): all supporters dismissed. DISMISSED.
  → d003 (race condition, handler.ts:88): tie after 3 rounds, moderator
    forced CRITICAL

L3: Head verdict — REJECT
  → 2 blocking issues remain (d001, d003)
  → Questions for human: "Is the connection pool shared across workers?"
```

**Data source:** Session directory files (metadata.json, reviews/, discussions/, head-verdict)

**Difficulty:** ★★★☆☆

---

#### 4.4 Session Replay Command

**Command:** `codeagora replay <session-path>`

Re-renders a past session's annotated diff output locally (no LLM calls).

**Leverages:** `formatAnnotated()` + session file reading.

**Difficulty:** ★★★☆☆

---

#### 4.5 Diff Complexity Estimator

**Description:** Pre-review complexity analysis added to dry-run output.

```
Diff Complexity: MEDIUM
  12 files changed, 342 lines (+218, -124)
  Security-sensitive: src/auth/*, src/crypto/* (2 files)
  New functions: 4, Modified: 8, Deleted: 1
  Estimated review cost: ~$0.12
```

**Difficulty:** ★★☆☆☆

---

#### 4.6 Devil's Advocate Effectiveness Tracking

**Description:** Track how often devil's advocate (a) successfully flips a verdict, (b) concedes after initially disagreeing, (c) correctly identifies false positives.

**Data source:** Cross-reference `supporters.json` + `round-N.md` + `verdict.md`

**Difficulty:** ★★☆☆☆

---

#### 4.7 Reviewer Diversity Score

**Description:** After pipeline run, report diversity metrics.

```
Reviewer Diversity: 83%
  Families: 3/3 (claude, gpt, llama)
  Reasoning models: 1/2
  Providers: 3 unique
  Issue overlap: 17%
```

**Data source:** `reviewerMap` + `model-registry.ts`

**Difficulty:** ★☆☆☆☆

---

### Phase 5: Web Dashboard (Future)

#### 5.1 Web Server Infrastructure

**Description:** Lightweight HTTP server (Hono.js) serving:
- REST API wrapping session file system
- WebSocket/SSE bridge for `ProgressEmitter` events
- Static file serving for frontend SPA

**Difficulty:** ★★★☆☆

---

#### 5.2 Review Results Dashboard

**Description:** Web UI showing:
- Annotated diff with inline issue markers (like GitHub, but richer)
- Severity heatmap
- Confidence badges with hover detail
- Collapsible discussion threads

**Difficulty:** ★★★☆☆

---

#### 5.3 Real-time Pipeline Progress

**Description:** WebSocket-powered live pipeline view.

**Data source:** `ProgressEmitter` → WebSocket bridge

**Difficulty:** ★★★☆☆

---

#### 5.4 Model Intelligence Dashboard

**Description:** Visualize Thompson Sampling data:
- Model leaderboard with win rates and confidence intervals
- Quality trend charts (compositeQ over time)
- Selection frequency heatmap
- Provider reliability dashboard (circuit breaker states)

**Data source:** `.ca/model-quality.json`

**Difficulty:** ★★★★☆

---

#### 5.5 Session History Browser

**Description:** Searchable, filterable session list with:
- Session-over-session comparison
- Severity trend over time
- Cost trend over time

**Data source:** `.ca/sessions/` file tree

**Difficulty:** ★★★☆☆

---

#### 5.6 Cost Analytics Dashboard

**Description:** Charts for:
- Cost per session over time
- Cost per reviewer breakdown
- Cost per layer (L1/L2/L3)
- Budget tracking vs `dailyBudget` config

**Difficulty:** ★★★☆☆

---

#### 5.7 Discussion/Debate Viewer

**Description:** Threaded debate view with:
- Stance visualization per round
- Consensus progression
- Devil's advocate tracking
- Supporter persona display

**Difficulty:** ★★★☆☆

---

#### 5.8 Config Management UI

**Description:** Form-based config editor with:
- Real-time Zod validation
- Template selection
- Provider health check
- Preview mode

**Difficulty:** ★★★★☆

---

### Phase 6: MCP Server & Platform Integration

#### 6.1 MCP Server Package

**Description:** Expose CodeAgora's pipeline as an MCP (Model Context Protocol) server. Any MCP-compatible client (Claude Code, Cursor, Windsurf, OpenCode, etc.) can invoke code review as a tool call.

**Package:** `@codeagora/mcp` — thin wrapper over `@codeagora/core`.

**Architecture:**
```
packages/mcp/               # @codeagora/mcp
├── package.json
└── src/
    ├── server.ts           # MCP server setup (stdio transport)
    ├── tools/
    │   ├── review-quick.ts # L1-only fast review (10s)
    │   ├── review-full.ts  # Full L0→L1→L2→L3 pipeline (30-60s)
    │   ├── review-pr.ts    # Fetch PR diff and review
    │   ├── dry-run.ts      # Cost estimation without LLM calls
    │   ├── explain.ts      # Session narrative explanation
    │   ├── leaderboard.ts  # Model quality leaderboard
    │   └── stats.ts        # Session statistics
    └── index.ts
```

**MCP Tools:**

| Tool | Description | Latency | Cost |
|------|------------|---------|------|
| `review_quick` | L1 only (2-3 reviewers, no discussion). Fast sanity check. | ~10s | ~$0.02 |
| `review_full` | Full pipeline with debate. Thorough multi-model consensus. | 30-60s | ~$0.10-0.20 |
| `review_pr` | Fetches PR diff via `gh` and runs full review. | 35-65s | ~$0.10-0.20 |
| `dry_run` | Cost/config preview. Zero LLM calls. | <1s | $0 |
| `explain_session` | Reads session artifacts, returns narrative summary. | <1s | $0 |
| `get_leaderboard` | Model win rates from Thompson Sampling data. | <1s | $0 |
| `get_stats` | Aggregate session statistics. | <1s | $0 |

**Tool schema example:**
```typescript
{
  name: "review_quick",
  description: "Fast multi-LLM code review (L1 only, no debate). Returns structured issues with severity, confidence, and file locations.",
  inputSchema: {
    type: "object",
    properties: {
      diff: { type: "string", description: "Unified diff content" },
      reviewer_count: { type: "number", description: "Number of reviewers (default: 3)", default: 3 },
    },
    required: ["diff"]
  }
}
```

**Return format:** Structured JSON that the calling agent can reason about — not just text.

```typescript
{
  decision: "REJECT",
  reasoning: "2 blocking issues found",
  issues: [
    {
      severity: "CRITICAL",
      file: "src/auth.ts",
      line: [42, 45],
      title: "SQL Injection via raw query",
      confidence: 87,
      flaggedBy: ["claude-sonnet", "gpt-4o"],  // multi-model agreement
    }
  ],
  cost: "$0.0234",
  sessionId: "2026-03-19/005"
}
```

**Difficulty:** ★★☆☆☆ — `@codeagora/core` already exposes `runPipeline()`. MCP server is just tool registration + input/output mapping.

---

#### 6.2 Lightweight Review Mode

**Description:** New pipeline mode optimized for MCP/interactive use. Skips L2 discussion and L3 head verdict. Runs 2-3 reviewers in parallel, returns raw evidence documents with L1 confidence scores.

**Motivation:** Full pipeline (30-60s) is too slow for interactive coding sessions. `review_quick` needs a dedicated fast path in core.

**Implementation:** Add `skipDiscussion: true` + `skipHead: true` options to `runPipeline()` (partially exists — `skipDiscussion` already supported).

**Difficulty:** ★★☆☆☆

---

#### 6.3 Claude Code Hook Integration

**Description:** Pre-built hook configurations for Claude Code that trigger CodeAgora reviews automatically.

**Pre-commit hook:**
```json
{
  "hooks": {
    "pre-commit": [{
      "command": "codeagora review --quick --format json --stdin",
      "description": "Quick multi-LLM review before commit"
    }]
  }
}
```

**Slash command (via MCP):**
```
/review          → review_quick on current staged diff
/review --full   → review_full with debate
/review --pr 123 → review_pr on specific PR
```

**Difficulty:** ★☆☆☆☆ — Documentation + example configs.

---

#### 6.4 Context-Optimized Output

**Description:** MCP tool responses must be compact to avoid consuming the calling agent's context window. Add a `compact` output format that strips raw evidence text and keeps only structured data.

**Full output:** ~2000 tokens per review (10 issues with full problem/evidence/suggestion)
**Compact output:** ~400 tokens (severity + file + line + title + confidence only)

```typescript
// compact mode
{
  decision: "REJECT",
  issues: [
    { severity: "CRITICAL", file: "src/auth.ts", line: 42, title: "SQL Injection", confidence: 87 },
    { severity: "WARNING", file: "src/api.ts", line: 15, title: "Missing error handler", confidence: 62 },
  ],
  summary: "2 critical, 3 warning, 1 suggestion"
}
```

The calling agent can then request full details for specific issues if needed:
```
get_issue_detail(sessionId, issueIndex) → full problem + evidence + suggestion
```

**Difficulty:** ★★☆☆☆

---

#### 6.5 Multi-Platform MCP Distribution

**Description:** Publish MCP server configurations for all major platforms.

| Platform | Integration Method | Config Location |
|----------|-------------------|----------------|
| Claude Code | `~/.claude/settings.json` mcpServers | Documented |
| Cursor | MCP settings | Documented |
| Windsurf | MCP settings | Documented |
| OpenCode | Plugin + MCP | Documented |
| VS Code (Copilot) | MCP extension | Documented |

**Installation:**
```bash
# npm global install
npm install -g @codeagora/mcp

# Claude Code config
{
  "mcpServers": {
    "codeagora": {
      "command": "codeagora-mcp",
      "args": ["--config", ".ca/config.yaml"]
    }
  }
}
```

**Difficulty:** ★★☆☆☆ — Mostly documentation + testing across platforms.

---

#### Key Value Proposition

**"AI가 짠 코드를 같은 AI가 리뷰하면 의미 없다."**

CodeAgora MCP의 핵심 가치: 코딩 에이전트(Claude, Copilot, Codex)가 작성한 코드를 **독립적인 다수 LLM이 반대 의견까지 포함해 합의 기반으로 검증**. Self-review가 아닌 cross-model peer review.

#### Challenges & Mitigations

| Challenge | Severity | Mitigation |
|-----------|----------|------------|
| Latency (30-60s for full review) | High | `review_quick` mode (L1 only, ~10s) |
| Cost per review ($0.05-0.20) | Medium | `dry_run` for cost preview; daily budget config already exists |
| Context window consumption | High | Compact output format (6.4); on-demand detail fetching |
| API key management (5+ providers) | Medium | `credentials` system already exists; document minimal setup (1-2 providers) |
| Core stability | Medium | MCP package added after Sprint 3+ when core is battle-tested |

#### Timing

MCP server is a **thin wrapper** — the hard part is the pipeline, which already exists. But exposing an unstable pipeline as a public tool creates bad first impressions.

**Recommended:** Add `@codeagora/mcp` package after Sprint 3 (Discord integration complete), when:
- Core pipeline is enriched with round data (1.1)
- Telemetry is wired (1.4)
- Event emitter exists for progress streaming (2.1)
- Lightweight review mode is proven (6.2)

---

## 5. Difficulty Matrix

```
★☆☆☆☆  Trivial (< 1 hour, < 50 lines changed)
★★☆☆☆  Easy (1-3 hours, < 200 lines)
★★★☆☆  Medium (half day ~ 1 day, < 500 lines)
★★★★☆  Hard (1-3 days, architectural decisions needed)
★★★★★  Major (1+ week, new infrastructure)
```

| # | Feature | Difficulty | New Logic | New Files |
|---|---------|-----------|-----------|-----------|
| 1.1 | DiscussionRound propagation | ★★☆☆☆ | Minimal | 0 |
| 1.2 | Inline debate logs | ★★☆☆☆ | None | 0 |
| 1.3 | Summary debate detail | ★★☆☆☆ | None | 0 |
| 1.4 | Performance in summary | ★☆☆☆☆ | None | 0 |
| 1.5 | Suppressed issues display | ★★☆☆☆ | Propagation | 0 |
| 1.6 | Confidence filtering | ★★☆☆☆ | Filter logic | 0 |
| 1.7 | SARIF discussion metadata | ★☆☆☆☆ | None | 0 |
| 1.8 | Session diff on re-review | ★★☆☆☆ | Session tracking | 0 |
| 1.9 | Issue heatmap | ★☆☆☆☆ | None | 0 |
| 1.10 | Dry-run preview comment | ★★☆☆☆ | GH Action flow | 0 |
| 1.11 | Review status badge | ★☆☆☆☆ | URL generation | 0 |
| 1.5.1 | Webhook payload enrichment | ★☆☆☆☆ | None | 0 |
| 1.5.2 | Generic webhook + HMAC | ★★☆☆☆ | HMAC signing | 0 |
| 1.5.3 | Event stream webhook | ★★★☆☆ | Listener wiring | 0 |
| 2.1 | Moderator event emitter | ★★☆☆☆ | EventEmitter | 1 |
| 2.2 | Discord live chat + threads | ★★★☆☆ | Thread management | 1 |
| 2.3 | Discord pipeline summary | ★★☆☆☆ | Embed building | 0 |
| 3.1 | Meme mode | ★★☆☆☆ | Formatter branch | 4 |
| 4.1 | Model leaderboard CLI | ★★☆☆☆ | Data aggregation | 1 |
| 4.2 | Agreement matrix | ★★☆☆☆ | Cross-analysis | 0 |
| 4.3 | Session explain | ★★★☆☆ | Narrative builder | 1 |
| 4.4 | Session replay | ★★★☆☆ | Session reader | 1 |
| 4.5 | Diff complexity estimator | ★★☆☆☆ | Heuristic analysis | 0 |
| 4.6 | Devil's advocate tracking | ★★☆☆☆ | Cross-reference | 0 |
| 4.7 | Reviewer diversity score | ★☆☆☆☆ | Simple metrics | 0 |
| 5.1-5.8 | Web dashboard (8 features) | ★★★~★★★★ | Full stack | Many |
| 6.1 | MCP server package | ★★☆☆☆ | Tool handlers | 1 package |
| 6.2 | Lightweight review mode | ★★☆☆☆ | Pipeline option | 0 |
| 6.3 | Claude Code hook integration | ★☆☆☆☆ | Documentation | 0 |
| 6.4 | Context-optimized output | ★★☆☆☆ | Compact formatter | 0 |
| 6.5 | Multi-platform MCP distribution | ★★☆☆☆ | Documentation + configs | 0 |

---

## 6. Dependency Graph

```
                    ┌──────────────┐
                    │ 1.1 Rounds   │ ← KEYSTONE
                    │ Propagation  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ 1.2      │ │ 1.3      │ │ 1.5.1        │
        │ Inline   │ │ Summary  │ │ Webhook      │
        │ Debate   │ │ Debate   │ │ Enrichment   │
        └──────────┘ └──────────┘ └──────────────┘

                    ┌──────────────┐
                    │ 2.1 Moderator│ ← KEYSTONE
                    │ Emitter      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ 2.2      │ │ 2.3      │ │ 1.5.3        │
        │ Discord  │ │ Discord  │ │ Event Stream │
        │ Live     │ │ Summary  │ │ Webhook      │
        └──────────┘ └──────────┘ └──────────────┘

   All other features (1.4-1.11, 1.5.2, 3.1, 4.1-4.7) have NO dependencies.
```

---

## 7. Technical Feasibility Notes

### Discord Webhook Constraints

| Constraint | Limit | Impact |
|-----------|-------|--------|
| Rate limit | 30 req / 60s per webhook URL | Worst case 45 msgs (5 disc x 3 rounds x 3 supporters) — mitigate by batching |
| Embed size | 6000 chars total | Truncate supporter responses to ~500 chars |
| Message edit | Not available via webhook | Each event = new message (natural chat flow) |
| Thread creation | Supported via `?wait=true` + `thread_id` | Requires parsing response body from POST |
| Thread naming | Auto-named from first message | Use discussion title as first message |

### GitHub Comment Constraints

| Constraint | Limit | Impact |
|-----------|-------|--------|
| Comment body | 65535 chars | Truncation strategy needed for large reviews |
| Inline comments | 50 per review (practical limit) | Already handled in `poster.ts` |
| API rate limit | 5000 req/hr (authenticated) | Non-issue for review posting |

### Meme Mode Constraints

| Constraint | Mitigation |
|-----------|------------|
| Professional contexts | Off by default, explicit opt-in |
| Message length | Meme text is shorter than formal text |
| i18n | Separate pools per language |
| Randomness reproducibility | Seed from sessionId for deterministic memes per session |

### Event Stream Webhook Constraints

| Constraint | Mitigation |
|-----------|------------|
| Receiver must handle partial data | Include `event_type` field for routing |
| Network failures mid-stream | Fire-and-forget per event; final summary always sent |
| Ordering | Include monotonic `sequence` counter |

---

## 8. TypeScript Limitations

### Actual Limitations in This Codebase

#### 8.1 Synchronous File I/O Blocking Event Loop

Two locations use `readFileSync` at module load time:

| File | Line | Impact |
|------|------|--------|
| `pipeline/cost-estimator.ts` | `readFileSync(pricing.json)` | Blocks event loop on first import |
| `pipeline/chunker.ts` | `readFileSync(filePath)` | Blocks during diff chunking |

**Why it matters:** When a web server is added (Phase 5), pipeline execution blocks all HTTP request handling. Also affects real-time Discord streaming (Phase 2) — events can't be emitted while sync I/O runs.

**Fix:** Convert to `readFile` (async). ★☆☆☆☆ — should be done during monorepo migration.

#### 8.2 Single Binary Distribution

```json
"bin": { "codeagora": "./dist/cli/index.js" }
```

Node.js runtime required. Cannot produce a standalone binary like Go or Rust.

| Metric | Node/TS (current) | Go | Rust |
|--------|-------------------|-----|------|
| Install method | `npm i -g` (Node required) | Single binary download | Single binary |
| Cold start | ~200ms | ~5ms | ~2ms |
| GitHub Action setup | `npm install` (5-10s) | Pre-built binary (instant) | Instant |
| Docker image | `node:alpine` (~150MB) | `scratch` (~10MB) | `scratch` (~10MB) |

**Mitigations:** Node.js SEA (Single Executable Application, Node 21+), `bun build --compile`, or `pkg`. None are as clean as native compilation.

**Practical impact:** GitHub Action `npm install` overhead (5-10s per run). Monorepo migration helps here — `@codeagora/core` + `@codeagora/github` only for Action, skipping ink/react/commander.

#### 8.3 Process Management via spawn()

`l1/backend.ts` uses `spawn()` for CLI backends (codex, gemini, claude, copilot):

```typescript
const child = spawn(cmd.bin, cmd.args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: timeoutMs,
});
```

Node.js `spawn` weaknesses vs Go's `exec.Command` or Rust's `std::process::Command`:
- Zombie process cleanup is unreliable after timeout
- No automatic SIGTERM → SIGKILL escalation (must implement manually)
- Process group management requires `detached: true` + manual `process.kill(-pid)`

**Impact:** CLI backend timeouts can leave orphaned processes. The API backend (AI SDK direct calls) is unaffected.

#### 8.4 Runtime Type Erasure → Double Validation

TypeScript types vanish at compile time, requiring Zod for runtime validation:

```typescript
// Type-level (compile time only — erased in JS output)
type EvidenceDocument = { issueTitle: string; severity: Severity; ... }

// Runtime validation (actually runs in production)
const doc = EvidenceDocumentSchema.parse(rawData);
```

Go/Rust validate at compile time — no runtime overhead. In TS, every external boundary (config loading, LLM response parsing, file reading) needs explicit Zod validation.

**Impact:** Minor runtime overhead. More importantly, it means two definitions to maintain (type + schema), though Zod's `z.infer<>` mitigates this well.

#### 8.5 O(n) Collection Scans

Several hotpaths do linear scans where indexed lookups would be better:

```typescript
// confidence.ts — for EACH doc, scan ALL docs
const agreeing = allDocs.filter(d =>
  d.filePath === doc.filePath &&
  Math.abs(d.lineRange[0] - doc.lineRange[0]) <= 5
).length;
```

This is a data structure choice (not strictly a TS limitation), but Go/Rust's type systems make Map/Index patterns more idiomatic. With thousands of evidence documents, this becomes O(n²).

### Not Actually Limitations

| Common Claim | Reality for This Project |
|-------------|------------------------|
| "TS can't handle concurrency" | Pipeline is I/O-bound (LLM API waits). `Promise.allSettled` + `pLimit` is optimal. Goroutines would add complexity without benefit. |
| "TS doesn't scale" | Source is ~800KB. Zod schemas enforce boundaries. Monorepo packages will add structural enforcement. |
| "AI SDK lock-in to TS" | Vercel AI SDK is TS-first — this is an **advantage**. Go/Rust would need hand-rolled API clients for 5+ providers. |
| "Web server performance" | Dashboard serves ~10 concurrent users max. Hono.js handles 30K+ req/s. Not a bottleneck. |
| "Can't do real-time" | `EventEmitter` + WebSocket is native. `ProgressEmitter` already exists and works. |

### Fitness Assessment

| Area | TS Fitness | Notes |
|------|-----------|-------|
| AI SDK integration | **Optimal** | Vercel AI SDK, all providers TS-first |
| CLI/TUI | **Strong** | commander + ink ecosystem, no alternative matches |
| Pipeline orchestration | **Strong** | async/await + Promise.allSettled is natural fit |
| Web dashboard | **Strong** | Full-stack type sharing (core types → API → frontend) |
| Real-time streaming | **Strong** | EventEmitter → WebSocket/SSE, native |
| Binary distribution | **Weak** | Node runtime dependency, mitigable with SEA/bun |
| Process management | **Weak** | spawn() zombie risk, only affects CLI backends |
| Large diff processing | **Moderate** | Single-threaded, fixable with worker_threads |

### Recommended Quick Fixes

| Fix | Difficulty | When |
|-----|-----------|------|
| Convert `readFileSync` → `readFile` (2 locations) | ★☆☆☆☆ | During monorepo migration |
| Add SIGKILL escalation to `spawn()` timeout handler | ★☆☆☆☆ | Sprint 1 |
| Index `EvidenceDocument[]` by filePath for O(1) lookups | ★★☆☆☆ | Sprint 1 |
| Explore `bun build --compile` for GitHub Action binary | ★★☆☆☆ | Sprint 5 |

---

## 9. Test Strategy

### Current State

- 1,443 tests across 91 files — all unit tests with mocked LLM/API responses
- Zero real LLM integration tests (Architecture TOP 5 #5)
- No package boundary concept (single `vitest.config.ts`)
- Prompt drift risk: changing prompts never breaks tests

### Post-Monorepo Test Architecture (3 Layers)

```
L1: Package Unit Tests          ← existing 1,443 tests redistributed
L2: Cross-Package Integration   ← NEW: package API contract verification
L3: E2E / Real LLM Smoke       ← NEW: actual provider calls, structure-only assertions
```

#### L1: Package Unit Tests (Sprint 0)

Redistribute existing tests into their new packages during monorepo migration. No new test logic — just reorganization.

```
packages/
├── core/tests/        # l0, l1, l2, l3, pipeline, config, learning tests
├── github/tests/      # mapper, poster, sarif, diff-parser tests
├── cli/tests/         # commands, formatters tests
├── tui/tests/         # component, screen tests
├── shared/tests/      # utils, concurrency tests
└── notifications/tests/  # webhook tests
```

Each package gets its own `vitest.config.ts`. Run all: `pnpm -r test`.

**Mock boundary rule:** Mock only at **external boundaries** (LLM APIs, GitHub API, filesystem, spawn). Cross-package imports use real implementations via pnpm workspace links — mocking `@codeagora/core` from `@codeagora/github` would hide integration bugs.

#### L2: Cross-Package Integration Tests (Sprint 1~2)

Verify that package public APIs compose correctly. Located at **root `tests/integration/`** — not owned by any single package.

```
tests/
├── integration/
│   ├── core-to-github.test.ts        # PipelineResult → mapToGitHubReview()
│   ├── core-to-notifications.test.ts # PipelineResult → NotificationPayload
│   ├── core-to-mcp.test.ts           # PipelineResult → MCP tool response (Sprint 6)
│   └── emitter-to-discord.test.ts    # ProgressEmitter → Discord webhooks (Sprint 3)
├── fixtures/
│   ├── pipeline-result-accept.json   # Snapshot: full PipelineResult (ACCEPT)
│   ├── pipeline-result-reject.json   # Snapshot: full PipelineResult (REJECT)
│   ├── sample-small.diff             # 3-file diff for smoke tests
│   └── sample-large.diff             # 20+ file diff for chunking tests
└── vitest.config.ts                  # Separate config: integration
```

**CI separation:**
```json
{
  "test:unit": "pnpm -r test",
  "test:integration": "vitest --config tests/vitest.config.ts",
  "test:all": "pnpm test:unit && pnpm test:integration"
}
```

#### L3: Real LLM Smoke Tests (Sprint 5)

Actual LLM API calls with structure-only assertions (content is non-deterministic).

```
tests/
├── smoke/
│   ├── pipeline-l1-only.test.ts      # L1 reviewers, skip discussion
│   ├── pipeline-full.test.ts         # Full L0→L1→L2→L3
│   ├── stance-parser-real.test.ts    # Real LLM response → parseStance()
│   └── forced-decision-real.test.ts  # Real moderator → parseForcedDecision()
```

**Design principles:**

| Principle | Implementation |
|-----------|---------------|
| Gate by env var | `CODEAGORA_SMOKE_TEST=true` — skipped otherwise |
| Structure-only assertions | Verify field presence, types, ranges — never assert content |
| Minimum cost | Use cheapest provider (groq/llama-3.3-70b) + smallest fixture diff |
| CI cadence | Nightly or pre-release — not on every PR |
| Timeout tolerance | 120s per test (LLM latency varies) |

**Example:**
```typescript
describe.skipIf(!process.env['CODEAGORA_SMOKE_TEST'])('Real LLM Pipeline', () => {
  it('should return structured EvidenceDocuments from real reviewers', async () => {
    const result = await runPipeline({
      diffPath: 'tests/fixtures/sample-small.diff',
      skipDiscussion: true,
    });

    expect(result.status).toBe('success');
    expect(result.evidenceDocs?.length).toBeGreaterThan(0);
    for (const doc of result.evidenceDocs ?? []) {
      expect(doc.severity).toMatch(/HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION/);
      expect(doc.filePath).toBeTruthy();
      expect(doc.lineRange[0]).toBeLessThanOrEqual(doc.lineRange[1]);
      expect(doc.confidence).toBeGreaterThanOrEqual(0);
      expect(doc.confidence).toBeLessThanOrEqual(100);
    }
  }, 120_000);
});
```

**Estimated cost:** groq/llama-3.3-70b, small diff, L1 only = **<$0.001 per run**. Nightly = ~$0.03/month.

### TDD Application Strategy

**Guiding principle: "Contract-clear code gets TDD. Presentation code gets snapshots."**

| Code Type | Testing Method | Examples |
|-----------|---------------|---------|
| Parsers with defined I/O | **TDD (mandatory)** | parseStance(), parseForcedDecision(), HMAC verification |
| Event contracts | **TDD (mandatory)** | DiscussionEmitter event sequence, MCP tool handlers |
| Pipeline logic branches | **TDD (recommended)** | Lightweight review mode, confidence adjustment, rounds propagation |
| Formatters / presenters | **Snapshot tests** | GitHub comment markdown, Discord embeds, CLI output |
| Meme text pools | **Manual / basic existence** | Pool not empty, random pick works |
| Real LLM behavior | **Structure-only smoke** | Cannot TDD — output is non-deterministic |

**Per-sprint TDD map:**

```
Sprint 0:  TDD MANDATORY
  ├── #96  parseStance() rewrite — edge cases first, then implementation
  ├── #110 parseForcedDecision() rewrite — same approach
  ├── #88  objection round boundary — boundary value tests first
  └── #84  circuit breaker half-open — state transition tests first

Sprint 1:  TDD RECOMMENDED
  ├── 1.1  DiscussionRound propagation — verify rounds reach PipelineResult
  └── caching logic (#109) — cache hit/miss/invalidation tests first

Sprint 2:  SNAPSHOT TESTS
  ├── 1.2  Inline debate logs — snapshot GitHub comment markdown
  ├── 1.3  Summary debate detail — snapshot summary body
  └── 1.5  Suppressed issues — snapshot rendering

Sprint 3:  TDD MANDATORY
  ├── 2.1  Moderator event emitter — event sequence contract tests first
  ├── 1.5.2 HMAC signing — signature verification tests first
  └── Discord thread creation — mock webhook, verify call sequence

Sprint 4:  BASIC TESTS
  ├── 3.1  Meme mode — pool existence + formatter branch tests
  └── 4.1  Model leaderboard — aggregation logic tests

Sprint 5:  SMOKE + TDD
  ├── L3 real LLM smoke tests (structure-only)
  ├── #71 context-aware review — context injection tests first
  └── 4.5  diff complexity — heuristic scoring tests

Sprint 6:  TDD MANDATORY
  ├── 6.1  MCP tool handlers — input validation + output schema tests first
  ├── 6.2  Lightweight review mode — pipeline option branching tests
  └── 6.4  Compact output format — schema conformance tests
```

### Test Coverage Targets

| Layer | Current | Sprint 0 Target | Sprint 6 Target |
|-------|---------|----------------|----------------|
| L1 Package Unit | 1,443 tests | 1,443+ (redistributed, parser tests added) | 1,700+ |
| L2 Cross-Package | 0 | 0 | 15-20 integration tests |
| L3 Real LLM Smoke | 0 | 0 | 5-8 smoke tests |
| TDD-covered features | 0% | Parser rewrites (Sprint 0) | All contracts + parsers + MCP |

---

## 10. Recommended Execution Order

### ~~Sprint 0: Monorepo Migration + Stabilization~~ ✅ DONE

> **Completed:** PRs #112–#129 (15 PRs). All 11 issues resolved. 1506/1506 tests.

~~Monorepo migration (7 steps), 4 security fixes (#102, #107, #83, #75), 3 critical bugs (#96, #88, #110), 4 stability fixes (#84, #91, #79, #77), readFileSync→readFile async migration.~~

---

### ~~Sprint 1: Foundation + Quick Wins~~ ✅ DONE

> **Completed:** PR #131. 6 features implemented and wired.

~~1.1 DiscussionRound propagation (keystone), 1.4 Performance in summary comment, 1.9 Issue heatmap, 1.7 SARIF discussion metadata, 4.7 Reviewer diversity score, 1.5.1 Webhook payload enrichment.~~

---

### ~~Sprint 2: GitHub Comment Enrichment~~ ✅ DONE

> **Completed:** PR #133. 5 features implemented and wired.

~~1.2 Inline debate logs, 1.3 Summary debate detail, 1.5 Suppressed issues display, 1.6 Confidence filtering, 1.11 Review status badge.~~

---

### ~~Sprint 3: Webhook + Discord~~ ✅ DONE

> **Completed:** PR #135. 4 features implemented.

~~2.1 Moderator event emitter (keystone), 1.5.2 Generic webhook + HMAC, 2.2 Discord live chat + threads, 2.3 Discord pipeline summary.~~

---

### ~~Sprint 4: Meme Mode + CLI~~ ✅ DONE

> **Completed:** PR #137. 3 features implemented and CLI commands registered.

~~3.1 Meme mode (full implementation), 4.1 Model leaderboard CLI, 4.3 Session explain command.~~

---

### ~~Sprint 5: Advanced Features~~ ✅ DONE

> **Completed:** PR #139 + #141 (wiring). 7 features implemented, CLI commands registered, pipeline integrated.

~~1.5.3 Event stream webhook, 1.8 Session diff on re-review, 1.10 Dry-run preview comment, 4.2 Agreement matrix, 4.4 Session replay, 4.5 Diff complexity estimator, 4.6 Devil's advocate tracking.~~

---

### ~~Sprint 6: MCP Server & Platform Integration~~ ✅ DONE

> **Completed:** PR #145. `@codeagora/mcp` package with 7 tools, lightweight mode, compact output. Code review fixes in PR #143 (14 issues, 22 tests added).

~~6.2 Lightweight review mode, 6.1 MCP server package, 6.4 Context-optimized output, 6.3 Claude Code hook integration, 6.5 Multi-platform MCP distribution.~~

---

### ~~Sprint 7: Web Dashboard~~ ✅ DONE

> **Completed:** PRs #148–#155 (8 PRs). `@codeagora/web` package with Hono.js REST API + WebSocket + React SPA. 8 features, 207 tests.

~~5.1 Web server infrastructure, 5.2 Review results dashboard, 5.3 Real-time pipeline progress, 5.4 Model intelligence dashboard, 5.5 Session history browser, 5.6 Cost analytics dashboard, 5.7 Discussion/debate viewer, 5.8 Config management UI.~~

---

## Appendix A: GitHub Issue → v2 Sprint Mapping

### Issues Absorbed into Sprint 0 (Monorepo Migration)

These are resolved as part of monorepo structural cleanup. Security fixes and critical parser bugs must land before feature work begins.

| Issue | Priority | Title | Resolution |
|-------|----------|-------|------------|
| #102 | **Critical** | loadPersona() path traversal | Security fix in `@codeagora/core` L2 |
| #96 | **Critical** | parseStance() LLM response misclassification | Replace naive keyword counting with structured output parsing |
| #88 | **Critical** | Objection round exceeding maxRounds | L2 boundary validation fix |
| #107 | **High** | SARIF path traversal — validate sarifOutputPath | Security fix in `@codeagora/github` |
| #83 | **High** | Validate credentials file permissions (600) | Fix in `@codeagora/core` config |
| #79 | **High** | Config not found → suggest `agora init` | CLI UX fix in `@codeagora/cli` |
| #110 | Medium | parseForcedDecision() severity misparse | Same root cause as #96 — parser rewrite |
| #84 | Medium | Circuit breaker half-open state | Consolidate L0/L1 circuit breakers (Architecture TOP 5 #2) |
| #91 | Medium | Reviewer timeout cancellation | SIGKILL escalation (TS Limitation 8.3) |
| #75 | Medium | .ca/ directory permissions (700) | Session manager hardening |
| #77 | Medium | stdin temp file cleanup on error | try-finally in `@codeagora/cli` |

### Issues Absorbed into Sprint 1~3

| Issue | Priority | Title | Sprint | v2 Feature |
|-------|----------|-------|--------|------------|
| #76 | **High** | Parallel chunk review execution | Sprint 1 | Core pipeline optimization |
| #87 | **High** | Parallel discussion execution | Sprint 3 | Prerequisite for 2.1 Event Emitter |
| #109/#105 | Medium | Review result caching — skip identical diffs | Sprint 1 | Synergy with 1.8 Session Diff |
| #89 | Medium | Reviewer fallback chain (array support) | Sprint 1 | L1 resilience improvement |

### Issues Already Covered by v2 Features

| Issue | Title | v2 Feature |
|-------|-------|------------|
| #80 | Web dashboard for review history and model performance | Phase 5 (5.1~5.8) |
| #86 | Enhanced stats — model performance trends | 4.1 Model Leaderboard + Phase 5 dashboards |
| #90 | Progress bar — reviewer completion ratio | 2.1 Moderator Event Emitter + 2.2 Discord Live |
| #101 | Per-session API cost tracking | 1.4 Performance Report + 1.5.1 Webhook Enrichment |
| #92 | Extended output formats — HTML, JUnit XML | Phase 5 Web Dashboard (HTML). JUnit as additional formatter. |
| #73 | Improve CLI output — detailed issue info | 4.3 Session Explain + 4.4 Replay commands |
| #78 | Session search by keyword | Phase 5 Session History Browser (5.5) |

### Issues as Independent v2 Work Items

| Issue | Priority | Title | Sprint | Notes |
|-------|----------|-------|--------|-------|
| #71 | **High** | Context-aware review — diff + surrounding code | Sprint 5 | Major feature: inject surrounding file/symbol context into reviewer prompts |
| #85 | **High** | Validate GITHUB_TOKEN before --post-review | Sprint 2 | Alongside GitHub comment enrichment |
| #81 | Low | Diff preview before review | Sprint 4 | Merge with 4.5 Diff Complexity Estimator |
| #82 | Low | Interactive persona creation wizard | Sprint 4 | New CLI command |

### Out of v2 Scope

| Issue | Title | Reason |
|-------|-------|--------|
| #93 | CodeAgora v1.0.0 Released! | Documentation/announcement, not a work item |

### Summary

```
Sprint 0 absorbs:  11 issues (4 security, 3 critical bugs, 4 stability fixes)
Sprint 1~3 absorbs: 4 issues (parallelization + caching + fallback)
Already in v2:       7 issues (dashboard, stats, progress, cost, output, CLI, search)
Independent v2:      4 issues (context-aware, token validation, preview, persona wizard)
Out of scope:        1 issue  (release announcement)
                    ─────────
Total:              27 of 27 open issues mapped
```

---

## Appendix B: Config Schema Additions

```yaml
# New fields in .ca/config.yaml
memeMode: false                          # Phase 3

github:
  minConfidence: 0                       # Phase 1 (1.6)
  showPerformance: true                  # Phase 1 (1.4)
  showHeatmap: true                      # Phase 1 (1.9)
  showSuppressed: true                   # Phase 1 (1.5)
  showDebateDetail: true                 # Phase 1 (1.2, 1.3)
  showSessionDiff: false                 # Phase 1.5 (1.8)

notifications:
  discord:
    webhookUrl: "..."
    liveDiscussions: false               # Phase 2 (2.2)
    useThreads: true                     # Phase 2 (2.2)
  slack:
    webhookUrl: "..."
  webhook:                               # Phase 1.5 (1.5.2)
    url: "https://..."
    secret: "hmac-secret"
    events: ["pipeline-complete"]        # or ["all"] for event stream (1.5.3)
```
