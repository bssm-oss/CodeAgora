# Architecture

## 6-Stage Pipeline

```
┌─────────────────────────────────────────────────┐
│  L0: Model Intelligence                          │
│  Thompson Sampling (bandit) model selection,     │
│  health monitoring, quality tracking,            │
│  specificity scoring, leaderboard                │
└───────┬─────────────────────────────────────────┘
        │ Selected reviewers
┌───────▼─────────────────────────────────────────┐
│  Pre-Analysis (5 analyzers)                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ Semantic Diff│ │ TS Diagnostics│ │ Change   │ │
│  │ Classification│ │             │ │ Impact   │ │
│  └──────────────┘ └──────────────┘ └──────────┘ │
│  ┌──────────────┐ ┌──────────────┐              │
│  │ AI Rule File │ │ Build Artifact│              │
│  │ Detection    │ │ Exclusion    │              │
│  └──────────────┘ └──────────────┘              │
└───────┬─────────────────────────────────────────┘
        │ Enriched context
┌───────▼─────────────────────────────────────────┐
│  L1: Parallel Specialist Reviewers               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Security │ │  Logic   │ │ General  │  ...    │
│  │ (Groq)   │ │ (Google) │ │ (Mistral)│        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘        │
└───────┼────────────┼────────────┼───────────────┘
        │            │            │
        └────────────┼────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  Hallucination Filter (4-layer defense)          │
│  ① File/line validation against actual diff      │
│  ② Self-contradiction detection                  │
│  ③ Evidence deduplication (merge duplicates)      │
│  ④ Confidence scoring (0% → NEEDS_HUMAN)         │
└────────┬────────────────────────────────────────┘
         │ Validated issues + severity routing
┌────────▼────────────────────────────────────────┐
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
│  Suggestion verification (tsc transpile) →       │
│  ACCEPT / REJECT / NEEDS_HUMAN                   │
│  Triage digest: must-fix / verify / ignore       │
└─────────────────────────────────────────────────┘
```

**L0 — Model Intelligence**: Thompson Sampling (bandit) selects reviewer models based on quality history. Tracks health, specificity scores, and maintains a performance leaderboard.

**Pre-Analysis Layer**: 5 analyzers enrich context before L1 reviewers run:
- **Semantic Diff Classification**: Categorizes changes by type (refactor, feature, bugfix, etc.)
- **TypeScript Diagnostics**: Runs tsc to surface type errors in changed files
- **Change Impact Analysis**: Identifies downstream effects of modifications
- **External AI Rule Detection**: Auto-detects `.cursorrules`, `CLAUDE.md`, `copilot-instructions.md` and injects them into reviewer context
- **Build Artifact Exclusion**: Filters out `dist/`, lock files, `*.min.js` by default

**L1 — Parallel Specialist Reviewers**: Multiple LLMs review the diff independently using specialist personas (`builtin:security`, `builtin:logic`, `builtin:api-contract`, `builtin:general`). Severity-based thresholds determine which issues proceed to debate.

**Hallucination Filter (4-Layer Defense)**: Reduces false positives from ~100% to <25%:
1. **File/line validation**: Checks that referenced files and line numbers exist in the actual diff
2. **Self-contradiction detection**: Flags issues where the problem description contradicts the evidence
3. **Evidence deduplication**: Merges duplicate findings across reviewers before L2
4. **Confidence-based verdict**: Issues with 0% confidence at CRITICAL+ severity route to NEEDS_HUMAN instead of REJECT

**L2 — Discussion**: A supporter pool and devil's advocate debate contested issues over multiple rounds. Static analysis evidence is included in debate context. The moderator enforces consensus or makes a forced decision.

**L3 — Head Verdict**: Groups issues, scans unconfirmed findings, verifies CRITICAL+ suggestions via tsc transpile check, and delivers a final decision with a triage digest (must-fix / verify / ignore).

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
