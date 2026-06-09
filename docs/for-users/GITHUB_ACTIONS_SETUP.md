# GitHub Actions Setup Guide

This guide shows the recommended ways to run CodeAgora on pull requests.

Use this when you want PR inline comments, a summary verdict, and a commit status check from the `bssm-oss/CodeAgora` GitHub Action.

## Quick start: OpenRouter

This is the recommended PR setup. Add `OPENROUTER_API_KEY` as a repository secret before enabling the workflow.

### 1. Add `.ca/config.json`

```json
{
  "mode": "pragmatic",
  "language": "en",
  "reviewers": [
    { "id": "r-mimo", "model": "xiaomi/mimo-v2.5", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180, "persona": "builtin:general" },
    { "id": "r-gemini-flash-lite", "model": "google/gemini-3.1-flash-lite", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180, "persona": "builtin:logic" },
    { "id": "r-hy3", "model": "tencent/hy3-preview", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180, "persona": "builtin:api-contract" },
    { "id": "r-deepseek-flash", "model": "deepseek/deepseek-v4-flash", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180, "persona": "builtin:security" },
    { "id": "r-llama-scout", "model": "meta-llama/llama-4-scout", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180, "persona": "builtin:general" }
  ],
  "supporters": {
    "pool": [
      { "id": "s-glm", "model": "z-ai/glm-5.1", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
      { "id": "s-minimax", "model": "minimax/minimax-m3", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 }
    ],
    "pickCount": 2,
    "pickStrategy": "random",
    "devilsAdvocate": {
      "id": "da-grok",
      "model": "x-ai/grok-4.3",
      "backend": "api",
      "provider": "openrouter",
      "enabled": true,
      "timeout": 180
    },
    "personaPool": ["builtin:security", "builtin:logic", "builtin:api-contract", "builtin:general"],
    "personaAssignment": "random"
  },
  "moderator": { "model": "openai/gpt-5.3-codex", "backend": "api", "provider": "openrouter", "timeout": 180 },
  "discussion": {
    "maxRounds": 2,
    "registrationThreshold": {
      "HARSHLY_CRITICAL": 1,
      "CRITICAL": 1,
      "WARNING": 2,
      "SUGGESTION": null
    },
    "codeSnippetRange": 10
  },
  "head": {
    "backend": "api",
    "model": "qwen/qwen3.7-max",
    "provider": "openrouter",
    "enabled": true,
    "timeout": 180
  },
  "errorHandling": { "maxRetries": 1, "forfeitThreshold": 0.7 }
}
```

The default PR setup uses five independent reviewers, two supporters, a dedicated devil's advocate, a moderator, and a head model. For larger PRs, keep `max-diff-lines` conservative or split the change.

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
        uses: bssm-oss/CodeAgora@v0.1.0-rc.6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-on-reject: 'true'
          max-diff-lines: '5000'
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
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
| OpenRouter | `OPENROUTER_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenCode Go / Zen | `OPENCODE_API_KEY` |

See [Providers](./PROVIDERS.md) for the full provider list.

### 2. Use matching provider config

Example with the recommended OpenRouter quality lineup:

```json
{
  "mode": "pragmatic",
  "language": "en",
  "reviewers": [
    { "id": "r-mimo", "model": "xiaomi/mimo-v2.5", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-gemini-flash-lite", "model": "google/gemini-3.1-flash-lite", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-hy3", "model": "tencent/hy3-preview", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-deepseek-flash", "model": "deepseek/deepseek-v4-flash", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-llama-scout", "model": "meta-llama/llama-4-scout", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 }
  ],
  "supporters": {
    "pool": [
      { "id": "s-glm", "model": "z-ai/glm-5.1", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
      { "id": "s-minimax", "model": "minimax/minimax-m3", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 }
    ],
    "pickCount": 2,
    "pickStrategy": "random",
    "devilsAdvocate": { "id": "da-grok", "model": "x-ai/grok-4.3", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    "personaPool": ["builtin:security", "builtin:logic", "builtin:api-contract", "builtin:general"],
    "personaAssignment": "random"
  },
  "moderator": { "model": "openai/gpt-5.3-codex", "backend": "api", "provider": "openrouter", "timeout": 180 },
  "discussion": { "maxRounds": 2, "codeSnippetRange": 10 },
  "head": { "backend": "api", "model": "qwen/qwen3.7-max", "provider": "openrouter", "enabled": true, "timeout": 180 },
  "errorHandling": { "maxRetries": 1, "forfeitThreshold": 0.7 }
}
```

### 3. Pass the secret to the Action

```yaml
- name: CodeAgora Review
  uses: bssm-oss/CodeAgora@v0.1.0-rc.6
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-reject: 'true'
    max-diff-lines: '2500'
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

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

`issues: write` is optional for workflows that manage labels themselves. CodeAgora does not mutate the `review:skip` label.

## Fork PRs

Repository secrets are not available to untrusted fork PRs. For public repos, prefer one of these patterns:

- skip CodeAgora for fork PRs and let maintainers run it after review
- require maintainer approval before running workflows from forks
- run CodeAgora only after a maintainer-triggered workflow has access to retained provider secrets

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

## Choosing `max-diff-lines`

Use a smaller limit for smaller context windows:

| Setup | Suggested `max-diff-lines` |
|---|---:|
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
| `degraded-reason` | Stable reason code such as `diff-too-large`, `missing-provider-secrets`, or `config-load-failed`; the Action logs and job summary show the matching remediation hint |
| `head-sha` | PR head SHA reviewed by CodeAgora |
| `base-sha` | PR base SHA used for diff acquisition |

## Troubleshooting checklist

1. **Config not found**: commit `.ca/config.json`, set `config-path`, and rerun after the file is valid.
2. **Missing provider secret**: add the matching secret and pass it through `env:`.
3. **Provider fails**: verify the API key, model name, provider quota, and context size.
4. **Fork PR skipped**: expected when secrets are unavailable to forked PRs; rerun from a trusted branch if needed.
5. **Diff too large**: split the PR or raise `max-diff-lines` only if your provider can handle it.
6. **Action blocks merge**: set `fail-on-reject: 'false'` if you want review results without a required failure gate.

For more details, see the [GitHub integration spec](./5_GITHUB_INTEGRATION.md) and [Troubleshooting](./TROUBLESHOOTING.md).
