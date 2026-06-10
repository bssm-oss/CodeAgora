# Demo Runbook

This page is the shortest path to a strong live demo of CodeAgora across the CLI, MCP, Desktop app, and GitHub Action.

Use `examples/vulnerable-api/` as the demo target. It already contains obvious review material, so the output is easy to explain without inventing a synthetic bug set on the spot.

## Recommended demo stack

Use one OpenRouter key when you want the smoothest setup path. The models below are intentionally high-end so the demo feels like the real product, not a toy.

The demo config keeps the moderator on `openai/gpt-5.3-codex` and the devil's advocate on `x-ai/grok-4.3`.

## Model presets

Pick one based on the room and how much time you want to spend on token cost.

| Preset | Suggested models | When to use |
|---|---|---|
| Premium | `openai/gpt-5.3-codex`, `anthropic/claude-sonnet-4.6`, `deepseek/deepseek-v4-flash`, `qwen/qwen3.7-max`, `x-ai/grok-4.3` | Live demo where quality matters more than cost |
| Balanced | `openai/gpt-5.3-codex`, `anthropic/claude-sonnet-4.5`, `qwen/qwen3-coder-flash`, `qwen/qwen3-next-80b-a3b-instruct`, `x-ai/grok-4.3` | Demo with better latency and lower spend |
| Efficient | `qwen/qwen3-coder-flash`, `qwen/qwen3-next-80b-a3b-instruct`, `x-ai/grok-4.3` | Internal walkthrough or repeated practice runs |

### Demo config

Save this as `.ca/config.json` in the demo workspace:

```json
{
  "mode": "pragmatic",
  "language": "ko",
  "reviewers": [
    {
      "id": "r-gpt5",
      "model": "openai/gpt-5.3-codex",
      "backend": "api",
      "provider": "openrouter",
      "enabled": true,
      "timeout": 180,
      "persona": "builtin:logic"
    },
    {
      "id": "r-sonnet",
      "model": "anthropic/claude-sonnet-4.6",
      "backend": "api",
      "provider": "openrouter",
      "enabled": true,
      "timeout": 180,
      "persona": "builtin:security"
    },
    {
      "id": "r-deepseek",
      "model": "deepseek/deepseek-v4-flash",
      "backend": "api",
      "provider": "openrouter",
      "enabled": true,
      "timeout": 180,
      "persona": "builtin:api-contract"
    }
  ],
  "supporters": {
    "pool": [
      {
        "id": "s-glm",
        "model": "z-ai/glm-5.1",
        "backend": "api",
        "provider": "openrouter",
        "enabled": true,
        "timeout": 180
      },
      {
        "id": "s-minimax",
        "model": "minimax/minimax-m3",
        "backend": "api",
        "provider": "openrouter",
        "enabled": true,
        "timeout": 180
      }
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
    "personaPool": [
      "builtin:security",
      "builtin:logic",
      "builtin:api-contract",
      "builtin:general"
    ],
    "personaAssignment": "random"
  },
  "moderator": {
    "model": "openai/gpt-5.3-codex",
    "backend": "api",
    "provider": "openrouter",
    "timeout": 180
  },
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
  "errorHandling": {
    "maxRetries": 1,
    "forfeitThreshold": 0.7
  }
}
```

If you need a faster live run, keep the same config shape and drop to 3 reviewers.

## CLI demo

Use these commands in `examples/vulnerable-api/` or another small repo with staged changes:

```bash
agora doctor --live
agora review --staged --output json
agora review --staged --json-stream
agora review --dry-run --staged
agora explain 2026-04-27/001
```

What to point out:

- `--dry-run` shows readiness before you spend provider calls.
- `--json-stream` proves the pipeline is incremental and machine-readable.
- `agora explain` replays a previous session without re-running the review.

## MCP demo

The MCP server gives you the same pipeline through tools instead of a shell command.

Client config:

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp@rc"]
    }
  }
}
```

Demo calls:

```json
{ "name": "dry_run", "arguments": { "staged": true } }
```

```json
{ "name": "review_full", "arguments": { "staged": true, "output_format": "json" } }
```

```json
{ "name": "config_get", "arguments": { "key": "discussion.maxRounds" } }
```

```json
{ "name": "get_leaderboard", "arguments": {} }
```

What to point out:

- `dry_run` is the preflight gate.
- `review_full` returns the same stable machine contract as the CLI.
- `config_get` and `get_leaderboard` show that MCP is not a shell wrapper.

## Desktop app demo

Use the Tauri app when you want the operator UX, session browsing, and setup visibility.

Suggested flow:

1. Open the app.
2. Select the demo repo with `리뷰 실행`.
3. Show `빠른 리뷰` and the readiness banner.
4. Show `세션` and open one past result.
5. Show `셋업` and the live provider / GitHub Action / evidence cards.

What to point out:

- The app uses the same session and config contracts as the CLI.
- The shell now shows the real logo and the Korean-first UI.
- The readiness panel explains why review is blocked before you click anything expensive.

## GitHub Action demo

Use the same config file in the repo and the current RC action ref:

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

What to point out:

- It posts inline comments, a verdict summary, and a status check.
- One OpenRouter key is enough for the demo stack above.
- For fork PRs, keep the guardrail that skips secret-backed execution.

## Recommended talk track

- "This is one review contract across four surfaces."
- "The same config drives CLI, MCP, Desktop, and GitHub Action."
- "The app is not a separate product; it is the operator view onto the same session artifacts."
- "Preflight prevents us from spending model calls when the workspace is not ready."
