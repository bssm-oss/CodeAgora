# Contributing to CodeAgora

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/bssm-oss/CodeAgora.git
cd CodeAgora
pnpm install
pnpm build
pnpm test
```

## Development

- `pnpm test` — run all tests
- `pnpm typecheck` — type check
- `pnpm lint` — lint
- `pnpm build` — build

## Pull Requests

1. Fork the repo and create your branch from `main`
2. Add tests for new functionality
3. Ensure all tests pass (`pnpm test`)
4. Ensure type check passes (`pnpm typecheck`)
5. Open a PR with a clear description

## Commit Convention

- `feat:` new feature
- `fix:` bug fix
- `refactor:` refactoring
- `test:` test additions/changes
- `docs:` documentation
- `chore:` build/config changes

## Reporting Issues

Use [GitHub Issues](https://github.com/bssm-oss/CodeAgora/issues). Include:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
