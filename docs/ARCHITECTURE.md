# Architecture

## 10-Stage Pipeline

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
│  Hallucination Filter (4-check)                  │
│  ① File existence — hard remove if not in diff   │
│  ② Line range — hard remove if outside hunk ±10  │
│  ③ Code quote fabrication → confidence × 0.5     │
│  ④ Self-contradiction → confidence × 0.5         │
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

**Hallucination Filter**: Reduces false positives from LLM reviewers (target: <25%). Applied before L2 debate:
1. **File existence** (hard remove): `doc.filePath` must be in the actual diff file list
2. **Line range** (hard remove): `doc.lineRange` must overlap a diff hunk (±10 lines)
3. **Code quote verification**: Backtick-quoted code fabrication check — >50% fabricated → confidence × 0.5
4. **Self-contradiction**: Claims "added" but only removals exist (or vice versa) → confidence × 0.5

Note: Evidence deduplication is in L2 (`deduplication.ts`). Confidence-based triage (0–15% → NEEDS_HUMAN) is in L3 (`verdict.ts`).

**L2 — Discussion**: A supporter pool and devil's advocate debate contested issues over multiple rounds. Static analysis evidence is included in debate context. The moderator enforces consensus or makes a forced decision.

**L3 — Head Verdict**: Groups issues, scans unconfirmed findings, verifies CRITICAL+ suggestions via tsc transpile check, and delivers a final decision with a triage digest (must-fix / verify / ignore).

## Project Structure

pnpm monorepo with four supported product surfaces: CLI, MCP, GitHub Actions, and the upcoming desktop app.

```
packages/
├── shared/         # @codeagora/shared — types, utils, zod schemas, config
├── core/           # @codeagora/core — L0/L1/L2/L3 pipeline, session management
├── github/         # @codeagora/github — PR review posting, SARIF, diff parsing
├── cli/            # @codeagora/cli — CLI commands, formatters, options
└── mcp/            # @codeagora/mcp — MCP server (9 tools)
```

The former web, TUI, and notifications packages are retired as first-class surfaces. Their human-facing responsibilities move into the upcoming Tauri desktop app.

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
| LLM SDK | Vercel AI SDK (multi-provider) |
| MCP | @modelcontextprotocol/sdk |
| Desktop App | Tauri (private scaffold) |
| Validation | zod |
| Testing | vitest |
| Build | tsup |

## Research Background

CodeAgora's debate architecture is grounded in multi-agent reasoning research:

- **Debate or Vote** (Du et al., 2023): Multi-agent debate improves factuality and reasoning quality over single-model responses.
- **Free-MAD** (Chen et al., 2024): Anti-conformity prompts prevent groupthink and preserve minority positions backed by strong evidence.
- **Heterogeneous Ensembles**: Different models have different error profiles — running them together improves coverage and reduces correlated false positives.
