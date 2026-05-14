# CodeAgora 0.1.0-rc.3 Release Notes Draft

## Positioning

This release candidate captures the first real-repository review baseline for the supported CLI, GitHub Action, and MCP package line. It remains prerelease-only: npm `latest` promotion, stable GitHub Action refs, and public desktop support are still out of scope.

## Highlights

- Added the `rc.3` through `rc.8` prerelease roadmap and evidence workflow for the path from real-repo testing to a later stable-candidate packet.
- Captured five real CodeAgora PR review baselines with the OpenRouter low-cost diverse model set.
- Recorded `rc.3` as `complete with blockers`, making rc.4 false-positive/noise reduction the next required workstream.
- Promoted package metadata and generated GitHub Action examples to `0.1.0-rc.3` / `v0.1.0-rc.3`.
- Fixed the tag-triggered release workflow so release-candidate tags require the `rc` evidence manifest tier rather than the weaker beta tier.

## Baseline Outcome

The five selected samples completed successfully:

| Sample | Result | Final findings |
|--------|--------|----------------|
| R3-01 PR #502 | `ACCEPT` | 0 |
| R3-02 PR #512 | `NEEDS_HUMAN` | 4 |
| R3-03 PR #514 quick | `NEEDS_HUMAN` | 0 |
| R3-04 PR #525 | `NEEDS_HUMAN` | 12 |
| R3-05 PR #503 | `ACCEPT` | 0 |

## Known Blockers For rc.4

- `--output json --quiet` can emit logger/progress lines before JSON, which breaks machine consumers until fixed.
- Low-confidence findings can still surface as CRITICAL/HARSHLY_CRITICAL, especially on large deletion/refactor diffs.
- Invalid final locations such as `unknown:0` can survive into final findings.

## Scope Boundaries

- This release does not claim stable quality, npm `latest`, or stable public desktop support.
- Desktop remains private-preview evidence only.
- Direct GitHub PR mode still requires separate token-backed smoke evidence; the rc.3 baseline used patch-file inputs fetched from historical PRs.

## Verification Evidence

- `docs/rc-evidence/rc3-real-repo-qa.md` records the real-repo baseline and blocker table.
- Deterministic docs regression checks passed after evidence capture.
- Release-candidate validation must still pass before tagging and publishing.
