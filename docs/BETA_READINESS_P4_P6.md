# P4-P6 Beta Readiness Summary

Updated: 2026-05-02

This document summarizes the beta-readiness gates added for the production-readiness P4-P6 track. The scope is intentionally limited to deterministic validation, security hardening, documentation, and non-publishing beta smoke checks. It does not perform npm publishing, GitHub release creation, tagging, dist-tag updates, or marketplace distribution.

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

The release workflow runs the deterministic benchmark gate and beta smoke before publish-capable steps. The checklist in `docs/RELEASE_CHECKLIST.md` documents manual guardrails for actual release operations.

MCP onboarding is now package-local in `packages/mcp/README.md`, and the MCP server version is sourced from `packages/mcp/package.json` rather than a hard-coded string.

## Beta Positioning

Beta means the CLI, GitHub Action, and MCP package are ready for broader user feedback on the supported surfaces, while APIs, release automation, benchmark thresholds, and provider behavior may still change before a stable release. Actual npm publishing, GitHub release creation, tag creation, and dist-tag promotion remain separate approval steps.

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

Observed results on merged `main`:

- `pnpm typecheck`: passed
- `pnpm build`: passed via beta smoke
- `pnpm bench:ci`: passed; 20 fixtures validated
- `pnpm test`: 205 files passed, 1 skipped; 3411 tests passed, 21 skipped
- `pnpm release:beta-smoke`: passed; package dry-run, CLI smoke, MCP smoke all passed
- `verify-package-contents`: passed; root files 12, MCP files 3

Evidence logs may be stored under `.sisyphus/evidence/` for local audit and are not required release artifacts.
