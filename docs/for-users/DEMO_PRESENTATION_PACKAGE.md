<!-- Parent: ../README.md -->

# CodeAgora Demo Presentation Package

Audience: Korean-speaking product, engineering, and platform teams who need a technically honest five-minute demo and a deeper follow-up explanation.

Use this package with `docs/for-users/DEMO_RUNBOOK.md` as the operator runbook. It is intentionally evidence-bound: every claim below maps to the current repository docs and command contracts, not to a live provider run.

## Evidence sources used

- `docs/for-users/DEMO_RUNBOOK.md`: demo target, commands, MCP calls, Desktop flow, GitHub Action snippet, talk track.
- `docs/for-agents/ARCHITECTURE.md`: L0 → Pre-Analysis → L1 → filters → L2 → L3 pipeline, supported surfaces, session storage.
- `docs/for-agents/AGENT_CONTRACT.md`: stable JSON/NDJSON/session/MCP contracts and exit-code boundaries.
- `codemap.md`: package entry points and surface-to-core architecture map.

This package follows the demo delivery contract. Unknown demo-specific live values are intentionally marked as fill-in placeholders instead of being fabricated.

## 1. Five-minute system map / storyline

### One-line story

CodeAgora는 “여러 모델이 독립적으로 리뷰하고, 근거 없는 지적을 걸러내고, 논쟁을 거친 뒤, 하나의 동일한 리뷰 계약을 CLI/MCP/Desktop/GitHub으로 내보내는 코드 리뷰 엔진”입니다.

### System map to draw on one slide

```text
CLI / MCP / Desktop / GitHub Action
        |
        v
Config + credentials + diff acquisition
        |
        v
Core review pipeline
  L0 model intelligence
  Pre-analysis: semantic diff, TS diagnostics, impact, AI rules, artifact exclusion
  L1 parallel specialist reviewers
  Hallucination filter: file, line, quote, contradiction checks
  L2 discussion: moderator + supporters + devil's advocate
  L3 head verdict: ACCEPT / REJECT / NEEDS_HUMAN + triage digest
        |
        v
Stable outputs: JSON, NDJSON, sessions, MCP tools, PR comments/checks, Desktop UI
```

### 0:00–1:00 — Problem

- Single-model review is easy to demo but hard to trust.
- A useful reviewer must answer three questions:
  1. Did different reviewers see different classes of risk?
  2. Did the system reject hallucinated findings before they reached the user?
  3. Can automation consume the result without scraping prose?

Korean talk track:

> “CodeAgora의 핵심은 예쁜 코멘트가 아니라 검증 가능한 리뷰 계약입니다. CLI에서 본 결과, MCP 도구가 받은 결과, Desktop에서 보는 세션, GitHub PR에 남는 체크가 같은 코어 파이프라인에서 나옵니다.”

### 1:00–2:00 — One contract across four surfaces

- CLI exposes `agora review --output json`, `agora review --json-stream`, and session commands.
- MCP review tools return compact results by default and the same JSON contract when `output_format: "json"` is requested.
- Desktop consumes `agora review --json-stream` through the Tauri bridge for progress and result state.
- GitHub Action uses the same repository config and posts PR comments/checks/statuses from the review result.

Anchor phrase:

> “UI가 네 개가 아니라, 같은 엔진을 보는 창이 네 개입니다.”

### 2:00–3:00 — Pipeline credibility

Use the architecture stages:

- L0 selects or tracks model performance.
- Pre-analysis enriches the diff before the LLMs run.
- L1 reviewers run independently with personas such as security, logic, API contract, and general review.
- The hallucination filter removes or downweights claims that do not match real files, diff line ranges, quoted code, or change direction.
- L2 debate keeps contested issues visible instead of hiding disagreement.
- L3 emits `ACCEPT`, `REJECT`, or `NEEDS_HUMAN` plus triage buckets.

Korean framing:

> “여기서 중요한 건 다수결이 아닙니다. 독립 관찰, 근거 필터링, 논쟁, 최종 판정이 분리돼 있다는 점입니다.”

### 3:00–4:00 — Demo target and artifacts

- Use `examples/vulnerable-api/` as the demo target from the runbook.
- Use a prepared `.ca/config.json` with Korean language and OpenRouter-backed reviewers when doing a real provider-backed demo.
- Use `.ca/sessions/{YYYY-MM-DD}/{NNN}/` as the explainable artifact store.
- Show that the same session can be replayed or inspected without paying for another model run.

### 4:00–5:00 — Business close

- For developers: fewer ungrounded comments, better triage.
- For platform teams: machine-readable contract and deterministic exit codes.
- For leaders: human-readable PR review plus archived evidence.

Close with:

> “CodeAgora is not replacing human judgment. It is making AI review auditable enough that humans know what to trust, what to verify, and what to ignore.”

## 2. Five-minute live demo script with timestamps

Use two terminals or one terminal plus the Desktop app. Keep the real provider-backed command optional; if readiness is not perfect, switch at the 30-second fallback rule below.

### Before the clock starts

Fill in these placeholders:

- Demo repository path: `[DEMO_REPO_PATH]`, normally `examples/vulnerable-api/`.
- Session ID for replay: `[SESSION_ID]`, for example `2026-04-27/001`.
- Demo PR number: `[PR_NUMBER]`.
- Demo action ref: `bssm-oss/CodeAgora@v0.1.2` from the runbook, unless the release owner provides a newer ref.
- Provider mode: `[LIVE_OPENROUTER]` or `[RECORDED_SESSION]`.

### 0:00–0:30 — Open on the contract

Say:

> “오늘은 네 가지 화면을 보여드리지만, 하나의 리뷰 계약만 보겠습니다: CLI JSON/NDJSON, MCP 도구, Desktop 세션 UI, GitHub PR 체크입니다.”

Show command list, do not execute yet:

```bash
agora doctor --live
agora review --staged --json-stream
agora explain [SESSION_ID]
```

### 0:30–1:15 — Preflight

Run only when the environment is prepared for a live provider-backed demo:

```bash
agora doctor --live
```

Call out:

- `doctor --live` is the spend-control gate.
- A blocked workspace should be explained before model calls start.
- Provider secrets must not be pasted or shown.

If this takes more than 30 seconds, use the fallback card.

### 1:15–2:30 — CLI NDJSON stream

Preferred live command:

```bash
agora review --staged --json-stream
```

What to point at:

- Each line is JSON, not mixed prose.
- Progress events use `schemaVersion: "codeagora.review.v1"` and `type: "progress"`.
- Stages are `init`, `review`, `discuss`, `verdict`, and `complete`.
- The final event is `type: "result"`.

If the live review cannot run, use:

```bash
agora explain [SESSION_ID]
```

Say:

> “라이브 호출이 막히면 같은 세션 아티팩트로 설명합니다. 이것도 제품 계약의 일부입니다.”

### 2:30–3:15 — JSON/session artifact contract

Show the expected stable shape, not a fabricated live result:

```json
{
  "schemaVersion": "codeagora.review.v1",
  "status": "success",
  "date": "YYYY-MM-DD",
  "sessionId": "NNN",
  "summary": {
    "decision": "ACCEPT | REJECT | NEEDS_HUMAN",
    "totalReviewers": 3,
    "severityCounts": {}
  },
  "evidenceDocs": [],
  "discussions": []
}
```

Connect to session storage:

```text
.ca/sessions/YYYY-MM-DD/NNN/
  reviews/
  discussions/
  unconfirmed/
  suggestions.md
  report.md
  result.md
```

### 3:15–4:00 — MCP tool path

Show MCP client config:

```json
{
  "mcpServers": {
    "codeagora": {
      "command": "npx",
      "args": ["-y", "@codeagora/mcp"]
    }
  }
}
```

Show tool calls:

```json
{ "name": "dry_run", "arguments": { "staged": true } }
```

```json
{ "name": "review_full", "arguments": { "staged": true, "output_format": "json" } }
```

Say:

> “MCP는 셸 래퍼가 아니라 에이전트가 직접 호출하는 도구 표면입니다. JSON을 요청하면 CLI와 같은 계약으로 돌아옵니다.”

### 4:00–4:35 — Desktop session UI

Show the Desktop app if available:

1. `리뷰 실행`에서 demo repo 선택.
2. `빠른 리뷰` readiness banner 확인.
3. `세션`에서 `[SESSION_ID]` 열기.
4. `셋업`에서 provider / GitHub Action / evidence cards 확인.

Call out:

- Desktop is the operator view onto the same config/session contracts.
- Desktop consumes the CLI NDJSON stream contract through the Tauri bridge.
- It must not be described as a separate review semantics layer.

### 4:35–5:00 — GitHub PR close

Show the runbook workflow snippet:

```yaml
- name: CodeAgora Review
  uses: bssm-oss/CodeAgora@v0.1.2
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-reject: 'true'
    max-diff-lines: '5000'
    reporter-mode: check-run
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

Say:

> “마지막 화면은 PR입니다. 같은 리뷰 결과가 inline comment, verdict summary, check run/status로 표현됩니다. Fork PR이나 secret이 없는 상황은 안전하게 degrade해야 합니다.”

## 3. Operator cue card

### 30-second fallback rule

If any live step has not clearly succeeded within 30 seconds, stop waiting and switch to recorded/session evidence.

Do not debug on stage. Say one sentence, then move:

> “라이브 환경은 비용과 인증 상태에 영향을 받으므로, 같은 계약으로 저장된 세션 아티팩트를 보여드리겠습니다.”

### Demo control checklist

Before starting:

- Confirm current directory is `[DEMO_REPO_PATH]` or explain when showing root-level docs only.
- Confirm the staged diff exists if running `agora review --staged`.
- Confirm provider credentials are present but never display them.
- Keep `[SESSION_ID]` ready for `agora explain [SESSION_ID]`.
- Keep `[PR_NUMBER]` ready for MCP `review_pr` or GitHub screen share.
- Keep a browser tab or terminal pane open to the GitHub Action YAML snippet.

During the demo:

- Narrate contracts, not model magic.
- Avoid promising exact latency, exact cost, or exact finding counts.
- Use Korean labels for product meaning, English command names for exactness.
- If a command prints an error, classify it: setup/input/config, runtime/pipeline, or expected degraded path.

Do not do these on stage:

- Do not paste provider keys.
- Do not run unprepared live provider calls after fallback has started.
- Do not claim dry-run output is live review quality evidence.
- Do not invent a session ID, PR number, artifact path, or finding count.

## 4. Fallback card

Use this when live provider, network, desktop launch, or GitHub screen share fails.

### Fallback sequence A — CLI/session only

1. Show the stable contract from `AGENT_CONTRACT.md`.
2. Run or display:

```bash
agora explain [SESSION_ID]
```

3. Show `.ca/sessions/YYYY-MM-DD/NNN/` structure from the architecture doc.
4. Explain that replay does not re-run providers.

Talk track:

> “실시간 모델 호출이 아니라 저장된 세션을 보고 있습니다. 하지만 이게 바로 운영상 중요한 점입니다. 리뷰 결과는 휘발성 채팅이 아니라 재검토 가능한 아티팩트입니다.”

### Fallback sequence B — MCP without live review

Show the MCP tool calls only:

```json
{ "name": "dry_run", "arguments": { "staged": true } }
```

```json
{ "name": "config_get", "arguments": { "key": "discussion.maxRounds" } }
```

```json
{ "name": "get_leaderboard", "arguments": {} }
```

Talk track:

> “에이전트 통합은 리뷰 실행만이 아니라 설정 조회와 모델 상태 조회까지 포함합니다. 그래서 MCP는 단순 셸 캡처가 아닙니다.”

### Fallback sequence C — GitHub without posting

Show the YAML snippet and say:

> “오늘은 PR에 실제 코멘트를 쓰지 않겠습니다. 계약상 GitHub Action은 inline comments, verdict summary, configured reporter를 담당하고, fork PR과 secret 없는 경우는 안전한 degraded path로 설명해야 합니다.”

### Fallback sequence D — Desktop unavailable

Show this statement:

> “Desktop은 별도 판정 엔진이 아닙니다. Tauri UI가 CLI NDJSON progress/result와 session artifacts를 소비하는 operator view입니다.”

Then return to CLI/session artifact evidence.

## 5. 10+ minute extended explanation

Use this after the five-minute demo or for technical Q&A.

### 0:00–1:30 — Product boundary

CodeAgora currently supports four product surfaces:

- CLI: command-line review, JSON/NDJSON, sessions.
- MCP: AI-agent tool surface for review/config/session workflows.
- GitHub Action: PR comments, check/status reporting, CI gates.
- Desktop: Tauri local operator UI for setup visibility, session browsing, review launch, and evidence export.

Retired or non-demo surfaces should not be presented as current first-class surfaces.

### 1:30–3:00 — Stable machine contract

The stable marker is:

```text
codeagora.review.v1
```

Stable machine surfaces include:

- `agora review --output json`
- `agora review --json-stream`
- `agora sessions list --json`
- `agora sessions show --json`
- MCP review tools when `output_format: "json"` is requested

Consumers should branch in this order:

1. `schemaVersion`
2. `status`
3. `summary.decision`

Final verdict values to discuss:

- `ACCEPT`: no blocking issue found.
- `REJECT`: review found blocking issues.
- `NEEDS_HUMAN`: confidence or disagreement requires human judgment.

### 3:00–5:00 — Why the pipeline is split

The demo should not describe CodeAgora as “ask five models and vote.” The useful engineering split is:

1. L0 manages model intelligence and selection history.
2. Pre-analysis supplies deterministic context before model review.
3. L1 lets reviewers inspect independently.
4. The hallucination filter checks whether claims are grounded in the actual diff.
5. L2 debate handles contested findings.
6. L3 produces the user-facing verdict and triage digest.

This separation lets the system explain why a finding survived, not just that a model said it.

### 5:00–6:30 — Session artifacts and replay

Every review run is saved under `.ca/sessions/` with date/session directories. The architecture doc lists readable artifacts such as raw reviewer outputs, debate transcripts, unconfirmed issues, suggestions, moderator report, and head result.

The presentation point:

> “Review output is an artifact, not an ephemeral chat response.”

Use `agora explain [SESSION_ID]` when the room asks for replay or when live calls are unavailable.

### 6:30–8:00 — MCP and agent integration

MCP defaults to compact output to preserve agent context. For stable machine output, request JSON:

```json
{ "name": "review_full", "arguments": { "staged": true, "output_format": "json" } }
```

Important boundaries:

- `review_quick` and `review_full` can accept a diff or `staged: true`.
- `review_pr` accepts a PR URL or PR number.
- `repo_path` is validated against the server cwd/repository boundary.
- MCP errors preserve protocol error status and return structured error bodies with stable codes such as `INVALID_INPUT`, `INVALID_REPO_PATH`, and `REVIEW_FAILED`.

### 8:00–9:30 — Desktop as operator view

Desktop should be described as a Tauri app that consumes the same config/session contracts. The AGENT contract says Desktop review-run handling should parse `agora review --json-stream` by `schemaVersion` and `type`, preserving progress and result fields.

Use Korean UX terms from the runbook:

- `리뷰 실행`
- `빠른 리뷰`
- `세션`
- `셋업`

Claim only:

- It is a local UI for readiness, sessions, setup, and review launch.
- It does not define separate verdict semantics.

### 9:30–11:00 — GitHub Action and CI behavior

GitHub Action demo claims should stay within the runbook:

- It can post inline comments, a verdict summary, and the configured verdict reporter.
- A single OpenRouter key is enough for the recommended demo stack.
- Fork PRs and missing secrets must degrade safely.
- `fail-on-reject: 'true'` is the CI gate shown in the sample.

Exit-code boundaries from the agent contract:

| Exit code | Meaning |
|---|---|
| `0` | Review completed and no requested failure gate tripped |
| `1` | Review completed, but `--fail-on-reject` or `--fail-on-severity` tripped |
| `2` | User-actionable setup/input/config error |
| `3` | Runtime or pipeline failure |

Explain carefully:

> “A `REJECT` verdict alone is not automatically a non-zero exit unless the failure gate asks for it.”

### 11:00–12:30 — What not to overclaim

Do not claim:

- Live provider quality was proven unless a live provider run was actually executed.
- Dry-run proves review accuracy.
- Desktop has independent review semantics.
- Compact MCP output is the stable versioned contract.
- GitHub posting succeeded unless a real PR run is shown.
- The demo proves exact latency, exact cost, or benchmark superiority.

## 6. Q&A cheat sheet

### “Is this just multiple LLMs voting?”

No. The pipeline separates independent review, deterministic filtering, debate, and final verdict. The architecture explicitly includes hallucination checks for file existence, line range, quote fabrication, and self-contradiction before final triage.

### “What is stable enough for automation?”

Use the versioned machine contract `codeagora.review.v1`: CLI JSON, CLI NDJSON, session JSON, and MCP review tools when `output_format: "json"` is requested.

### “Can I scrape the pretty Markdown or GitHub comment?”

Do not treat presentation renderers as stable machine contracts unless they are explicitly versioned. Use JSON/NDJSON/session/MCP JSON surfaces for automation.

### “What happens when reviewers disagree?”

L2 discussion uses a moderator, supporter pool, and devil's advocate. Contested findings are debated before L3 emits `ACCEPT`, `REJECT`, or `NEEDS_HUMAN`.

### “Does Desktop run a different product?”

No. Desktop is the operator view over the same config, NDJSON progress/result stream, and session artifacts.

### “What should I show if the live model call fails?”

Apply the 30-second fallback rule. Switch to `agora explain [SESSION_ID]`, session artifacts, and the stable contract. Do not debug credentials or network on stage.

### “Does dry-run prove the review works?”

No. Dry-run is readiness/preflight evidence. It prevents wasted calls but does not prove live provider quality or final review accuracy.

### “How does CI fail?”

`agora review` has deterministic exit codes. A `REJECT` verdict exits non-zero only when `--fail-on-reject` or another configured failure gate trips.

### “Can this review pull requests?”

Yes, through GitHub Action and MCP `review_pr`. In the demo, replace `[PR_NUMBER]` with the current PR number and avoid claiming posting success unless a real PR run is visible.

### “What about fork PRs and secrets?”

The GitHub demo must preserve the guardrail that fork PRs or missing provider secrets degrade safely before secret-backed execution.

### “Where are artifacts stored?”

Under `.ca/sessions/YYYY-MM-DD/NNN/`, with reviewer outputs, debate transcripts, unconfirmed issues, suggestions, reports, and verdict artifacts as documented in the architecture guide.

### “Can an agent consume CodeAgora without a terminal?”

Yes. MCP exposes review/config/session tools. For stable machine output, request `output_format: "json"`.

### “Why Korean-friendly instead of fully translated?”

Commands, contract markers, schema fields, verdict names, package names, and file paths stay in English for exactness. Presenter narration and concept labels can be Korean so the audience gets both precision and accessibility.

## 7. Evidence-bound claim boundaries

Use this table to keep the presentation honest.

| Claim | Safe wording | Evidence boundary |
|---|---|---|
| One contract across surfaces | “CLI JSON/NDJSON, MCP JSON, sessions, Desktop consumption, and GitHub reporting are built around the same review contract and core pipeline.” | Stable contract is documented for CLI/MCP/session. GitHub and Desktop are presentation/integration surfaces over that result; do not claim every renderer is itself versioned. |
| Pipeline quality | “The architecture includes independent reviewers, deterministic grounding checks, debate, and final triage.” | Do not claim measured superiority or benchmark numbers unless separate benchmark evidence is shown. |
| Hallucination reduction | “The filter checks file existence, diff line range, quote fabrication, and self-contradiction.” | Do not claim a live false-positive rate from this demo alone. |
| Dry-run | “Dry-run/preflight checks readiness before spend.” | Dry-run is not live review-quality evidence. |
| Live provider demo | “This run uses configured provider-backed reviewers.” | Only say this after a real provider-backed run succeeds. Never expose keys. |
| Session replay | “A past session can be explained without re-running the review.” | Use a real `[SESSION_ID]`; do not invent one. |
| MCP | “MCP exposes review/config/session tools; JSON output aligns with the CLI formatter when requested.” | Compact MCP output is not the stable versioned contract. |
| Desktop | “Desktop is the local operator UI over readiness, review launch, sessions, setup, and evidence.” | Do not say Desktop has independent verdict semantics. |
| GitHub Action | “The Action can post inline comments, verdict summary, and configured reporter output.” | Do not claim posting/check success without showing a real PR run. |
| CI gate | “`fail-on-reject` can make a rejected review fail CI.” | A bare `REJECT` does not imply exit code `1` unless the gate is enabled. |
| Cost and latency | “Preset choice changes cost/latency posture.” | Do not promise exact spend or runtime without live measurement. |
| Security | “Secrets should be supplied through environment/secrets and never shown in artifacts or slides.” | Do not claim comprehensive secret scanning from this package. |

## 8. Presenter quick script in Korean

Use this compact version when the room is mostly Korean-speaking but technical.

> “CodeAgora는 코드 리뷰용 multi-agent pipeline입니다. 핵심은 모델을 여러 개 부르는 게 아니라, 동일한 리뷰 계약을 네 표면에서 공유한다는 점입니다. CLI에서는 `agora review --json-stream`으로 진행 이벤트와 최종 결과를 받고, MCP에서는 에이전트가 `review_full` 같은 도구를 호출합니다. Desktop은 같은 세션을 보는 운영자 UI이고, GitHub Action은 PR 코멘트와 체크로 표현합니다.
>
> 내부적으로는 L0가 모델 선택/상태를 다루고, pre-analysis가 diff context를 보강합니다. L1에서 security/logic/API contract 같은 specialist reviewer가 독립적으로 보고, hallucination filter가 실제 diff에 없는 파일/라인/인용/변경 방향 오류를 걸러냅니다. 이후 L2 debate와 L3 head verdict를 거쳐 `ACCEPT`, `REJECT`, `NEEDS_HUMAN` 중 하나로 정리합니다.
>
> 오늘 라이브 호출이 30초 안에 안정적으로 안 뜨면 바로 fallback으로 갑니다. 그 경우에도 제품 이야기는 그대로입니다. 저장된 `.ca/sessions/...` 아티팩트와 `agora explain [SESSION_ID]`가 같은 계약을 보여주기 때문입니다.”

## 9. Command and artifact crib sheet

### CLI

```bash
agora doctor --live
agora review --staged --output json
agora review --staged --json-stream
agora review --dry-run --staged
agora explain [SESSION_ID]
```

### MCP

```json
{ "name": "dry_run", "arguments": { "staged": true } }
```

```json
{ "name": "review_full", "arguments": { "staged": true, "output_format": "json" } }
```

```json
{ "name": "review_pr", "arguments": { "pr_number": "[PR_NUMBER]", "post_review": true } }
```

```json
{ "name": "config_get", "arguments": { "key": "discussion.maxRounds" } }
```

```json
{ "name": "get_leaderboard", "arguments": {} }
```

### Session paths

```text
.ca/config.json
.ca/sessions/YYYY-MM-DD/NNN/reviews/
.ca/sessions/YYYY-MM-DD/NNN/discussions/
.ca/sessions/YYYY-MM-DD/NNN/unconfirmed/
.ca/sessions/YYYY-MM-DD/NNN/suggestions.md
.ca/sessions/YYYY-MM-DD/NNN/report.md
.ca/sessions/YYYY-MM-DD/NNN/result.md
```

### GitHub Action snippet

```yaml
uses: bssm-oss/CodeAgora@v0.1.2
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  fail-on-reject: 'true'
  max-diff-lines: '5000'
  reporter-mode: check-run
env:
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```
