<!-- Parent: ../README.md -->

# Development

Concise maintainer notes for local setup, checks, and release/documentation pointers.

## Setup

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

- Current release line: `0.1.0-rc.5`
- Install examples should stay on `@codeagora/review@rc` and `@codeagora/mcp@rc`
- GitHub Actions examples should keep the action tag at `v0.1.0-rc.5`
- User-facing setup details live in `docs/for-users/`
- Architecture and contract references live in `ARCHITECTURE.md` and `AGENT_CONTRACT.md`
- Move dated reports and superseded notes to `docs/archived/`
