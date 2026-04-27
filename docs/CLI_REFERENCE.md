# CLI Reference

## `agora review [diff-path]`

Run the full review pipeline on a diff file or stdin.

```bash
agora review changes.diff                    # Review a diff file
git diff HEAD~1 | agora review              # Pipe from git
git diff main...feature | agora review      # Commit range
agora review --pr 123                        # Review a GitHub PR
agora review --staged                        # Review staged changes
agora review --quick                         # L1 only (fast)
agora review --output json                   # JSON for CI
agora review --json-stream                   # Stream NDJSON
agora review --post-review --pr 123          # Post back to PR
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--output <format>` | `text`, `json`, `md`, `github`, `annotated`, `html`, `junit`, `sarif` | `text` |
| `--provider <name>` | Override provider for all reviewers | — |
| `--model <name>` | Override model for all reviewers | — |
| `--reviewers <value>` | Number of reviewers or comma-separated IDs | — |
| `--timeout <seconds>` | Pipeline-level timeout | — |
| `--reviewer-timeout <seconds>` | Per-reviewer timeout | — |
| `--no-discussion` | Skip L2 discussion phase | — |
| `--quick` | L1 only, skip discussion and verdict | — |
| `--staged` | Review staged git changes | — |
| `--context-lines <n>` | Surrounding code context (0 = disabled) | `20` |
| `--json-stream` | Stream NDJSON events | — |
| `--no-cache` | Skip result caching | — |
| `--pr <url-or-number>` | GitHub PR URL or number | — |
| `--post-review` | Post comments back to PR (requires `--pr`) | — |
| `--dry-run` | Validate config only | — |
| `--quiet` | Suppress progress output | — |
| `--verbose` | Show detailed info | — |

**Exit codes:** `0` = command completed and no failure gate tripped, `1` = `--fail-on-reject` or `--fail-on-severity` tripped, `2` = setup/input/config error, `3` = runtime or pipeline failure.

`--output json` and `--json-stream` use the stable agent contract documented in [Agent Contract](AGENT_CONTRACT.md). JSON objects include `schemaVersion: "codeagora.review.v1"`.

## `agora init`

Initialize CodeAgora in the current project.

```bash
agora init                  # Interactive wizard
agora init -y               # Non-interactive defaults
agora init --format yaml    # YAML config
agora init --ci             # Also create GitHub Actions workflow
agora init --force          # Overwrite existing
```

## `agora doctor`

Health check — Node.js version, config validity, API keys.

```bash
agora doctor          # Basic checks
agora doctor --live   # Test actual API connections
```

## `agora providers`

List all supported providers with tier, API key status, and model counts.

## `agora sessions`

```bash
agora sessions list                          # List recent
agora sessions list --json                   # List recent as JSON
agora sessions list --status completed       # Filter by status
agora sessions list --search "null"          # Search by keyword
agora sessions show 2026-03-13/001           # Show details
agora sessions show 2026-03-13/001 --json    # Show details as JSON
agora sessions diff 001 002                  # Compare two
agora sessions stats                         # Aggregate stats
agora sessions prune --days 30               # Delete old
```

`sessions list --json` and `sessions show --json` include `schemaVersion: "codeagora.review.v1"` so desktop and agent callers can branch on a stable contract marker.

## `agora models`

Model leaderboard — Thompson Sampling scores, win rates, health status.

## `agora explain <session>`

Narrative explanation of a past review session.

## `agora agreement <session>`

Reviewer agreement matrix — cross-reviewer agreement percentages.

## `agora replay <session>`

Re-render a past session's results locally (no LLM calls).

## `agora costs`

```bash
agora costs                  # All-time summary
agora costs --last 10        # Last 10 sessions
agora costs --by reviewer    # By reviewer model
agora costs --by provider    # By provider
```

## Other Commands

| Command | Description |
|---------|-------------|
| `agora config` | Display loaded config |
| `agora config-set <key> <value>` | Set config value (dot notation) |
| `agora config-edit` | Open config in `$EDITOR` |
| `agora language [en\|ko]` | Get/set language |
| `agora status` | Status overview |
| `agora providers-test` | Verify API key status |
| `agora learn list` | List learned patterns |
| `agora learn stats` | Learning statistics |

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Colored summary with severity counts (default) |
| `json` | Full `PipelineResult` object |
| `md` | Markdown table |
| `github` | GitHub-flavored markdown with emoji badges |
| `annotated` | Inline annotations on diff |
| `html` | HTML report |
| `junit` | JUnit XML for CI |
| `sarif` | SARIF JSON for code scanning |
