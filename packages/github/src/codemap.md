# packages/github/src/

## Responsibility

Core implementation for GitHub PR parsing, diff mapping, review posting, deduplication, dry-run previews, SARIF generation, and action entry logic.

## Design Patterns

Pure parser/mapper modules are separated from side-effectful posting; comment bodies and SARIF records are derived from normalized review findings.

## Data & Control Flow

PR/diff data is fetched or loaded, unified diffs are parsed into hunks/positions, findings are mapped and deduped, then posted as review comments or emitted as SARIF.

## Integration Points

Uses `@octokit/rest` for GitHub API calls and `@codeagora/core`/`@codeagora/shared` types for review, diff, and config data.
