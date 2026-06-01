# packages/core/src/research/

## Responsibility

Support experimental or exploratory review logic that informs future pipeline behavior.

## Design

Holds isolated research helpers so prototypes and investigation code stay out of the main orchestrator path.

## Flow

Research utilities consume review data or synthetic inputs, produce observations, and may feed learnings back into design work.

## Integration

Intentionally narrow: used by internal experiments/tests rather than the production pipeline, with shared types/utilities when needed.
