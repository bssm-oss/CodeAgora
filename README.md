<p align="center">
  <img src="assets/logo.svg" width="120" alt="CodeAgora Logo">
</p>

<h1 align="center">CodeAgora</h1>
<p align="center"><strong>Where LLMs debate your code.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@codeagora/review"><img src="https://img.shields.io/npm/v/@codeagora/review?color=%2305A6B9" alt="Version"></a>
  <img src="https://img.shields.io/badge/tests-vitest-%23191A51" alt="Tests">
  <img src="https://img.shields.io/badge/node-%3E%3D20-%2305A6B9" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-%23191A51" alt="License">
</p>

CodeAgora runs multiple LLM reviewers in parallel, lets them challenge each other, and returns a final review verdict with evidence.

## Quick Start

```bash
npm i -g @codeagora/review@rc
agora init
git diff | agora review
```

Current release: `0.1.0-rc.6`.

## Why CodeAgora

- parallel reviewers catch different issues
- debate and filtering reduce noisy findings
- works from the CLI, GitHub Actions, and MCP-compatible editors

## How it works

1. pre-analysis enriches the diff
2. specialist reviewers inspect in parallel
3. hallucination and dedupe filters remove weak claims
4. discussion resolves disputes
5. a head agent returns `ACCEPT`, `REJECT`, or `NEEDS_HUMAN`

## Common ways to use it

### CLI

```bash
agora review path/to/diff.patch
```

`agora init` detects keys and tools, then writes a starter config.

### GitHub Actions

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
      - uses: bssm-oss/CodeAgora@v0.1.0-rc.6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

Use `.ca/config.json` as the default config path. See [GitHub Actions setup](docs/for-users/GITHUB_ACTIONS_SETUP.md) for fork handling, secrets, permissions, and tuning.

### MCP

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

See [`packages/mcp/README.md`](packages/mcp/README.md) for tool details.

### Desktop app

The desktop app in `packages/desktop` is an official local UI surface for setup, session browsing, review launch, result inspection, and evidence export. It uses the same CLI/core/session/config contracts as the automation surfaces.

## Docs map

| Doc | Purpose |
|---|---|
| [Docs index](docs/README.md) | Audience-based documentation map |
| [CLI reference](docs/for-users/CLI_REFERENCE.md) | Commands and options |
| [Configuration](docs/for-users/CONFIGURATION.md) | Config file guide |
| [Providers](docs/for-users/PROVIDERS.md) | Provider list and tiers |
| [Architecture](docs/for-agents/ARCHITECTURE.md) | Pipeline and system design |
| [Development notes](docs/for-agents/DEVELOPMENT.md) | Setup, checks, release/doc pointers |
| [Benchmarks](docs/for-agents/BENCHMARKS.md) | Fixture set and benchmark notes |
| [GitHub Actions setup](docs/for-users/GITHUB_ACTIONS_SETUP.md) | Full action guide |
| [Troubleshooting](docs/for-users/TROUBLESHOOTING.md) | Common errors and fixes |

## Development and benchmarks

See [Development](docs/for-agents/DEVELOPMENT.md) and [Benchmarks](docs/for-agents/BENCHMARKS.md).

## License

MIT
