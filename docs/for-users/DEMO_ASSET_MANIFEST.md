<!-- Parent: ../README.md -->

# Demo Asset Manifest

Use this manifest to prepare one CodeAgora demo package that shows the same review contract flowing through CLI artifacts, MCP tools, Desktop session UI, and GitHub PR comments/checks.

## Demo workspace

| Field | Recommended default | Actual value / notes | Ready |
|---|---|---|---|
| Demo repo | `examples/vulnerable-api/` |  | [ ] |
| Absolute demo path | `<CodeAgora checkout>/examples/vulnerable-api` |  | [ ] |
| Demo branch | `demo/codeagora-review-contract` |  | [ ] |
| Base branch / SHA | `main` at rehearsal start |  | [ ] |
| Demo PR number | `123` placeholder until live PR exists |  | [ ] |
| Provider secret source | `OPENROUTER_API_KEY` from operator environment or GitHub Actions secret |  | [ ] |
| Presenter notes path | `docs/for-users/DEMO_RUNBOOK.md` |  | [ ] |

## Staged diff setup

Use a small staged change in `examples/vulnerable-api/` so every surface reviews identical input.

| Field | Recommended default | Actual value / notes | Ready |
|---|---|---|---|
| Diff source | Staged git diff |  | [ ] |
| Setup command record | `git status --short` and staged-file list captured as text |  | [ ] |
| Staged files | 1-3 files with obvious vulnerable API behavior |  | [ ] |
| Max diff size | Under `5000` lines for the Action; under `1000`-`2500` lines for compact providers |  | [ ] |
| Review ignore state | `.reviewignore` reviewed; demo artifacts excluded from the staged diff |  | [ ] |
| Reset plan | Clean command or backup patch stored outside the repo |  | [ ] |

## Config preset

| Field | Recommended default | Actual value / notes | Ready |
|---|---|---|---|
| Config path | `.ca/config.json` in the demo workspace |  | [ ] |
| Preset | Demo `Balanced` from `DEMO_RUNBOOK.md`; use `Fast` only for repeated rehearsal |  | [ ] |
| Mode | `pragmatic` |  | [ ] |
| Provider | `openrouter` |  | [ ] |
| Language | `ko` for Korean-first demo; `en` for GitHub Actions setup walkthrough |  | [ ] |
| Reviewer count | 3 reviewers for live CLI/Desktop speed; 5 reviewers for GitHub Action quality setup |  | [ ] |
| Reviewer models | `openai/gpt-5.3-codex`, `anthropic/claude-sonnet-4.6`, `deepseek/deepseek-v4-flash` |  | [ ] |
| Supporters | `z-ai/glm-5.1`, `minimax/minimax-m3`; `pickCount: 2` |  | [ ] |
| Devil's advocate | `x-ai/grok-4.3` |  | [ ] |
| Moderator | `openai/gpt-5.3-codex` |  | [ ] |
| Head model | `qwen/qwen3.7-max` |  | [ ] |
| Discussion | `maxRounds: 2`, `codeSnippetRange: 10` |  | [ ] |
| Retry policy | `maxRetries: 1`, `forfeitThreshold: 0.7` |  | [ ] |
| Secret redaction check | No API keys in config, logs, screenshots, exports, or session artifacts |  | [ ] |

## CLI artifacts

Run CLI commands from the demo workspace. Capture stdout/stderr to files under the local demo evidence folder, not into the staged product diff.

| Artifact | Recommended command / value | Actual file / notes | Ready |
|---|---|---|---|
| Live doctor proof | `agora doctor --live` |  | [ ] |
| JSON review contract | `agora review --staged --output json` |  | [ ] |
| NDJSON progress stream | `agora review --staged --json-stream` |  | [ ] |
| Dry-run preflight | `agora review --dry-run --staged` |  | [ ] |
| Session ID | Copy from review output, e.g. `2026-04-27/001` |  | [ ] |
| Session artifact path | `.ca/sessions/<session-id>/` |  | [ ] |
| Explain replay | `agora explain <session-id>` |  | [ ] |
| CLI fallback asset | Pre-recorded JSON, NDJSON, dry-run, and explain outputs from a successful rehearsal |  | [ ] |

## MCP artifacts

Use the published client config for the live demo. For local validation only, switch to the built workspace binary path.

| Artifact | Recommended value | Actual file / notes | Ready |
|---|---|---|---|
| Client config | `{ "mcpServers": { "codeagora": { "command": "npx", "args": ["-y", "@codeagora/mcp"] } } }` |  | [ ] |
| Local client config fallback | `node /absolute/path/to/CodeAgora/packages/mcp/dist/index.js` |  | [ ] |
| Provider environment | `OPENROUTER_API_KEY`; add `GITHUB_TOKEN` for PR review posting/fetching |  | [ ] |
| `dry_run` proof | `{ "name": "dry_run", "arguments": { "staged": true } }` |  | [ ] |
| `review_full` proof | `{ "name": "review_full", "arguments": { "staged": true, "output_format": "json" } }` |  | [ ] |
| `review_pr` proof | `{ "name": "review_pr", "arguments": { "pr_number": 123, "post_review": true } }` |  | [ ] |
| Config proof | `{ "name": "config_get", "arguments": { "key": "discussion.maxRounds" } }` |  | [ ] |
| Leaderboard proof | `{ "name": "get_leaderboard", "arguments": {} }` |  | [ ] |
| MCP fallback asset | Saved tool-call transcript showing compact responses plus one `output_format: "json"` contract |  | [ ] |
| Error fallback asset | Saved structured `isError: true` response, e.g. `INVALID_INPUT`, for explaining safe failures |  | [ ] |

## Desktop artifacts

The Desktop app must remain an operator view over the same `.ca/config.*` and `.ca/sessions` contracts, not a separate review semantics demo.

| Artifact | Recommended value | Actual file / notes | Ready |
|---|---|---|---|
| Desktop build / app source | Local Tauri app or v0.1.2 unsigned preview DMG |  | [ ] |
| DMG reference | `https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.2/CodeAgora_0.1.2_aarch64.dmg` |  | [ ] |
| Signing disclosure | v0.1.2 DMG is unsigned, not notarized, and not auto-updatable; Gatekeeper warning is expected |  | [ ] |
| Repo selection proof | Screenshot or transcript of selecting `examples/vulnerable-api/` with `리뷰 실행` |  | [ ] |
| Readiness proof | Screenshot of `빠른 리뷰` readiness banner before provider spend |  | [ ] |
| Session browsing proof | Screenshot of `세션` opening the CLI/MCP-created session |  | [ ] |
| Setup proof | Screenshot of `셋업` provider / GitHub Action / evidence cards |  | [ ] |
| Export proof | Markdown, JSON, and SARIF export files from session detail |  | [ ] |
| Desktop fallback asset | Pre-recorded screenshots for cockpit/session/setup/export plus a known-good session artifact |  | [ ] |

## GitHub PR and Action artifacts

Use a trusted branch PR for the live provider-backed path. Fork PR behavior should be shown only as a documented skipped/degraded fallback unless a maintainer-controlled rerun is available.

| Artifact | Recommended value | Actual file / notes | Ready |
|---|---|---|---|
| Workflow file | `.github/workflows/codeagora-review.yml` in the demo repo |  | [ ] |
| Action ref | `bssm-oss/CodeAgora@v0.1.2` |  | [ ] |
| Trigger | `pull_request` types: `opened`, `synchronize`, `reopened` |  | [ ] |
| Permissions | `contents: read`, `pull-requests: write`, `checks: write`; add `security-events: write` only with SARIF upload |  | [ ] |
| Inputs | `github-token`, `fail-on-reject: 'true'`, `max-diff-lines: '5000'`, `reporter-mode: check-run`, optional `upload-sarif: 'true'` |  | [ ] |
| Secret | `OPENROUTER_API_KEY` repository secret |  | [ ] |
| PR proof | PR URL and head SHA matching the staged demo change |  | [ ] |
| Workflow proof | Successful or intentionally rejecting workflow run URL |  | [ ] |
| Inline comment proof | Screenshot or URL for at least one CodeAgora inline comment |  | [ ] |
| Verdict proof | Check run or commit status showing `ACCEPT`, `REJECT`, `NEEDS_HUMAN`, or `SKIPPED` |  | [ ] |
| Summary proof | Posted summary review URL |  | [ ] |
| SARIF proof | Code Scanning upload or `codeagora-sarif` workflow artifact fallback |  | [ ] |
| GitHub fallback asset | Pre-recorded PR page, workflow log, summary review, inline comment, verdict reporter, and SARIF/artifact screenshots |  | [ ] |
| Degraded fallback asset | Screenshot/log with `verdict=SKIPPED`, `degraded=true`, and reason such as `untrusted-fork-pr`, `missing-provider-secrets`, or `diff-too-large` |  | [ ] |

## Cross-surface fallback bundle

Keep this bundle ready before any live presentation. Each row should point to files that can be shown without provider calls or network access.

| Surface | Required fallback assets | Actual files / notes | Ready |
|---|---|---|---|
| CLI | JSON contract, NDJSON stream, dry-run output, explain replay, session directory listing |  | [ ] |
| MCP | Client config, tool transcript for `dry_run`, `review_full`, `review_pr`, `config_get`, `get_leaderboard`, and one structured error |  | [ ] |
| Desktop | Launch/setup/session/export screenshots and exported Markdown/JSON/SARIF files |  | [ ] |
| GitHub | PR page, workflow run, inline comment, summary review, verdict reporter, SARIF or artifact fallback, degraded fork/missing-secret example |  | [ ] |
| Presenter | Talk track, timing plan, reset plan, Q&A notes, secret-redaction checklist |  | [ ] |

## Rehearsal log

| Rehearsal timestamp | Presenter | Environment | Result | Failures / fixes | Ready for live demo |
|---|---|---|---|---|---|
|  |  |  | Pass / Fail |  | [ ] |
|  |  |  | Pass / Fail |  | [ ] |
|  |  |  | Pass / Fail |  | [ ] |

## Readiness criteria

The demo package is ready only when every required item below is checked.

- [ ] One staged diff in the demo repo drives CLI, MCP, Desktop, and GitHub Action evidence.
- [ ] `.ca/config.json` uses the selected OpenRouter preset, language, reviewer count, supporter pool, moderator, and head model.
- [ ] CLI JSON, NDJSON, dry-run, session, and explain artifacts exist and contain no secrets.
- [ ] MCP client config and tool transcripts cover `dry_run`, `review_full`, `review_pr`, and at least one non-review config/stats tool.
- [ ] Desktop evidence shows repo selection, readiness, session browsing, setup cards, and Markdown/JSON/SARIF export.
- [ ] GitHub evidence shows PR URL, workflow run, inline comment, summary review, verdict reporter, and SARIF or artifact fallback.
- [ ] Fallback assets exist for CLI, MCP, Desktop, and GitHub so the presenter can continue without live provider, app, or network access.
- [ ] Presenter notes path is set and the presenter can explain: "one review contract across four surfaces."
- [ ] Latest rehearsal row has a timestamp, pass/fail result, notes for any failure, and an explicit live-demo readiness decision.
- [ ] All artifacts are stored outside staged product changes or are intentionally committed demo assets.
- [ ] No provider keys, GitHub tokens, Authorization headers, or secret values appear in any manifest, screenshot, export, log, or transcript.
