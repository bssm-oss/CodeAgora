# packages/core/src/

## Responsibility

Source-of-truth for all core orchestration logic: layers L0-L3 plus config, rules, session, learning, types, and pipeline utilities.

## Design

Modules are split by pipeline stage and support concern; each subdir exposes a small public surface via `index.ts` and shares core types from `src/types/`.

## Flow

Types/config shape inputs, L0 resolves reviewer models, L1/L2/L3 transform review data, and pipeline coordinates execution, reporting, and auto-approval.

## Integration

Used by `@codeagora/core` public exports and by package tests; integrates with shared utilities, AI providers, YAML/JSON config loading, and Node file/process APIs.
