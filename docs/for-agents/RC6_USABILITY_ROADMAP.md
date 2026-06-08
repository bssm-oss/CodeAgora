<!-- Parent: ../README.md -->

# CodeAgora 0.1.0-rc.6 Usability Roadmap

## Mission

`0.1.0-rc.6` is the usability-hardening release for CodeAgora.

The release goal is not new review intelligence or a new product surface. The goal is:

> A new user, CI maintainer, or IDE agent can get from install to first useful review, or recover from a failed setup, without reading source code or guessing the next command.

Optimize for **time-to-first-success** and **failure recovery** across the existing supported surfaces: CLI, GitHub Action, and MCP. Desktop remains private preview and evidence-only.

## Release Thesis

rc.5 stabilized MCP repo targeting and Desktop private-preview packaging. rc.6 should make the existing system feel obvious:

1. Setup tells users what exists, what is missing, and what to run next.
2. Dry-run/preflight distinguishes ready, blocked, and risky states.
3. Review output explains the verdict and the next action.
4. MCP errors are agent-retryable.
5. GitHub Action degraded states are actionable in logs and summaries.
6. Desktop continues to be labelled and gated as private preview only.

## Non-Negotiable Guardrails

Do not change these in rc.6 unless explicitly approved as a separate release-blocker fix:

- CLI JSON/NDJSON stable contracts, including `codeagora.review.v1` output cleanliness.
- MCP tool names, required input schemas, or stable output shapes.
- GitHub Action inputs/outputs or public action contract.
- L0/L1/L2/L3 review semantics, thresholds, verdict logic, confidence computation, or reviewer selection.
- Provider/model support matrix.
- Public Desktop support claims.
- Hosted service, billing, teams, web dashboard, or TUI surfaces.

Messaging, docs, and human-readable text can improve. Machine contracts must remain stable.

## Priority Plan

### P0.1 — CLI First-Run UX

Primary target: make `agora init`, `agora doctor`, missing config, invalid config, and missing provider credentials actionable.

Expected changes:

- `agora init` prints a concise next-step summary after success.
- `agora doctor` groups output into:
  - blocking issues,
  - warnings,
  - ready checks,
  - next steps.
- Missing config points to `agora init`.
- Invalid config points to the config path, field, and minimal fix.
- Missing API key points to the exact environment variable or supported provider command path.
- CLI error hints follow this pattern:
  - what failed,
  - why it matters,
  - next command,
  - example.

Acceptance criteria:

- A clean temp repo can run `agora init -y` and then understand the next command.
- `agora doctor` without config or credentials gives one clear path forward.
- Invalid config and missing credential tests assert remediation text.
- No JSON/NDJSON output contract changes.

Candidate files:

- `packages/cli/src/commands/init.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/utils/errors.ts`
- `src/tests/cli-init*.test.ts`
- `src/tests/cli-doctor*.test.ts`
- `src/tests/cli-error-handling.test.ts`
- `src/tests/config-*.test.ts`

Suggested commit:

```text
cli: make first-run guidance actionable
```

### P0.2 — Dry-Run And Review Execution UX

Primary target: make `agora review --dry-run` the canonical preflight and make default text review output tell users what to do next.

Expected changes:

- Dry-run shows a readiness classification:
  - `ready`: review can run,
  - `blocked`: must fix before review,
  - `risky`: can run, but there are notable caveats.
- Dry-run includes next commands such as:
  - `agora doctor`,
  - `agora review --quick <diff>`,
  - `agora review --staged`,
  - relevant `export PROVIDER_API_KEY=...` examples.
- Text review output includes:
  - verdict,
  - top findings count/severity,
  - degraded/partial-failure state if present,
  - session path or ID,
  - follow-up command (`agora sessions`, `agora explain`, or rerun guidance).
- Empty diff, missing config, missing key, and partial failure states have explicit remediation.

Acceptance criteria:

- `agora review --dry-run fixture.diff` yields an actionable preflight summary.
- Text output improves without changing JSON/NDJSON output.
- Existing output-format tests still pass.
- New tests cover ready/blocked/risky dry-run and review footer behavior.

Candidate files:

- `packages/cli/src/commands/review.ts`
- `packages/cli/src/formatters/review-output.ts`
- `packages/core/src/pipeline/dryrun.ts`
- `src/tests/pipeline-dryrun.test.ts`
- `src/tests/cli-output-formats.test.ts`
- `src/tests/cli-review-options.test.ts`
- `packages/cli/src/tests/cli-review-production-gates.test.ts`

Suggested commit:

```text
cli: add dry-run and review next steps
```

### P0.3 — MCP / IDE Usability

Primary target: make MCP tool discovery and failure recovery clearer for IDE agents.

Expected changes:

- Tool descriptions explain:
  - when to use the tool,
  - required context,
  - expected output shape,
  - common `repo_path` behavior.
- Invalid or inaccessible `repo_path` errors recommend:
  - omit `repo_path` when already in the workspace,
  - pass the exact workspace root,
  - keep paths inside the server cwd/repo boundary.
- Structured MCP errors include retry guidance without breaking existing fields.
- MCP docs include copy-paste examples for the current `@rc` install path and common calls.

Acceptance criteria:

- Invalid `repo_path`, missing config, empty diff, and startup smoke remain deterministic.
- MCP output parity with CLI JSON remains intact.
- Tests assert actionable error guidance.
- Published/packed MCP smoke still passes.

Candidate files:

- `packages/mcp/src/index.ts`
- `packages/mcp/src/helpers.ts`
- `packages/mcp/src/tools/*.ts`
- `packages/mcp/README.md`
- `docs/for-users/EXTENSIONS.md`
- `docs/for-users/TROUBLESHOOTING.md`
- `packages/mcp/src/tests/*.test.ts`
- `src/tests/mcp-*.test.ts`

Suggested commit:

```text
mcp: improve agent-facing tool guidance
```

### P0.4 — GitHub Action Usability

Primary target: make CI setup and degraded/failure logs actionable without changing Action behavior.

Expected changes:

- Missing config, missing provider secret, missing token, fork PR secret limits, diff-too-large, stale head, and posting failure logs include:
  - what happened,
  - why CodeAgora degraded/skipped,
  - exact next step.
- Job summary or log blocks clearly show verdict/degraded reason and links to artifacts when available.
- Docs provide one clear GitHub Action path with retained provider secrets.
- Generated workflow template stays in sync with docs and current release ref.

Acceptance criteria:

- Same-repo PR path remains stable.
- Fork/missing-secret/degraded reason behavior remains stable.
- Action inputs/outputs unchanged.
- Build Action bundle is regenerated and verified if implementation changes require it.

Candidate files:

- `packages/github/src/action.ts`
- `packages/github/src/action-policy.ts`
- `action.yml`
- `packages/shared/src/data/github-actions-template.yml`
- `docs/for-users/GITHUB_ACTIONS_SETUP.md`
- `src/tests/github-actions-runtime.test.ts`
- `src/tests/github-action-parse-args.test.ts`
- `packages/github/src/tests/*.test.ts`

Suggested commit:

```text
github: make action degraded logs actionable
```

### P1 — Docs, Evidence, And Release Alignment

Primary target: make docs and evidence prove the usability story.

Expected changes:

- Add an rc.6 usability evidence note with clean-checkout smoke transcripts.
- Keep current install examples on `@rc` and action examples on the current tag during release prep.
- Document known constraints:
  - provider key requirements,
  - fork PR secret behavior,
  - Desktop private-preview status,
  - machine-output contract stability.
- Add or update smoke scripts only when they directly prove first-run usability.

Acceptance criteria:

- Docs have one canonical happy path for CLI, Action, and MCP.
- Evidence includes success and failure recovery examples.
- Release evidence manifest remains green.

Candidate files:

- `README.md`
- `docs/README.md`
- `docs/for-users/*.md`
- `docs/for-agents/*.md`
- `CHANGELOG.md`
- `scripts/*smoke*.mjs`
- `.sisyphus/evidence/*` generated during release only, not necessarily committed.

Suggested commit:

```text
docs: add rc6 usability evidence
```

### P2 — Desktop Private Preview Only

Primary target: preserve trust and avoid accidental public Desktop support claims.

Expected changes:

- Keep Desktop wording explicitly private preview.
- Only touch Desktop if CLI/core usability changes require private-preview copy or evidence updates.
- Run existing gate if Desktop changes.

Acceptance criteria:

- No public Desktop launch wording.
- `pnpm rc:desktop-gate` remains the gate if any Desktop file changes.

Candidate files:

- `docs/for-users/DESKTOP_PREVIEW.md`
- `packages/desktop/src/main.ts`
- `packages/desktop/src/api/*`
- `src/tests/desktop-*.test.ts`

Suggested commit:

```text
desktop: clarify private-preview usability boundaries
```

## Verification Gates

### Standard rc.6 gates

Run before release-candidate cut:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test --no-file-parallelism
pnpm test:security
pnpm bench:ci
pnpm build:action
pnpm release:beta-smoke
pnpm pack --dry-run
pnpm --filter @codeagora/mcp pack --dry-run
pnpm evidence:manifest -- --require=rc
```

### Desktop gate

Run if any Desktop code, Tauri config, or Desktop docs/evidence claims change:

```bash
pnpm rc:desktop-gate
```

### Manual usability smoke checklist

Use a clean temporary repository and packed or built CLI where practical.

Success path:

```bash
agora --help
agora init -y
agora doctor
agora review --dry-run fixture.diff
```

Failure recovery path:

- Missing config -> points to `agora init`.
- Invalid config -> points to file, field, and minimal fix.
- Missing API key -> points to exact env var or supported provider path.
- Empty diff -> explains there is nothing to review and suggests `--staged` or a patch file.
- Invalid MCP `repo_path` -> suggests omitting `repo_path` or passing workspace root.
- GitHub Action missing secret/fork path -> emits degraded reason and next step.

Contract checks:

- CLI JSON stdout starts with `{` and remains stable.
- NDJSON remains machine-readable.
- MCP compact JSON keeps `schemaVersion: "codeagora.review.v1"` where expected.
- Action inputs/outputs are unchanged unless explicitly approved.
- Logs and artifacts do not leak secrets.

## Working Rules For Deepwork

1. Start with P0.1 and close it before widening scope.
2. Prefer small commits by surface.
3. Every user-facing message change gets a deterministic test or smoke transcript.
4. Do not “improve” engine semantics while doing usability work.
5. Do not edit historical docs except to add clearly marked rc.6 evidence or release notes.
6. If a change affects generated Action behavior, run `pnpm build:action` and verify bundle tests.
7. If a change affects Desktop, run `pnpm rc:desktop-gate` before claiming success.

## Definition Of Done For rc.6

rc.6 is ready when:

- A new user can follow the canonical CLI path without docs beyond README.
- Common setup failures all include an exact next command.
- Dry-run acts as a useful preflight, not just a technical report.
- MCP errors are retryable by an IDE agent.
- GitHub Action degraded states are understandable from logs/summary.
- Desktop remains private preview and green if touched.
- All release gates pass and package smoke verifies the published surfaces.
