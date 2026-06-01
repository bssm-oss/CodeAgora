# packages/core/src/rules/

## Responsibility

Load and evaluate custom review rules that can flag or filter findings independently of model output.

## Design

Rule definitions are declarative and pattern-based, enabling deterministic checks alongside LLM-generated findings.

## Flow

Config-defined rules are loaded, matched against diff/context, and injected into the pipeline as additional findings or suppressions.

## Integration

Used by the pipeline and moderation layers; depends on core config/types and shared diff/path utilities for matching.
