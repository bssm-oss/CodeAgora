<!-- Parent: ../README.md -->

# Development

Concise maintainer notes for local setup, checks, and release/documentation pointers.

## Setup

This workspace is pnpm-only. Use pnpm for checkout setup, workspace scripts,
package filters, and local validation; do not use npm or yarn for workspace
workflows. npm is only acceptable for package artifact checks such as
`npm pack`.

```bash
pnpm install
pnpm build
```

## Checks

```bash
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm dev review path/to/diff.patch
```

## Release / docs pointers

- Current release line: `0.1.0`
- Install examples should stay on `@codeagora/review` and `@codeagora/mcp`
- GitHub Actions examples should keep the action tag at `v0.1.0`
- User-facing setup details live in `docs/for-users/`
- Architecture and contract references live in `ARCHITECTURE.md` and `AGENT_CONTRACT.md`
- Move dated reports and superseded notes to `docs/archived/`
