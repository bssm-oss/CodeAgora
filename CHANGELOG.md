# Changelog

## 2.2.0-rc.1 (2026-04-01)

### New: Pre-Analysis Layer
- **Semantic Diff Tagging** — Classifies diff files as rename/logic/refactor/config/test/docs before sending to reviewers, reducing false positives on non-logic changes (#411)
- **TypeScript Diagnostics Injection** — Runs `tsc --noEmit` and injects real type errors into reviewer prompts, replacing guesswork with evidence (#414)
- **Change Impact Analysis** — Tracks callers/importers of changed exports, showing blast radius to reviewers (#415)
- **External AI Rule Files** — Auto-detects `.cursorrules`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.clinerules/`, `.windsurfrules` and injects into prompts (#407)
- **Path-based Review Rules** — Config-driven glob patterns apply different review notes per directory (#408)

### New: Specialist Reviewer Personas
- 4 built-in personas: `builtin:security` (OWASP), `builtin:logic` (correctness), `builtin:api-contract` (backward compat), `builtin:general` (quality) (#412)
- Auto reviewers cycle through personas for diverse perspectives
- `persona: "builtin:security"` syntax in config

### New: Suggestion Verification
- CRITICAL+ code suggestions verified via TypeScript `transpileModule` before posting (#413)
- Failed suggestions get 50% confidence penalty and ❌ badge
- Verified suggestions get ✅ badge
- Opt-out via `reviewContext.verifySuggestions: false`

### New: Triage Digest
- One-liner at top of review: `📋 Triage: N must-fix · N verify · N ignore` (#410)
- Instant developer orientation — know what to focus on before reading details

### Other
- All packages unified at version 2.2.0 (TUI exits RC, still marked experimental)
- Tests: 177 files, 2816 passing (+67 tests from v2.1.1)

---

## 2.1.1 (2026-04-01)

### Bug Fixes (12 issues)
- SUGGESTION threshold default null (#287)
- Session ID / MCP temp file race conditions (#290, #282)
- Webhook JSON.stringify crash on circular payload (#285)
- BanditStore path frozen at module load (#278)
- Cache key includes full config (#276)
- Dead executeReviewer export removed (#279)
- PipelineTelemetry wired with stage timing (#274)
- Objection prompt includes supporter reasoning (#311)
- Custom rule suggestion field (#301)
- initL0 mutex for concurrent initialization (#395)
- Custom prompt {{CONTEXT}} and {{PROJECT_CONTEXT}} placeholders (#312)

---

## 2.1.0 (2026-04-01)

### Security (7 fixes)
- **CRITICAL** — Rate limiter memory leak: `requestCounts` Map never pruned (#388)
- **CRITICAL** — X-Forwarded-For IP spoofing bypasses rate limiter (#389)
- **CRITICAL** — `readSurroundingContext` path traversal: reads files outside repo boundary (#392)
- **HIGH** — WebSocket auth token exposed in URL query string (#390)
- **HIGH** — Auth token printed to stdout at server startup (#391)
- **HIGH** — `checkFilePermissions` returns true on stat failure (fail-open) (#393)
- **HIGH** — Credentials directory created without 0o700 mode (#394)

### Pipeline Fixes (10 issues)
- Parser no longer escalates SUGGESTION/WARNING to CRITICAL for unknown file paths (#248)
- Mixed-severity groups (CRITICAL+WARNING) no longer silently downgrade to SUGGESTION (#249)
- Build artifacts (dist/, lock files, *.min.js) excluded from review scope by default (#228)
- L1 evidence content (problem, evidence, suggestion) now injected into moderator prompt (#246)
- Confidence-based verdict triage: 0% confidence criticals route to NEEDS_HUMAN, not REJECT (#229, #236)
- Auto-detect project context (monorepo, frameworks, deployment type) for reviewer prompts (#237)
- Suggestion quality requirements: ≥80% confidence for code fixes, no new deps (#233)
- Thompson Sampling: guaranteed exploration slot + posterior cap prevents single-model dominance (#232)
- Line proximity for finding dedup increased from 5 to 15 lines (#234)
- Build/deployment context detection: action.yml, Dockerfile, serverless.yml, etc. (#405)

### Build
- Core package build script: `echo skip` → `tsup` (#226)
- Action build resolver: added `@codeagora/notifications` package (#387)
- Bundled `@octokit/auth-app` into action instead of external (#404)
- CLI `failOnReject` type fix (#386)

### Pipeline Fixes (prior — merged before this session)
- L2 discussion not triggering: fuzzy line grouping for threshold registration (#230)
- Exit code reflects tool health, not review verdict (#252)
- Diff fuzzy match prevents prefix false positives, supporter prompt structured format (#253, #250, #308, #309)
- L3 head prompt includes discussion evidence and correct suggestionCount (#310, #298)
- matchRules respects .reviewignore, auth errors skip circuit breaker, Windows path fix (#300, #270, #272)
- config-set parseValue rejects malformed numbers (#360)
- 3 CLI input validation bugs resolved (#296, #271, #265)
- MCP tools error handling and reviewerCount passthrough (#264, #262)
- 5 root cause pipeline bugs (#238, #240, #242, #243, #308)

### Security (prior)
- 13 security vulnerabilities resolved (#239, #241, #244, #247, #260, #266, #267, #289, #294, #295, #355, #356, #357)
- Host-header auth bypass removed, IPv6 SSRF blocking hardened
- Timing-safe token comparison deduplicated

### GitHub Integration (prior)
- Mapper, parser, and SARIF bugs resolved (#258, #268, #284, #288, #281, #354)
- GitHub Action config and workflow bugs (#255, #256, #257, #259, #261, #269)
- GitHub poster and dedup bugs (#361, #254, #263, #251, #280)

### Other
- TUI marked as **(experimental)** — CLI + GitHub Action are the recommended flows
- Tests: 2702 → 2749 (174 files)
- `reviewContext` config field for user-defined deployment type, notes, and bundled outputs
- Custom reviewer prompt via config (#203, #225)
- Unified presets + Head/Settings tabs in TUI (#224)
- Web dashboard: 404 route, LiveDiscussion severity fix, SupportersTab null guards
- i18n: migrated hardcoded CLI error messages to t() calls (#362)

### Contributors

- **[@HuiNeng6](https://github.com/HuiNeng6)** — pipeline fixes, TUI bug fixes, web dashboard improvements (#342, #343, #344, #353, #364, #365, #366, #367, #368, #369)
- **[@dagangtj](https://github.com/dagangtj)** — i18n migration (#362)
- **[@justn-hyeok](https://github.com/justn-hyeok)** — security hardening, pipeline overhaul, architecture improvements

---

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
