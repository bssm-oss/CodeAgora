# packages/core/

## Responsibility

Core review engine for CodeAgora: owns model selection, review execution, debate, final verdicting, configuration/session handling, plugin/rules/learning support, and the pipeline that ties L0-L3 together.

## Design

Layered pipeline (L0-L3) with strict type boundaries, zod-validated inputs, `Promise.allSettled` for partial failure tolerance, and session-scoped caching for config/state.

## Flow

Config/session load first, L0 selects models, L1 generates evidence, L2 moderates and deduplicates, L3 emits the final verdict/report, with supporting modules feeding metadata and policy.

## Integration

Exports the core API consumed by CLI/GitHub/MCP packages; depends on `@codeagora/shared`, Vercel AI SDK providers, and Node APIs for file/process boundaries.
