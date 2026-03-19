# Changelog

## 2.0.0-rc.1 (2026-03-19)

### Breaking Changes
- **Monorepo migration** — single package restructured into 8 pnpm workspace packages (`@codeagora/shared`, `@codeagora/core`, `@codeagora/github`, `@codeagora/notifications`, `@codeagora/cli`, `@codeagora/tui`, `@codeagora/mcp`, `@codeagora/web`)
- Import paths changed from relative (`../types/core.js`) to package imports (`@codeagora/core`)

### New Packages
- **@codeagora/mcp** — MCP server with 7 tools (review_quick, review_full, review_pr, dry_run, explain_session, get_leaderboard, get_stats). Compatible with Claude Code, Cursor, Windsurf, VS Code.
- **@codeagora/web** — Web dashboard with Hono.js REST API + React SPA. 8 pages: review results, real-time pipeline progress, model intelligence, session history, cost analytics, discussion viewer, config management.

### New Features (Sprint 1-7)
- **GitHub enrichment** — inline debate logs, summary debate detail, suppressed issues, confidence filtering, review status badge, performance reports, issue heatmap, SARIF discussion metadata, session diff on re-review, dry-run preview comments
- **Webhooks** — generic webhook with HMAC signing, event stream webhook (real-time pipeline events)
- **Discord** — live discussion threads, pipeline summary embed, moderator event emitter
- **Meme mode** — alternate text for badges, verdicts, discussions, and performance reports (English + Korean)
- **CLI commands** — `agora models` (leaderboard), `agora explain` (session narrative), `agora replay` (session replay), `agora agreement` (reviewer agreement matrix)
- **Model intelligence** — Thompson Sampling visualization, devil's advocate tracking, diff complexity estimator, reviewer diversity score
- **MCP server** — 7 tools exposing the full pipeline to any MCP-compatible client, lightweight review mode (L1 only), compact output format
- **Web dashboard** — real-time WebSocket pipeline progress, annotated diff viewer, model leaderboard, cost analytics, session history browser, discussion/debate viewer, config management UI

### Security Fixes
- Path traversal prevention on persona loading, SARIF output, session routes, config API
- Bind web server to 127.0.0.1 (loopback only)
- HMAC-SHA256 signature verification on generic webhooks
- Input validation with regex on all user-facing API endpoints
- CORS restricted to localhost origins

### Internal
- 4 parser rewrites (parseStance, parseForcedDecision with structured output)
- Circuit breaker consolidation (L0 + L1 → single implementation)
- readFileSync → readFile async migration
- SIGKILL escalation on spawn timeout
- 437 new tests (1443 → 1880) including component rendering tests with @testing-library/react

## 1.1.1-rc.1 (2026-03-19)

### Improvements
- **TUI full redesign** — all 8 screens rewritten with lazygit-style master-detail panels
- **Theme system** — centralized colors, unicode icons (●/○/▸/✓/✗), round borders
- **7 shared components** — Panel, ScrollableList, TextInput, Toast, HelpOverlay, TabBar, DetailRow
- **Config screen** — full CRUD for reviewers/supporters/moderator, ? help overlay, Ctrl+e $EDITOR, 1-5 tab shortcuts
- **ModelSelector** — provider/ prefix search, API key status icons, cached loading, responsive height
- **Health checks** — single provider (h), bulk test all (t), retry on failure (r) in API Keys tab
- **Provider status** — missing key warnings on presets, key count in footer, status icons in reviewer list
- **Results screen** — all issues visible (not just top 5), severity summary bar, master-detail layout
- **Pipeline progress** — reviewer count display, stage icons (●/◐/○), cancel hint
- **Reviewer clone** — c key duplicates selected reviewer
- **Validator warnings** — recommendations for reviewer count, supporter pool size, discussion rounds

### Bug Fixes
- Fix preset apply crash when config missing moderator/discussion/errorHandling fields
- Fix reviewer ID collision on delete+add (now uses max suffix strategy)
- Fix API key saved to process.env without sanitization
- Fix setTimeout timer leak in toast notifications
- Fix health check promise rejection freezing UI
- Fix $EDITOR path not validated before spawn
- Fix null config type cast causing potential runtime crash
- Fix bulk health check losing provider identity on rejection

### Internal
- L0: enforce includeReasoning constraint in model selection
- 57 new tests (1386→1443), including provider-status, theme, shared components
- Extract DetailRow shared component from 3 tab files

## 1.1.0 (2026-03-17)

### Features
- **Strict/Pragmatic review modes** — per-mode presets with tailored thresholds and personas
- **Korean language support** — full Korean prompts in L2/L3, language config (`en`/`ko`)
- **Auto-approve** — trivial diff detection (comments, blanks, docs-only) bypasses LLM pipeline
- **Custom rules** — `.reviewrules` YAML for regex-based static pattern checks, merged into L1 results
- **Confidence score** — 0–100 per issue based on reviewer agreement, adjusted by L2 consensus
- **Learning loop** — persist dismissed patterns to `.ca/learned-patterns.json`, auto-suppress frequently dismissed patterns
- **`agora learn`** — `--from-pr <number>` CLI command to learn from past reviews
- **Enhanced GitHub discussions** — round-by-round detail with consensus icons, native code suggestion blocks
- **Severity escalation** — escalate to CRITICAL when file path matching fails
- **Quantitative hints** — added to L3 verdict prompt for better decision quality
- **Strict mode** — WARNING >= 3 triggers NEEDS_HUMAN
- **Init wizard improvements** — mode/language selection, head config in all default templates

### Bug Fixes
- Comprehensive stability fixes — circuit breaker, deduplication, lint cleanup
- Dead code cleanup + TUI fixes
- Stability fixes Phase 2-3 (28 remaining issues)

### Internal
- Switched `action.yml` from source build to `npm install`
- Security-focused persona included in strict mode preset

## 1.0.3 (2026-03-17)

### Bug Fixes
- Generate default persona files during `init`

### Docs
- Add logo and update badge colors to match brand

## 1.0.2 (2026-03-17)

### Bug Fixes
- Drop Node 18 from CI (ESLint 10 requires Node 20+)

### Docs
- Add npm/npx install instructions to README

## 1.0.1 (2026-03-17)

Patch release — version bump only (no functional changes).

## 1.0.0 (2026-03-17)

First stable release. All features from rc.1–rc.8 consolidated.

### Features
- **GitHub Actions integration** — inline PR review comments, commit status checks, SARIF output
- **15 API providers** — OpenAI, Anthropic, Google, Groq, DeepSeek, Qwen, Mistral, xAI, Together, Cerebras, NVIDIA NIM, ZAI, OpenRouter, GitHub Models, GitHub Copilot
- **5 CLI backends** — claude, codex, gemini, copilot, opencode
- **LLM-based Head verdict** — L3 Head agent uses LLM to evaluate reasoning quality (rule-based fallback)
- **Majority consensus** — checkConsensus handles >50% agree/disagree votes
- **Semantic file grouping** — import-relationship-based clustering for reviewer distribution
- **Reviewer personas** — strict, pragmatic, security-focused persona files
- **Configurable chunking** — maxTokens settable via config
- **NEEDS_HUMAN handling** — auto-request human reviewers + add labels
- **SARIF 2.1.0 output** — GitHub Code Scanning compatible
- **Secure credentials** — API keys stored in ~/.config/codeagora/credentials
- **TUI paste support** — clipboard paste works in all text inputs
- **CLI --pr flag** — review GitHub PRs directly from command line
- **Parallel chunk processing** — adaptive concurrency for large diffs

### Bug Fixes
- Fix dist build crash (locale JSON not bundled)
- Fix discussion matching (exact filePath:line instead of substring)
- Fix division by zero in forfeit threshold
- Fix CLI flags (--provider, --model, --timeout, --no-discussion) being ignored
- Fix GitHub Action multiline output corruption
- Fix parser "looks good" false negative
- Fix inline comment position errors (fallback to summary-only)
- Strip ANSI codes in doctor format tests for CI compatibility
- Remove unused imports that fail CI lint

## 1.0.0-rc.1 to rc.7

Initial development releases. See git history for details.
