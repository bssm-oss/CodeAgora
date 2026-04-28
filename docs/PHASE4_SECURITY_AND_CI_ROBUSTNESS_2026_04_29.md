<!-- Parent: AGENTS.md -->

# Phase 4 Security And CI Robustness: 2026-04-29

## Scope

Phase 4 covers #483, #480, and #470 without reviving retired web, TUI, or notification surfaces.

## #483 Prompt Injection Defense

LLM-to-LLM handoffs now treat upstream model output as untrusted data:

- L1 reviewer evidence embedded into L2 supporter prompts is wrapped in `<UNTRUSTED_*>` blocks.
- L2 supporter responses embedded into moderator forced-decision prompts are wrapped.
- Moderator reasoning and supporter excerpts embedded into L3 head prompts are wrapped.
- Prompt instructions explicitly say untrusted blocks are data, not instructions.
- Forged closing delimiters inside upstream text are neutralized before embedding.

The adversarial test suite covers role override, system/developer-message spoofing, JSON breakout, output-format manipulation, hidden-prompt requests, premature ACCEPT, and forged delimiter payloads.

## #480 GitHub PR Robustness

The PR diff fetcher now records PR freshness metadata in addition to branch names:

- `baseSha`
- `headSha`
- `baseRepoFullName`
- `headRepoFullName`
- `isFork`

This gives CLI, MCP, GitHub Actions, and Desktop callers enough metadata to distinguish fork PRs from same-repository PRs and to detect whether a later post target still matches the fetched head SHA after rebase or force-push events.

Manual QA playbook:

1. Open a fork PR and confirm fetched metadata has `isFork: true`.
2. Rebase or force-push the PR branch and fetch again.
3. Confirm `headSha` changes while `prNumber` remains stable.
4. Post review only against the latest fetched `headSha`.
5. Re-run the action and confirm existing review deduplication still prevents duplicate stale comments.

## #470 Large Diff Truncation

Diff chunking now records observability metadata:

- `priorityFiles`: files with security-sensitive path or hunk content.
- `oversizedHunks`: hunks that exceed token budget and must be retained best-effort.
- `tokenBudgetDecisions`: human-readable decisions about splitting, grouping, and retained oversize hunks.

Security-sensitive files are ordered first before chunk grouping, so auth/session/token/SQL/sandbox changes are retained early in large review batches. Dry-run output surfaces priority-file and oversized-hunk counts plus token budget decisions.

## Verification

Required targeted checks:

- `pnpm exec vitest run packages/core/src/tests/prompt-injection-boundaries.test.ts packages/core/src/tests/pipeline-chunker.test.ts packages/github/src/tests/pr-diff.test.ts`
- `pnpm typecheck`
- `pnpm build:action`
