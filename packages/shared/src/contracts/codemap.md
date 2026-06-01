# packages/shared/src/contracts/

## Responsibility
Stable cross-package contracts that describe shared review/session expectations and versioned shape boundaries.

## Design
Contracts are intentionally small and explicit so downstream packages can depend on a predictable API surface without importing implementation details.

## Flow
Data enters from core/CLI/desktop at the edge, is checked against these contracts, then passed through to storage, rendering, or export paths.

## Integration
Used by package entrypoints and UI/bridge layers to keep session/config semantics aligned across runtime boundaries.
