# rc.6 Usability Evidence Note

Captured on 2026-06-08 during rc.6 usability hardening.

This note records the deterministic local smoke used to verify that CodeAgora now tells users and agents what failed, why it matters, and what to do next.
It is not live provider or live GitHub evidence.

## Canonical Happy Paths

- CLI: `agora init -y` -> `agora doctor` -> `agora review --dry-run <diff>`
- MCP: `review_quick` with `staged: true` or an explicit unified diff
- GitHub Action: same-repository PR with provider-backed review and degraded-state summaries when posting is skipped

## Verified CLI Usability

- `pnpm --filter @codeagora/cli dev doctor` now prints grouped sections for blocking issues, warnings, ready checks, and next steps.
- `pnpm --filter @codeagora/cli dev doctor --json` still preserves the stable JSON contract.
- The text formatter now ends successful and failed runs with a concrete next command instead of stopping at verdict/status.
- `agora init` now prints a concise follow-up path after setup.

Representative local result:

```text
Doctor Report
Summary: 10 passed, 0 failed, 30 warnings
Warnings (30)
Ready checks (10)
Next steps
- Set the missing provider API keys, then rerun agora doctor --live.
- Install or enable the missing CLI backends, then rerun agora doctor.
- Rerun agora review --dry-run after the warnings above are resolved.
```

## Verified MCP Usability

- Invalid `repo_path` errors now include retry guidance in the structured JSON body.
- The guidance tells agents to omit `repo_path` when already inside the workspace and to pass the exact workspace root otherwise.
- Empty diff and dry-run failures now include the next input/action to try.
- Tool descriptions were tightened so discovery prompts the caller with the common `repo_path` behavior.

Representative deterministic checks:

- `pnpm vitest run packages/mcp/src/tests/tool-handlers.test.ts packages/mcp/src/tests/critical-errors.test.ts`
- `pnpm --filter @codeagora/mcp build`

## Verified GitHub Action Usability

- Degraded or skipped runs now emit grouped logs with `why` and `next steps` for the reason code.
- The job summary gets the same remediation guidance when available.
- `action.yml` and the generated template were moved to the current `0.1.0-rc.6` release line.

Representative deterministic checks:

- `pnpm vitest run src/tests/github-action-parse-args.test.ts src/tests/github-actions-runtime.test.ts`
- `pnpm --filter @codeagora/github build`

## Failure-Recovery Examples

- Empty dry-run input now returns `INVALID_INPUT` with guidance to pass a unified diff or use `staged=true`.
- Invalid `repo_path` now returns `INVALID_REPO_PATH` with guidance to omit `repo_path` or pass the exact workspace root.
- Missing provider secrets now map to an actionable Action degraded reason instead of a bare skip.
- Diff-too-large, stale-head, and posting failures now carry next steps in both logs and the summary.
