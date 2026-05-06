# P4-P6 Beta Readiness Summary

Updated: 2026-05-06

This document summarizes the beta-readiness gates added for the production-readiness P4-P6 track. The `0.1.0-beta.1` release has been published as a prerelease. Stable or `latest` promotion remains separate and requires a fresh release-candidate evidence bundle plus the live-only evidence described below.

## P4: Benchmark Gate

The required benchmark gate is now deterministic and provider-free:

```bash
pnpm bench:ci
```

The gate validates the golden-bug fixture schema and the phase-2 quality reference. CI runs this gate on Node 20 so beta readiness does not depend on live LLM providers or quota availability.

Current reference contract:

- 20 fixtures validated
- 14 recall fixtures
- 6 FP-regression fixtures
- Reference file: `benchmarks/references/phase2-quality-gate.json`
- Fixture format notes: `benchmarks/golden-bugs/README.md`

Stable-candidate live evidence is now captured separately from the offline beta
gate:

- Report: `docs/live-benchmark-report.md`
- GitHub Actions run: https://github.com/bssm-oss/CodeAgora/actions/runs/25317360402
- Config: `benchmarks/.ca/config.github-models.json`
- Result: 20/20 fixtures completed, 87.5% recall, 82.4% precision, 84.8% F1, and 0/6 FP regressions.
- Artifact policy: the uploaded `bench-out` artifact is the auditable evidence; raw provider transcripts and `bench-out*` directories are not committed.

## P5: Security Boundaries

Path hardening now covers the production entry points that read user-controlled files:

- Explicit config paths must resolve within the configured project root.
- GitHub Action `diff` inputs are validated before filesystem reads.
- Shared path validation resolves real paths before root containment checks.

Redaction now covers persisted and outward-facing review artifacts:

- L1 reviewer session artifacts
- L2 discussion, report, and suggestion artifacts
- L3 final verdict artifacts
- GitHub PR review body and inline comment output
- MCP compact responses and structured tool errors

Bearer-token style secrets are included in the shared redaction contract.

Large-diff prioritization is also regression-tested so security findings stay ahead of low-priority comments when inline review output is capped.

## P6: Beta Smoke And Onboarding

The beta smoke command is non-publishing by design:

```bash
pnpm release:beta-smoke
```

It verifies:

- workspace build
- production GitHub Action bundle build
- root package dry-run contents
- MCP package dry-run contents
- CLI `--help` smoke
- MCP initialize plus `tools/list` smoke

The release workflow runs the deterministic benchmark gate and beta smoke before publish-capable steps. It also computes npm publish tags from package versions so prereleases publish under `beta` rather than `latest`. The checklist in `docs/RELEASE_CHECKLIST.md` now serves as the repeatable release-candidate evidence procedure.

MCP onboarding is now package-local in `packages/mcp/README.md`, and the MCP server version is sourced from `packages/mcp/package.json` rather than a hard-coded string.

## Beta Positioning

Beta means the CLI, GitHub Action, and MCP package are ready for broader user feedback on the supported surfaces, while APIs, benchmark thresholds, and provider behavior may still change before a stable release. The desktop app remains a private preview outside the beta support claim. Stable npm publishing, GitHub release wording, and `latest` dist-tag promotion remain separate approval steps; prerelease npm publishes must continue to use the `beta` dist-tag.

## Verification Evidence

Local verification completed with:

```bash
pnpm typecheck
pnpm build
pnpm bench:ci
pnpm test
pnpm release:beta-smoke
pnpm exec node scripts/verify-package-contents.mjs
```

Observed results for the 2026-05-04 readiness branch:

- `pnpm typecheck`: passed
- `pnpm build`: passed via beta smoke
- `pnpm bench:ci`: passed; 20 fixtures validated
- targeted release/docs readiness tests: passed
- `pnpm release:beta-smoke`: passed; package dry-run, CLI smoke, MCP smoke all passed
- `verify-package-contents`: passed; root files 12, MCP files 8, shared runtime data files 103
- live `bench:fn:run`: passed in GitHub Actions run 25317360402; see `docs/live-benchmark-report.md`

Evidence logs may be stored under `.sisyphus/evidence/` for local audit. Stable-candidate live evidence should be linked to GitHub Actions artifacts or concise docs summaries rather than committed raw provider output.
