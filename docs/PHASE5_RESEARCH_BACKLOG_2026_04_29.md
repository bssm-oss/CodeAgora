<!-- Parent: AGENTS.md -->

# Phase 5 Research Backlog: 2026-04-29

## Scope

Phase 5 intentionally avoids large architecture changes. Each research issue gets a small proof plan and explicit evidence gate before implementation can change production review behavior.

## Issue Plans

Use:

```bash
agora research plan
agora research plan --json
```

The command reports one experiment plan for:

- #466 Binary internal severity
- #469 Ambiguous-case calibration dataset
- #471 Cross-file interaction review
- #481 Bandit exploration beyond configured pool

## Guardrails

- No public severity model change without benchmark evidence.
- Ambiguous fixtures stay separate from golden-bug recall fixtures.
- No InteractionReviewer path until cross-file missed-bug fixtures prove value.
- No live model swap from catalog exploration without passing the reference benchmark gate.

## Verification

Required targeted checks:

- `pnpm exec vitest run packages/core/src/tests/research-experiments.test.ts`
- `node packages/cli/dist/index.js research plan --json`
- `pnpm typecheck`
