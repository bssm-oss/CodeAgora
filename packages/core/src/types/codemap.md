# packages/core/src/types/

## Responsibility

Define the shared TypeScript contracts for config, reviewer/model selection, findings, debate, verdicts, and support utilities.

## Design

Keep shapes explicit and reusable across layers so the pipeline can communicate through typed data instead of ad hoc objects.

## Flow

Types are imported by every layer to validate boundaries: config in, review evidence through L1/L2, verdict/report objects out.

## Integration

Acts as the internal contract layer for all core modules and the public package API, alongside shared zod schemas where applicable.
