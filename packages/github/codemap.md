# packages/github/

## Responsibility

GitHub integration root: PR diff ingestion, finding-to-review mapping, comment/status posting, SARIF generation, and GitHub Actions execution.

## Design Patterns

Mostly pure transformation modules around diffs/findings, with a small action/posting layer that owns Octokit calls and side effects.

## Data & Control Flow

Diffs enter via PR/session loaders → parser/indexer builds line/position maps → mapper/dedup/comment/SARIF modules convert findings to GitHub payloads → poster/action submit them.

## Integration Points

Consumed by the CLI for PR review flows and by GitHub Actions; depends on `@octokit/rest`, filesystem/path helpers, and shared pipeline/result types.
