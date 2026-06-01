# packages/core/src/pipeline/analyzers/

## Responsibility

Provide pre-analysis passes that enrich diff context before review starts.

## Design

Independent analyzers produce small structured signals (impact, semantics, diagnostics, rules, artifact exclusion) that the pipeline can combine.

## Flow

Diff/context enters analyzers, results are merged into chunk metadata, and later layers use that metadata to steer reviewer selection and prompts.

## Integration

Used only by the pipeline orchestrator; depends on shared diff/path utilities and core types for analyzer outputs.
