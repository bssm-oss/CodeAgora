# Changelog

## 0.1.0-beta.2 (2026-05-11)

### Beta Release Preparation
- Promoted workspace package metadata and beta Action examples from `0.1.0-beta.1` to `0.1.0-beta.2`.
- Keep CLI, GitHub Action, and MCP as the supported beta surfaces; desktop remains a private-preview evidence surface outside stable public support.

### Runtime And Release Surface
- Includes the post-beta.1 runtime option, timeout, reviewer selection, and full-evidence output fixes.
- Carries forward the refreshed GitHub Action bundle, beta smoke, package smoke, release evidence, and manifest guardrail improvements.

### RC Readiness
- Documented the beta-to-RC gate sequence while leaving review-quality benchmark execution for separate follow-up.
- Release remains prerelease-only; npm `latest` promotion and public desktop support stay out of scope.

## 0.1.0-beta.1 (2026-05-05)

### Beta Release Readiness
- Promoted the supported release line from alpha readiness to `0.1.0-beta.1` across workspace package metadata.
- Keep CLI, GitHub Action, and MCP as the supported beta surfaces for broader user feedback; desktop remains a private preview outside the beta support claim.

### Release Safety
- Published prerelease packages with an explicit `beta` npm dist-tag in the tag-triggered release workflow.
- Add manual npm dist-tag safeguards so prerelease versions cannot be promoted to `latest`.

### Verification
- Required gates: `pnpm typecheck`, `pnpm test --no-file-parallelism`, `pnpm bench:ci`, and `pnpm release:beta-smoke`.
- The `v0.1.0-beta.1` GitHub Release was published as a prerelease, and the npm `beta` dist-tag points to `0.1.0-beta.1` for both `@codeagora/review` and `@codeagora/mcp`. The `latest` dist-tag remains on the alpha line until a release-candidate evidence cycle is complete.

## 0.1.0-alpha.1 (2026-04-29)

### Product Surface Reset
- Keep supported surfaces focused on CLI, MCP, and GitHub Actions, with desktop as a private preview scaffold.
- Retired web, TUI, and notification surfaces remain out of the active release path.

### Operational Hygiene
- Fixed provider-health workflow stub config drift against the current config schema.
- Closed stale provider-health issue noise after verifying successful workflow runs.

### CLI And Configuration
- Added non-interactive preset init support for repeatable setup.
- Added config-driven `reviewContext.ignorePatterns` filtering with excluded-file metadata in dry-run/session output.

### Benchmark Proof Loop
- Expanded the golden-bug benchmark set to 20 validated fixtures.
- Added L3 comparison reporting, reference checks, and live-run gate evidence.
- Recorded a 20-fixture L3-enabled OpenRouter run with TP/FP/FN 16/0/0 and 100.0% precision, recall, F1, and FP clean-rate.

### Reporting And Learning
- Added `agora metrics benchmark` for local JSON/Markdown quality and cost artifacts.
- Extended `agora learn stats --json` and added `agora learn audit --results <path>`.

### Security And CI Robustness
- Wrapped upstream LLM output as untrusted data across L1->L2, supporter->moderator, and L2->L3 prompt paths.
- Added adversarial prompt-injection coverage for role override, system/developer spoofing, JSON breakout, hidden-prompt requests, premature ACCEPT, and forged delimiters.
- Added large-diff priority metadata for security-sensitive files, oversized hunks, and token budget decisions.
- Added GitHub PR freshness metadata for fork/rebase/force-push handling.

### Research Backlog
- Added `agora research plan` with guarded experiment plans for binary severity, ambiguous calibration, cross-file interaction review, and model-pool exploration.

### Verification
- Latest pushed `main` passed CI and Build Action Bundle workflows.
- Local release prep gates passed: `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm build:action`.

## 2.x Final Legacy Release (planned)

### Package Line Reset
- `codeagora@2.x` is now treated as the legacy package line.
- Future review-focused releases should restart under `@codeagora/review@0.x`.
- CLI binary names remain `codeagora` and `agora`, but the future install path becomes `npm i -g @codeagora/review`.

### Retired Surfaces
- Remove the standalone web dashboard package (`@codeagora/web`).
- Remove the standalone terminal TUI package (`@codeagora/tui`).
- Remove the standalone webhook notifications package (`@codeagora/notifications`).
- Remove `agora dashboard`, `agora tui`, `agora notify`, and `agora review --notify`.

### New Direction
- Keep CLI, GitHub Action, MCP, core, and shared packages.
- Consolidate human-facing local UI work into a future Tauri desktop app.
- Document the npm restart plan in `docs/NPM_PACKAGE_RESTART.md`.

## 2.3.4 (2026-04-24)

### Metadata
- Correct npm package repository, homepage, docs, and issue links to `bssm-oss/CodeAgora`.
- Update GitHub Action examples, init workflow template, and SARIF tool metadata to the current public repository URL.

## 2.3.3 (2026-04-16)

### Web UX
- Pipeline 페이지 WS 없이도 ReviewTrigger 폼 표시
- ReviewTrigger 제출 후 폼 리셋 + 성공 메시지
- Models/Costs empty state 친절한 안내 메시지
- Toast auto-dismiss 3초 → 5초
- Pipeline idle 메시지 간결화

## 2.3.2 (2026-04-16)

### Fallback/Retry 강화
- **Error Classifier** — 에러를 rate-limited/auth/transient/permanent로 분류
- **AI SDK maxRetries: 0** — 이중 재시도 제거 (앱 레벨 완전 제어)
- **429 retry-after 인식** — 헤더 파싱, 적절한 대기 후 재시도
- **429는 circuit breaker 미기록** — rate limit ≠ 모델 고장
- **Fallback chain health check** — 죽은 모델 자동 skip
- **L2 supporter 1회 재시도** — transient/rate-limited만
- **L3 head verdict 1회 재시도** — 실패 시 rule-based fallback
- 리뷰어 응답률 2/5 → 5/5 (무료 모델 기준), 속도 196초 → 83초

## 2.3.1 (2026-04-16)

### Bug Fixes
- SARIF 출력 포맷 지원 추가 (`--output sarif`)
- 빈 stdin 입력 시 exit 1 반환
- agreement 커맨드 result.json 없을 때 reviews/ fallback
- CI typecheck 에러 수정 (DiscussionVerdict, MockInstance, Dirent)
- Node 20 AbortSignal 호환성 수정

### Refactoring (10 PRs merged)
- CLI index.ts 1,302줄 → 292줄 (8개 모듈 추출)
- Core orchestrator 1,092줄 → 550줄 (4개 모듈 추출)
- Core moderator 888줄 → 774줄 (supporter-selector 분리)
- GitHub mapper 597줄 → 186줄 (formatter 분리)
- Notifications 중복 코드 제거 (constants, utils 추출)
- MCP 미사용 export 제거
- CI 워크플로우 안정성 개선 (4건)

### Tests
- TUI: 0 → 37개
- CLI review: 64개
- Web API 통합: 46개
- Error classifier: 27개
- 총 4,800+ tests

## 2.3.0 (2026-04-13)

### Web Dashboard — Production Hardening
- **ErrorBoundary** wrapping all routes with crash recovery UI
- **httpOnly cookie auth** via `POST /api/auth` with HMAC-derived session tokens
- **CORS origin pinning** — configurable via `CODEAGORA_CORS_ORIGINS` env var
- **API response validation** — optional Zod-compatible schema in `useApi` hook
- **Session pagination** with server-side filtering (status, search, date range)
- **Pipeline state persistence** to `.ca/pipeline-state.json` with crash recovery
- **Config revert UX** — snapshot at load time, Revert button on save failure
- **WebSocket reconnect** state recovery via sync message on connect
- **DiffViewer syntax highlighting** for keywords, strings, comments, numbers
- **Pipeline idle state** guidance UI
- **Structured logging** via pino

### Web Dashboard — Security (17 code review findings addressed)
- WS query param auth path removed (token log exposure)
- Cookie stores HMAC-derived token, not raw DASHBOARD_TOKEN
- `DELETE /api/auth` requires authentication
- `execFileAsync` error messages gated on `NODE_ENV`
- `provider`/`model` format validation before pipeline execution
- WS origin check aligned with CORS pinned origins
- Cookie regex hoisted to module-level constant
- `activeConnections` double-decrement fixed (onError cleanup removed)

### Web Dashboard — Performance
- Session index 30s TTL in-memory cache with invalidation on pipeline completion
- `parseDiffLines` memoized in DiffViewer
- `findIssuesForLine` O(N²) → `Map<line, issues>` O(1) lookup
- `processDiscussionEvent` single `find()` before switch
- `useMemo` side effects moved to `useEffect` (React concurrent safety)
- `writePipelineState` sync → async
- Config.tsx split into 8 section components (415 → 279 lines)

### Hallucination Filter — 4-Check System
- **New: Check 4 — Self-contradiction detection** penalizes findings that claim "added" when only removals exist (or vice versa)
- **New: Uncertainty routing** — findings with confidence < 20% after penalties routed to `uncertain` array for human review
- `FilterResult` now returns `{ filtered, removed, uncertain }`
- Tests expanded from 9 → 26 cases

### Plugin System — Third-Party Support
- **Third-party loading** via dynamic `import()` from `.ca/plugins/` directory
- **Plugin manifest** discovery from `codeagora-plugin.json` or `package.json`
- **Sandbox isolation** with timeout-bounded execution via `AbortController`
- **Path traversal protection** on plugin directory scanning
- Source TypeScript in `packages/core/src/plugins/` (types, registry, loader, sandbox)
- 35 new tests covering registry, validation, loader, sandbox

### Infrastructure
- `@vitest/coverage-v8` — coverage: 73.7% statements / 84.2% branches / 87.1% functions
- `test:coverage` script added

### Documentation
- CLAUDE.md: "3-Check" → "4-Check" hallucination filter with uncertainty docs
- README: Web dashboard, TUI, MCP server, Notifications detailed sections added

### Stats
- Tests: 226 files, 3,386 passing (+53 from 3,333)
- E2E verified: 8 web pages + TUI startup + 22 API edge cases

---

## 2.2.2 (2026-04-12)

- Phase 1 cleanup: dead code removal, i18n key sync, version alignment
- CLAUDE.md accuracy fixes (6 items: pipeline stages, filter layers, test counts, MCP tools, function names, SSRF method)
- MCP test TS2322 type fixes

---

## 2.2.1 (2026-04-02)

### MCP: CLI Parity + Extension
- All review tools (review_quick, review_full, review_pr) now accept 13 optional parameters: provider, model, timeout, reviewer_timeout, reviewer_count, reviewer_names, no_cache, repo_path, context_lines, output_format, notify, staged, post_review
- **review_pr** supports PR number only — auto-detects owner/repo from git remote
- **Staged review** — review git staged changes directly from MCP
- New **config_get** tool — read config values by dot-notation key
- New **config_set** tool — update config values from Claude Code
- Post-pipeline actions: GitHub PR posting, Discord/Slack notifications, output formatting
- Shared zod schema for consistent parameter validation across tools
- 49 new MCP tests (94 total)

### Web Dashboard
- **Dashboard landing page** — stat cards, recent activity, weekly trend chart, quick actions (replaces "Coming soon" stub)
- **Review trigger** — start reviews from web UI (diff text, PR URL, or staged changes) with real-time WebSocket progress
- **YAML config editing** — full round-trip read/write support via converter.ts (comments lost on save)
- **Notification center** — bell icon, dropdown, read/unread tracking, urgent badges for REJECT/NEEDS_HUMAN
- **Session comparison page** — side-by-side verdict/config/issue diff with ConfigDiff component

### CLI
- New **config-get** command — `codeagora config-get discussion.maxRounds` returns specific values

### Bug Fixes
- MCP bridge no longer treats REJECT verdicts as errors (#443)

### Stats
- Tests: 181 files, 2895 passing

---

## 2.2.0 (2026-04-01)

### New: 4-Layer Hallucination Filter
- **Layer 1**: Pre-debate hallucination check — removes findings referencing files/lines not in diff (#428)
- **Layer 2**: Corroboration scoring — single-reviewer penalty ×0.5, triple+ boost ×1.2, diff-size correction (#432)
- **Layer 3a**: HARSHLY_CRITICAL debate required — no more auto-escalation without discussion (#429)
- **Layer 3b**: Adversarial supporter prompt — "반증해봐" replaces "동의해?" (#430)
- **Layer 3c**: Static analysis evidence in debate — tsc diagnostics, file classification, impact data (#431)
- **Self-contradiction filter**: Findings that admit the issue is handled get ×0.3 confidence penalty (#438)
- **Evidence-level dedup**: Merges duplicate findings before L2, preserves contradiction penalties (#439)
- **"Already handled" prompt patterns**: Reviewers told not to flag guarded values (#440)

### New: Pre-Analysis Layer
- Semantic diff classification (rename/logic/refactor/config/test/docs) (#411)
- TypeScript diagnostics injection via tsc --noEmit (#414)
- Change impact analysis — caller/importer tracking (#415)
- External AI rule file detection (.cursorrules, CLAUDE.md, copilot-instructions) (#407)
- Path-based review rules from config (#408)

### New: Specialist Reviewer Personas
- 4 built-in: builtin:security, builtin:logic, builtin:api-contract, builtin:general (#412)
- Auto reviewers cycle through personas for diverse perspectives

### New: Suggestion Verification
- CRITICAL+ code suggestions verified via TypeScript transpiler (#413)
- Failed suggestions get ×0.5 confidence penalty + warning badge

### New: Triage Digest
- One-liner: `📋 Triage: N must-fix · N verify · N ignore` (#410)

### Quality Results
- False positive rate: 100% → <25% (measured on test diffs)
- CRITICAL false positives: 9 survivors → 0
- Debate DISMISSED rate: 63% → 100%
- Tests: 180 files, 2846 passing

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
