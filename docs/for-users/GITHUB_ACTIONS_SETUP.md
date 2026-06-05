# GitHub Actions Setup Guide

This guide shows the recommended ways to run CodeAgora on pull requests.

Use this when you want PR inline comments, a summary verdict, and a commit status check from the `bssm-oss/CodeAgora` GitHub Action.

## Quick start: GitHub Models only

This is the lowest-friction setup for same-repository PRs. It uses the workflow `GITHUB_TOKEN` and does not require external provider secrets.

### 1. Add `.ca/config.json`

```json
{
  "mode": "pragmatic",
  "language": "en",
  "reviewers": [
    {
      "id": "r1",
      "model": "gpt-4o-mini",
      "backend": "api",
      "provider": "github-models",
      "enabled": true,
      "timeout": 120
    }
  ],
  "supporters": {
    "pool": [
      {
        "id": "s1",
        "model": "gpt-4o-mini",
        "backend": "api",
        "provider": "github-models",
        "enabled": true,
        "timeout": 120
      }
    ],
    "pickCount": 1,
    "pickStrategy": "random",
    "devilsAdvocate": {
      "id": "da",
      "model": "gpt-4o-mini",
      "backend": "api",
      "provider": "github-models",
      "enabled": true,
      "timeout": 120
    },
    "personaPool": ["builtin:security", "builtin:logic", "builtin:api-contract", "builtin:general"],
    "personaAssignment": "random"
  },
  "moderator": { "model": "gpt-4o-mini", "backend": "api", "provider": "github-models" },
  "discussion": {
    "maxRounds": 1,
    "registrationThreshold": {
      "HARSHLY_CRITICAL": 1,
      "CRITICAL": 1,
      "WARNING": 2,
      "SUGGESTION": null
    },
    "codeSnippetRange": 5
  },
  "head": {
    "backend": "api",
    "model": "gpt-4o-mini",
    "provider": "github-models",
    "enabled": true
  },
  "errorHandling": { "maxRetries": 1, "forfeitThreshold": 0.7 }
}
```

The compact one-reviewer setup is intentional for GitHub Models because some models have small request limits. For larger PRs, keep `max-diff-lines` conservative or use an external provider with a larger context window.

### 2. Add `.github/workflows/codeagora-review.yml`

```yaml
name: CodeAgora Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  statuses: write
  models: read

jobs:
  review:
    if: >-
      github.event.pull_request.draft == false &&
      !contains(github.event.pull_request.labels.*.name, 'review:skip')
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: CodeAgora Review
        uses: bssm-oss/CodeAgora@v0.1.0-rc.5
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-on-reject: 'true'
          max-diff-lines: '250'
```

### 3. Open or update a PR

The Action posts:

- inline comments for confirmed findings
- a summary review with the final verdict
- a commit status check

Add a `review:skip` label to skip CodeAgora for a PR.

## External provider setup

Use this when you need a larger context window, higher throughput, or provider-specific models.

### 1. Add provider secrets

In the target repository, open **Settings > Secrets and variables > Actions > New repository secret**.

Common secrets:

| Provider | Secret |
|---|---|
| Groq | `GROQ_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GOOGLE_API_KEY` |

See [Providers](./PROVIDERS.md) for the full provider list.

### 2. Use matching provider config

Example with Groq:

```json
{
  "mode": "pragmatic",
  "language": "en",
  "reviewers": [
    { "id": "r1", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 },
    { "id": "r2", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 }
  ],
  "supporters": {
    "pool": [
      { "id": "s1", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 }
    ],
    "pickCount": 1,
    "pickStrategy": "random",
    "devilsAdvocate": { "id": "da", "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq", "enabled": true, "timeout": 120 },
    "personaPool": ["builtin:security", "builtin:logic", "builtin:api-contract", "builtin:general"],
    "personaAssignment": "random"
  },
  "moderator": { "model": "llama-3.3-70b-versatile", "backend": "api", "provider": "groq" },
  "discussion": { "maxRounds": 1, "codeSnippetRange": 5 },
  "head": { "backend": "api", "model": "llama-3.3-70b-versatile", "provider": "groq", "enabled": true },
  "errorHandling": { "maxRetries": 1, "forfeitThreshold": 0.7 }
}
```

### 3. Pass the secret to the Action

```yaml
- name: CodeAgora Review
  uses: bssm-oss/CodeAgora@v0.1.0-rc.5
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-reject: 'true'
    max-diff-lines: '2500'
  env:
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
```

## Claude Code / Codex companion workflows

CodeAgora already supports CLI reviewers such as Claude Code and Codex through concrete CLI backend values like `backend: "claude"` or `backend: "codex"`, but the GitHub Action does not install or authenticate those CLIs. In GitHub Actions, choose one of these patterns:

1. **CodeAgora Action with API/GitHub Models reviewers** — recommended default for rc.6.
2. **CodeAgora Action with CLI reviewers** — install and authenticate the configured CLI backend on the runner before running CodeAgora. If your moderator/supporters still use API providers, keep the matching provider secrets configured too.
3. **Companion agent workflow** — run Claude Code or Codex as a separate GitHub Action alongside CodeAgora.

For Claude Code OAuth, use the official Claude Code Action. Generate the token locally with `claude setup-token`, save it as `CLAUDE_CODE_OAUTH_TOKEN`, then reference it from the workflow:

```yaml
name: Claude Companion Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  claude-review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1

      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}

            Review this PR for correctness, security, API contract issues,
            and maintainability risks. Keep findings concise.
          claude_args: |
            --allowedTools "Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh pr comment:*)"
```

This is separate from CodeAgora's reviewer config. CodeAgora still owns its consensus verdict, session artifacts, and stable Action outputs; Claude Code or Codex can provide an additional agentic review/commenting lane.

Fork PRs cannot read repository secrets such as `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`. Keep the same fork guard pattern used for CodeAgora before running companion agent workflows.

## Action inputs

| Input | Default | Description |
|---|---:|---|
| `github-token` | required | Token used to fetch the PR diff, post review comments, and set commit status. Usually `${{ secrets.GITHUB_TOKEN }}`. |
| `config-path` | `.ca/config.json` | Path to the CodeAgora config relative to the repository root. |
| `fail-on-reject` | `true` | When `true`, the Action exits non-zero if the final verdict is `REJECT`. |
| `max-diff-lines` | `5000` | Skips the review when the PR diff exceeds this many lines. Use `0` for unlimited. |
| `post-results` | `true` | When `false`, runs without posting PR comments/status. |

## Required permissions

Use these permissions for normal PR review posting:

```yaml
permissions:
  contents: read
  pull-requests: write
  statuses: write
```

Add this when using `provider: "github-models"`:

```yaml
  models: read
```

`issues: write` is optional for workflows that manage labels themselves. CodeAgora does not mutate the `review:skip` label.

## Fork PRs

Repository secrets are not available to untrusted fork PRs. For public repos, prefer one of these patterns:

- skip CodeAgora for fork PRs and let maintainers run it after review
- require maintainer approval before running workflows from forks
- use GitHub Models with only the workflow token if your repository policy allows it

Example fork guard:

```yaml
- name: Check fork PR secrets
  id: fork-check
  if: github.event.pull_request.head.repo.full_name != github.repository
  run: |
    echo "::warning::Fork PR detected — secrets are unavailable. Skipping review."
    echo "skip=true" >> "$GITHUB_OUTPUT"
```

Then add this condition to later steps:

```yaml
if: steps.fork-check.outputs.skip != 'true'
```

When CodeAgora itself reports a degraded/skipped run, use the `degraded-reason` output and the logs together:

- `missing-github-token`: pass `github-token` or disable posting
- `missing-provider-secrets`: add the provider secret or switch to GitHub Models
- `fork-missing-provider-secrets`: use a same-repository PR or a fork gate
- `posting-disabled`: set `post-results: 'true'`
- `diff-too-large`: lower the PR size, raise `max-diff-lines`, or split the PR
- `config-load-failed`: fix `.ca/config.json` or `config-path`
- `stale-head-sha`: rerun on the updated commit SHA
- `github-post-failed`: check permissions/token scopes and rerun
- `sarif-write-failed`: use a writable SARIF path or export SARIF elsewhere

## Choosing `max-diff-lines`

Use a smaller limit for smaller context windows:

| Setup | Suggested `max-diff-lines` |
|---|---:|
| GitHub Models `gpt-4o-mini` | `250`–`800` |
| Groq / OpenRouter compact config | `1000`–`2500` |
| Larger-context provider models | start with `2500`, then tune upward |

If you see provider errors like “request body too large” or context-limit failures, reduce `max-diff-lines`, reduce reviewer count, reduce `discussion.maxRounds`, or split the PR.

## Outputs

The Action exposes these outputs for downstream workflow steps:

| Output | Meaning |
|---|---|
| `verdict` | `ACCEPT`, `REJECT`, `NEEDS_HUMAN`, or `SKIPPED` |
| `review-url` | URL of the posted GitHub review when available |
| `session-id` | CodeAgora session ID for audit/debugging |
| `degraded` | `true` when the run was degraded or skipped |
| `degraded-reason` | Stable reason code such as `diff-too-large`, `missing-provider-secrets`, or `config-load-failed` |
| `head-sha` | PR head SHA reviewed by CodeAgora |
| `base-sha` | PR base SHA used for diff acquisition |

## Troubleshooting checklist

1. **Config not found**: commit `.ca/config.json` or set `config-path`.
2. **Missing provider secret**: add the matching secret and pass it through `env:`.
3. **GitHub Models fails**: make sure `permissions.models: read` is set and keep the diff/config small.
4. **Fork PR skipped**: expected when secrets are unavailable to forked PRs.
5. **Diff too large**: split the PR or raise `max-diff-lines` only if your provider can handle it.
6. **Action blocks merge**: set `fail-on-reject: 'false'` if you want review results without a required failure gate.

For more details, see the [GitHub integration spec](./5_GITHUB_INTEGRATION.md) and [Troubleshooting](./TROUBLESHOOTING.md).
