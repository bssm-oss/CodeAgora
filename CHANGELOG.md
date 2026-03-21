# Changelog

## 2.0.0 (2026-03-XX)

### Breaking Changes
- **Package structure** — web/tui/mcp/notifications split into optional packages (`npm i -g @codeagora/web` etc.)
- **Provider tiers** — Tier 1 (Official), Tier 2 (Verified), Tier 3 (Experimental). Tier 3 is community/best-effort.
- **Monorepo migration** — 8 pnpm workspace packages (`@codeagora/shared`, `@codeagora/core`, `@codeagora/github`, `@codeagora/cli`, `@codeagora/web`, `@codeagora/tui`, `@codeagora/mcp`, `@codeagora/notifications`)

### Highlights
- **Security hardening** — CRITICAL 5 + HIGH 12 fixes (path traversal, SSRF, shell injection, credential storage)
- **Tests** — 1817 → 2671 (+854 tests across 169 files)
- **Architecture** — circular dependency resolution, orchestrator decomposition, type safety overhaul
- **24+ API providers** — Groq, Anthropic, OpenAI, Google, DeepSeek, OpenRouter, + 18 more
- **12 CLI backends** — Claude, Codex, Gemini, Copilot, Cursor, Aider, Goose, Cline, + 4 more
- **models.dev integration** — external model catalog (3875 models) with pricing, context windows, capability metadata
- **Environment auto-detection** — `agora init` detects API keys + CLI tools, generates dynamic presets
- **Context-aware review** — surrounding source code in prompts (configurable via `--context-lines`)
- **Review caching** — SHA-256 diff+config hash, `--no-cache` to bypass
- **HTML & JUnit output** — `--output html` for reports, `--output junit` for CI
- **MCP server** — 7 tools for Claude Code / Cursor / Windsurf integration
- **Web dashboard** — Hono.js + React SPA with real-time WebSocket progress, 8 pages
- **GitHub Actions** — inline PR comments, commit status checks, SARIF output
- **Cost analytics** — `agora costs` with per-reviewer and per-provider breakdowns
- **Model leaderboard** — Thompson Sampling scores, win rates, health monitoring
- **Learning loop** — persist dismissed patterns, auto-suppress false positives
- **Korean language support** — full i18n for CLI, prompts, and review output
- **README diet** — 808 → 135 lines, detailed docs split into docs/

### New Commands
- `agora review --pr <url>` — review GitHub PRs directly
- `agora review --staged` — review staged git changes
- `agora review --quick` — L1 only (fast mode)
- `agora review --post-review` — post results back to PR
- `agora models` — model performance leaderboard
- `agora explain <session>` — narrative session explanation
- `agora agreement <session>` — reviewer agreement matrix
- `agora replay <session>` — re-render past session
- `agora costs` — cost analytics
- `agora dashboard` — web dashboard
- `agora status` — status overview
- `agora config-set` / `agora config-edit` — config management
- `agora providers-test` — verify API connections
- `agora learn` — pattern learning management

### CI/CD
- Publish smoke test in release workflow
- Weekly provider health check cron (auto-creates issues on failure)

---

## 1.1.0 (2026-03-17)

### Features
- Strict/Pragmatic review modes with tailored thresholds
- Korean language support
- Auto-approve trivial diffs
- Custom rules (`.reviewrules` YAML)
- Confidence scores (0-100 per issue)
- Learning loop + `agora learn` command

## 1.0.0 (2026-03-17)

First stable release.
- 15 API providers, 5 CLI backends
- GitHub Actions integration
- LLM-based Head verdict
- TUI with 8 screens
- Session storage and management
