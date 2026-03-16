# CodeAgora

**Where LLMs Debate Your Code**

![Version](https://img.shields.io/badge/version-1.0.0--rc.3-blue)
![Tests](https://img.shields.io/badge/tests-1300%20passing-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

CodeAgora runs multiple LLMs in parallel to independently review your code, then routes conflicts through a structured debate before a head agent delivers the final verdict. Different models have different blind spots — running them together catches more issues and filters noise through consensus.

---

## How It Works

```
git diff | agora review

  L1  ─── Reviewer A ──┐
        ─── Reviewer B ──┤── parallel independent reviews
        ─── Reviewer C ──┘
                │
  L2  ─── Discussion Moderator
        ─── Supporter pool + Devil's Advocate
        ─── Consensus voting per issue
                │
  L3  ─── Head Agent ──► ACCEPT / REJECT / NEEDS_HUMAN
```

**L1 — Parallel Reviewers**: Multiple LLMs review the diff independently. Severity-based thresholds determine which issues proceed to debate (e.g., `CRITICAL` issues go straight to discussion; `SUGGESTION` level issues go to a suggestions file).

**L2 — Discussion**: A supporter pool and devil's advocate debate contested issues over multiple rounds. The moderator enforces consensus or makes a forced decision.

**L3 — Head Verdict**: Groups issues, scans unconfirmed findings, and delivers a final `ACCEPT`, `REJECT`, or `NEEDS_HUMAN` decision.

---

## Quick Start

Get running in under 2 minutes.

**Prerequisites**: Node.js 18+, pnpm

```bash
# 1. Clone and install
git clone <repo-url> codeagora
cd codeagora
pnpm install

# 2. Build
pnpm build

# 3. Link the CLI globally (or use npx)
npm link

# 4. Initialize in your project
cd /your/project
agora init

# 5. Set an API key (Groq has a free tier — good starting point)
export GROQ_API_KEY=your_key_here

# 6. Run your first review
git diff HEAD~1 | agora review
```

That's it. `agora init` writes a `.ca/config.json` with sensible defaults using your available providers.

---

## Installation

### From source

```bash
git clone <repo-url> codeagora
cd codeagora
pnpm install
pnpm build
```

The build produces `dist/cli/index.js`. The binary is available as both `agora` and `codeagora`.

### API Keys

Set at least one provider API key in your environment:

| Provider | Environment Variable |
|----------|----------------------|
| Groq | `GROQ_API_KEY` |
| Google | `GOOGLE_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| xAI | `XAI_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` |

Check which keys are detected:

```bash
agora providers
```

---

## CLI Reference

### `agora review [diff-path]`

Run the full review pipeline on a diff file or stdin.

```bash
# Review a diff file
agora review changes.diff

# Pipe from git
git diff HEAD~1 | agora review

# Review a specific commit range
git diff main...feature-branch | agora review

# Output as JSON (useful for CI)
git diff HEAD~1 | agora review --output json

# Skip the L2 discussion phase (faster, less thorough)
agora review changes.diff --no-discussion

# Validate config without running
agora review --dry-run
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--output <format>` | Output format: `text`, `json`, `md`, `github` | `text` |
| `--provider <name>` | Override provider for all reviewers | — |
| `--model <name>` | Override model for all reviewers | — |
| `--reviewers <value>` | Number of reviewers or comma-separated IDs | — |
| `--timeout <seconds>` | Pipeline-level timeout | — |
| `--reviewer-timeout <seconds>` | Per-reviewer timeout | — |
| `--no-discussion` | Skip L2 discussion phase | — |
| `--pr <url-or-number>` | GitHub PR URL or number (fetches diff from GitHub) | — |
| `--post-review` | Post review comments back to the PR (requires `--pr`) | — |
| `--dry-run` | Validate config only | — |
| `--quiet` | Suppress progress output | — |
| `--verbose` | Show detailed telemetry | — |

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Success — review passed |
| `1` | Review completed with `REJECT` decision |
| `2` | Config or setup error |
| `3` | Runtime error |

### `agora init`

Initialize CodeAgora in the current project. Creates `.ca/config.json` and a `.reviewignore` file.

```bash
# Interactive wizard (detects available API keys)
agora init

# Non-interactive with defaults (good for CI setup scripts)
agora init --yes

# Write config as YAML instead of JSON
agora init --format yaml

# Overwrite existing config
agora init --force
```

### `agora doctor`

Health check. Verifies Node.js version, config validity, and API key presence.

```bash
agora doctor
```

Exits with code `1` if any check fails.

### `agora config`

Display the loaded config (validates and pretty-prints `.ca/config.json`).

```bash
agora config
```

### `agora providers`

List all supported providers and whether their API key is set in the environment.

```bash
agora providers
```

### `agora sessions`

Manage past review sessions stored under `.ca/sessions/`.

```bash
# List recent sessions
agora sessions list

# Filter and sort
agora sessions list --status completed --after 2026-03-01 --sort issues

# Show a specific session
agora sessions show 2026-03-13/001

# Compare two sessions
agora sessions diff 2026-03-10/001 2026-03-13/001

# Show aggregate statistics
agora sessions stats
```

### `agora tui`

Launch the interactive terminal UI — review setup wizard, real-time pipeline progress, debate viewer, and results drill-down.

```bash
agora tui
```

---

## Configuration

CodeAgora reads `.ca/config.json` (or `.ca/config.yaml`) from the current working directory.

Run `agora init` to generate a starter config, or create one manually:

```json
{
  "reviewers": [
    {
      "id": "r1",
      "model": "llama-3.3-70b-versatile",
      "backend": "api",
      "provider": "groq",
      "enabled": true,
      "timeout": 120
    },
    {
      "id": "r2",
      "model": "llama-3.3-70b-versatile",
      "backend": "api",
      "provider": "groq",
      "enabled": true,
      "timeout": 120
    }
  ],
  "supporters": {
    "pool": [
      {
        "id": "s1",
        "model": "llama-3.3-70b-versatile",
        "backend": "api",
        "provider": "groq",
        "enabled": true,
        "timeout": 120
      }
    ],
    "pickCount": 1,
    "pickStrategy": "random",
    "devilsAdvocate": {
      "id": "da",
      "model": "llama-3.3-70b-versatile",
      "backend": "api",
      "provider": "groq",
      "enabled": true,
      "timeout": 120
    },
    "personaPool": [".ca/personas/strict.md"],
    "personaAssignment": "random"
  },
  "moderator": {
    "model": "llama-3.3-70b-versatile",
    "backend": "api",
    "provider": "groq"
  },
  "discussion": {
    "maxRounds": 4,
    "registrationThreshold": {
      "HARSHLY_CRITICAL": 1,
      "CRITICAL": 1,
      "WARNING": 2,
      "SUGGESTION": null
    },
    "codeSnippetRange": 10
  },
  "errorHandling": {
    "maxRetries": 2,
    "forfeitThreshold": 0.7
  }
}
```

### Key Config Fields

**`reviewers`** — L1 reviewer agents. Use different providers and models for heterogeneous coverage.

**`supporters.pool`** — L2 agents that validate issues during discussion.

**`supporters.devilsAdvocate`** — Agent that argues against the majority to surface overlooked counterarguments.

**`supporters.personaPool`** — Markdown files describing reviewer personas (e.g., strict, pragmatic, security-focused). Assigned randomly or round-robin.

**`discussion.registrationThreshold`** — Controls which severity levels trigger a discussion round:
- `HARSHLY_CRITICAL: 1` — one reporter is enough
- `CRITICAL: 1` — one reporter with supporter agreement
- `WARNING: 2` — requires at least two reporters
- `SUGGESTION: null` — skips discussion, goes to `suggestions.md`

**`errorHandling.forfeitThreshold`** — If this fraction of reviewers fail, the pipeline aborts. Default `0.7` means the pipeline continues as long as 30% of reviewers succeed.

### `.reviewignore`

Place a `.reviewignore` file in your project root to exclude files from review. Uses the same glob syntax as `.gitignore`:

```
# Ignore generated files
dist/**
*.min.js
coverage/**

# Ignore test fixtures
tests/fixtures/**
```

---

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Colored severity summary, top issues, and final decision (default) |
| `json` | Full `PipelineResult` object — useful for scripting and CI |
| `md` | Markdown table with severity counts |
| `github` | GitHub-flavored markdown with emoji severity badges |

---

## GitHub Actions

CodeAgora can automatically review every PR with inline comments and a commit status check.

### Setup

1. Add a config to your repo:
   ```bash
   npx codeagora init
   ```

2. Set API key(s) as repository secrets (Settings → Secrets):
   ```
   GROQ_API_KEY=your_key_here
   ```

3. Create `.github/workflows/review.yml`:
   ```yaml
   name: CodeAgora Review
   on:
     pull_request:
       types: [opened, synchronize, reopened]

   permissions:
     contents: read
     pull-requests: write
     statuses: write

   jobs:
     review:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with:
             fetch-depth: 0
         - uses: justn-hyeok/CodeAgora@main
           with:
             github-token: ${{ secrets.GITHUB_TOKEN }}
           env:
             GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
   ```

That's it. Every PR will get:
- Inline review comments on the changed lines
- A summary comment with verdict and issue table
- A commit status check (pass/fail) that can block merge

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | GitHub token for posting reviews | (required) |
| `config-path` | Path to `.ca/config.json` | `.ca/config.json` |
| `fail-on-reject` | Exit 1 on REJECT (blocks merge as required check) | `true` |
| `max-diff-lines` | Skip review if diff exceeds this (0 = unlimited) | `5000` |

### Action Outputs

| Output | Description |
|--------|-------------|
| `verdict` | `ACCEPT`, `REJECT`, or `NEEDS_HUMAN` |
| `review-url` | URL of the posted GitHub review |
| `session-id` | CodeAgora session ID |

### Skip Review

Add the `review:skip` label to a PR to bypass the review.

### CLI Alternative

You can also review a PR directly from the command line:

```bash
# Fetch diff from GitHub and review locally
agora review --pr 123

# Review and post results back to the PR
agora review --pr https://github.com/owner/repo/pull/123 --post-review
```

Requires `GITHUB_TOKEN` in your environment.

---

## Session Storage

Every review run is saved under `.ca/sessions/`:

```
.ca/
├── config.json
└── sessions/
    └── 2026-03-16/
        └── 001/
            ├── reviews/           # Raw L1 reviewer outputs
            │   ├── r1-llama.md
            │   └── r2-llama.md
            ├── discussions/       # L2 debate transcripts
            │   └── d001-sql-injection/
            │       ├── round-1.md
            │       ├── round-2.md
            │       └── verdict.md
            ├── unconfirmed/       # Issues below threshold
            ├── suggestions.md     # Low-severity suggestions
            ├── report.md          # Moderator final report
            └── result.md          # Head agent final verdict
```

Use `agora sessions list` and `agora sessions show` to browse past sessions without re-running reviews.

---

## Architecture

### 3-Layer Pipeline

```
┌─────────────────────────────────────────────────┐
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

### Project Structure

```
src/
├── cli/           # CLI commands, formatters, options, error utilities
├── tui/           # Interactive terminal UI (ink + React)
├── pipeline/      # Pipeline orchestrator, progress emitter
├── l0/            # Model registry, quality tracking (Thompson Sampling)
├── l1/            # Parallel reviewer execution, provider registry
├── l2/            # Discussion moderator, deduplication, threshold logic
├── l3/            # Head verdict, issue grouping
├── config/        # Config loading, validation, templates, migration
├── providers/     # Provider registry, env var mapping
├── session/       # Session management and storage
├── github/        # GitHub Actions, PR review posting, diff-to-position mapping
├── plugins/       # Plugin system
├── types/         # Shared TypeScript type definitions
├── utils/         # Shared utilities
└── tests/         # 80 test files, 1300 tests
```

---

## Development

```bash
cd src

# Run all tests
pnpm test

# Run a specific test file
pnpm test -- l1-reviewer

# Type check
pnpm typecheck

# Build
pnpm build

# Run CLI directly (no build needed)
pnpm cli review path/to/diff.patch
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (strict) |
| CLI framework | commander |
| TUI | ink + React |
| LLM SDK | Vercel AI SDK (multi-provider) |
| Validation | zod |
| Config | yaml / json |
| Testing | vitest (1300 tests across 80 files) |
| Build | tsup |
| Prompts / wizards | @clack/prompts |
| Spinner / colors | ora, picocolors |
| GitHub API | @octokit/rest |

---

## Research Background

CodeAgora's debate architecture is grounded in multi-agent reasoning research:

- **Debate or Vote** (Du et al., 2023): Multi-agent debate improves factuality and reasoning quality over single-model responses.
- **Free-MAD** (Chen et al., 2024): Anti-conformity prompts prevent groupthink and preserve minority positions backed by strong evidence.
- **Heterogeneous Ensembles**: Different models have different error profiles — running them together improves coverage and reduces correlated false positives.

---

## License

MIT
