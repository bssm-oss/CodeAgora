<!-- Parent: ../RC3_TO_RC8_PRERELEASE_ROADMAP.md -->

# RC.4 Noise Regression

## Purpose

This evidence note tracks the `0.1.0-rc.4` false-positive and noise-reduction cycle. It turns the noisy or trust-eroding patterns discovered during `rc.3` into measurable before/after checks.

`rc.4` prioritizes review-quality trust over the stable schedule. Changes are in scope only when they are measurable through this evidence note or the follow-up `rc.5` cost/speed evidence. This cycle must not add new product surfaces, desktop public-support claims, hosted/team/billing features, opencode expansion, RAG, feedback-loop infrastructure, or broad architecture rewrites.

## Decision State

- RC: `0.1.0-rc.4`
- Korean label: 오탐/노이즈 감소
- English label: False-positive / noise reduction
- Source baseline: `docs/rc-evidence/rc3-real-repo-qa.md`
- Decision state: `rc.4 P0 anchors implemented; R3-02/R3-04 live reruns attempted but blocked by OpenRouter auth`
- Primary question: Can CodeAgora stay useful without annoying maintainers or blocking harmless PRs?

## FP Pattern Matrix

| Pattern | Source input | Root cause | Before result | Regression anchor | After result | Residual risk |
|---------|--------------|------------|---------------|-------------------|--------------|---------------|
| JSON output polluted by logger/progress prelude | R3-01 through R3-04 | Pipeline/logger wrote non-JSON lines to stdout under `--output json --quiet` | Artifacts required manual trimming before JSON parsing | CLI JSON stdout contract test | Pass: pipeline diagnostics moved to stderr; CLI JSON dry-run contract asserts stdout starts with `{` and parses as JSON | Machine consumers still depend on future logs staying off stdout |
| Invalid final location survives into output | R3-02 | Non-actionable location such as `unknown:0` was not filtered or quarantined before final output | Final output included at least one `unknown:0` finding | Invalid final location regression test | Pass: `unknown:0`, non-positive, and inverted ranges are removed or ignored by hallucination/L3 gates, strict-mode warning escalation, and LLM head prompt summaries | Grounding trust still depends on reviewers producing concrete line anchors for actionable findings |
| Low-confidence high-severity findings create scary output | R3-02, R3-04 | Confidence/severity interaction allowed `CRITICAL` or `HARSHLY_CRITICAL` findings at very low confidence to dominate triage | R3-02 emitted high-severity findings at `4%` to `18%`; R3-04 findings ranged `6%` to `39%` | Low-confidence high-severity calibration test | Pass: `CRITICAL`/`HARSHLY_CRITICAL` findings at confidence `<=50%` route to `NEEDS_HUMAN`; only actionable findings above the threshold block | Overcorrection could hide real high-severity issues without recall gates |
| Docs-only quick mode reports `NEEDS_HUMAN` with no findings | R3-03 | Quick mode has no head verdict and uses a lightweight placeholder decision | Clean docs-only quick run returned `NEEDS_HUMAN` with zero findings | Deferred quick-mode wording fixture | deferred P1 | May confuse automation, but does not block rc.4 P0 trust recovery |

## Regression Anchors

| Anchor | Target behavior | Status | Evidence |
|--------|-----------------|--------|----------|
| CLI JSON stdout contract | `agora review --output json --quiet` writes parseable JSON to stdout without prelude text | pass | `packages/cli/src/tests/cli-review-production-gates.test.ts`; manual CLI JSON QA |
| Invalid final location filter | Findings with invalid locations such as `unknown:0` do not survive into final findings | pass | `packages/core/src/tests/hallucination-filter.test.ts`; `src/tests/l3-verdict.test.ts` |
| Low-confidence high-severity calibration | Weakly grounded high-severity findings are downgraded, routed to verify, or uncertainty-marked instead of unsupported blocking | pass | `src/tests/l3-verdict.test.ts`; `src/tests/confidence.test.ts`; `packages/core/src/tests/confidence-witness.test.ts` |

## Command Result Table

| Command | Purpose | Result | Notes |
|---------|---------|--------|-------|
| `pnpm vitest run src/tests/l3-verdict.test.ts packages/core/src/tests/hallucination-filter.test.ts packages/cli/src/tests/cli-review-production-gates.test.ts` | Targeted rc.4 regression anchors | pass | 3 files, 95 tests passed |
| `pnpm vitest run src/tests/cli-output-formats.test.ts src/tests/cli-review-options.test.ts src/tests/confidence.test.ts packages/core/src/tests/evidence-scorer.test.ts packages/core/src/tests/confidence-witness.test.ts packages/cli/src/tests/agent-contract.test.ts` | Adjacent output/confidence contract checks | pass | 6 files, 112 tests passed |
| `pnpm test:security` | Recall/security safety gate | pass | 10 files, 84 tests passed |
| `pnpm bench:ci` | Deterministic benchmark/reference gate | pass | 20 fixtures validated; reference gate validates 14 recall and 6 FP-regression fixtures |
| `pnpm typecheck` | TypeScript safety gate | pass | `tsc --noEmit` exited 0 |
| Manual CLI JSON QA | Confirm machine stdout behavior through CLI surface | pass | `agora review --dry-run --quiet --output json`: stdout 1200 bytes, stderr 0 bytes, first stdout byte `{`, JSON parsed successfully |
| `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-02-pr512.patch --output json --no-cache --quiet --timeout 300` | R3-02 rc.4 live rerun attempt | blocked | Output remained valid `codeagora.review.v1` JSON with stdout first byte `{`, but pipeline returned `status: error`; OpenRouter rejected all reviewers with `auth: Auth error (permanent): User not found`. Artifact captured locally as `.sisyphus/evidence/rc4-R3-02-pr512.json` and stderr was empty. |
| `pnpm --silent exec tsx --conditions development packages/cli/src/index.ts review .sisyphus/evidence/rc3/diffs/R3-04-pr525.patch --output json --no-cache --quiet --timeout 300` | R3-04 rc.4 live rerun attempt | blocked | Output remained valid `codeagora.review.v1` JSON with stdout first byte `{`, but pipeline returned `status: error`; OpenRouter rejected all reviewers with `auth: Auth error (permanent): User not found`. Artifact captured locally as `.sisyphus/evidence/rc4-R3-04-pr525.json` and stderr was empty. |

## R3-02 / R3-04 Rerun Matrix

| Input | Expected rc.4 behavior | Before | After | Classification |
|-------|------------------------|--------|-------|----------------|
| R3-02 large refactor | No unsupported high-severity blocking findings; no `unknown:0`; weak claims become verify/known-limit or disappear | 4 low-confidence high-severity findings, including `unknown:0` | blocked: OpenRouter auth returned `User not found` for every reviewer before L1 evidence generation | blocked-provider-auth |
| R3-04 MCP/security-sensitive change | Preserve grounded security signal while separating verify-worthy findings from noise | 12 findings, mostly below 40% confidence | blocked: OpenRouter auth returned `User not found` for every reviewer before L1 evidence generation | blocked-provider-auth |

## Recall Safety Summary

Deterministic recall/security gates passed for the rc.4 P0 changes:

- `pnpm test:security` passed all 84 security-boundary tests.
- `pnpm bench:ci` validated 20 benchmark fixtures and the reference gate covering 14 recall fixtures plus 6 FP-regression fixtures.
- The L3 change does not suppress actionable high-confidence `CRITICAL` findings; confidence `51%` remains blocking while confidence `50%` and below routes to human verification.

## Residual Known Limits

- R3-02 and R3-04 live reruns are blocked on valid OpenRouter credentials for the low-cost diverse model pool; current attempts prove machine JSON error output stays parseable but do not close quality/noise evidence.
- A Codex CLI default-model smoke succeeded locally, but it is not comparable to the rc.3 OpenRouter low-cost diverse baseline and should not be used to close the R3-02/R3-04 rerun matrix.
- Docs-only quick mode returning `NEEDS_HUMAN` with no findings remains a deferred P1 wording issue.
- Machine JSON safety now has regression coverage, but future direct `console.log` additions in pipeline code remain a maintenance risk.

## Pass Criteria

- Every high-signal `rc.3` false-positive pattern has a regression anchor or a documented non-reproducible reason.
- `--output json --quiet` is machine-parseable without manual trimming.
- Invalid final locations such as `unknown:0` cannot survive into final findings.
- Low-confidence high-severity findings are downgraded, routed to verify, or explicitly uncertainty-marked instead of producing unsupported blocking claims.
- High-severity recall and security gates do not regress.
- Remaining noise is non-blocking and documented as a known limit or follow-up.

## Fail Criteria

- Noise reduction suppresses a known high-severity bug.
- The fix only handles one hand-picked sample without a regression anchor.
- Machine-readable output still contains non-contract stdout.
- Benign PR categories can still be blocked by weakly grounded findings.
- Any new product surface, large architecture expansion, or public desktop claim enters `rc.4` scope.
