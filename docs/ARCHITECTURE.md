# Architecture

## 4-Layer Pipeline

```
┌─────────────────────────────────────────────────┐
│  L0: Model Intelligence                          │
│  Thompson Sampling (bandit) model selection,     │
│  health monitoring, quality tracking,            │
│  specificity scoring, leaderboard                │
└───────┬─────────────────────────────────────────┘
        │ Selected reviewers
┌───────▼─────────────────────────────────────────┐
│  L1: Parallel Reviewers                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Reviewer │ │ Reviewer │ │ Reviewer │  ...    │
│  │ (Groq)   │ │ (Google) │ │ (Mistral)│        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘        │
└───────┼────────────┼────────────┼───────────────┘
        │            │            │
        └────────────┼────────────┘
                     │ Severity threshold routing
┌────────────────────▼────────────────────────────┐
│  L2: Discussion                                  │
│  ┌─────────────┐   ┌──────────────────────────┐ │
│  │  Moderator  │◄──│ Supporter Pool + Devil's  │ │
│  │             │   │ Advocate (debate rounds)  │ │
│  └─────┬───────┘   └──────────────────────────┘ │
└────────┼────────────────────────────────────────┘
         │ Consensus or forced decision
┌────────▼────────────────────────────────────────┐
│  L3: Head Agent                                  │
│  Groups issues → Scans unconfirmed →             │
│  ACCEPT / REJECT / NEEDS_HUMAN                   │
└─────────────────────────────────────────────────┘
```

**L0 — Model Intelligence**: Thompson Sampling (bandit) selects reviewer models based on quality history. Tracks health, specificity scores, and maintains a performance leaderboard.

**L1 — Parallel Reviewers**: Multiple LLMs review the diff independently. Severity-based thresholds determine which issues proceed to debate.

**L2 — Discussion**: A supporter pool and devil's advocate debate contested issues over multiple rounds. The moderator enforces consensus or makes a forced decision.

**L3 — Head Verdict**: Groups issues, scans unconfirmed findings, and delivers a final decision.

## Project Structure

pnpm monorepo with 8 packages:

```
packages/
├── shared/         # @codeagora/shared — types, utils, zod schemas, config
├── core/           # @codeagora/core — L0/L1/L2/L3 pipeline, session management
├── github/         # @codeagora/github — PR review posting, SARIF, diff parsing
├── cli/            # @codeagora/cli — CLI commands, formatters, options
├── web/            # @codeagora/web — Hono.js REST API + React SPA dashboard
├── tui/            # @codeagora/tui — interactive terminal UI (ink + React)
├── mcp/            # @codeagora/mcp — MCP server (7 tools)
└── notifications/  # @codeagora/notifications — Discord/Slack webhooks
```

Core packages (`shared`, `core`, `cli`, `github`) ship with `codeagora`.
Optional packages (`web`, `tui`, `mcp`, `notifications`) are installed separately.

## Session Storage

Every review run is saved under `.ca/sessions/`:

```
.ca/
├── config.json
└── sessions/
    └── 2026-03-16/
        └── 001/
            ├── reviews/           # Raw L1 reviewer outputs
            ├── discussions/       # L2 debate transcripts
            ├── unconfirmed/       # Issues below threshold
            ├── suggestions.md     # Low-severity suggestions
            ├── report.md          # Moderator final report
            └── result.md          # Head agent final verdict
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (strict) |
| CLI | commander |
| TUI | ink + React |
| LLM SDK | Vercel AI SDK (multi-provider) |
| Web API | Hono.js |
| MCP | @modelcontextprotocol/sdk |
| Validation | zod |
| Testing | vitest |
| Build | tsup |

## Research Background

CodeAgora's debate architecture is grounded in multi-agent reasoning research:

- **Debate or Vote** (Du et al., 2023): Multi-agent debate improves factuality and reasoning quality over single-model responses.
- **Free-MAD** (Chen et al., 2024): Anti-conformity prompts prevent groupthink and preserve minority positions backed by strong evidence.
- **Heterogeneous Ensembles**: Different models have different error profiles — running them together improves coverage and reduces correlated false positives.
