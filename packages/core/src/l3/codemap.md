# packages/core/src/l3/

## Responsibility

Produce the final head verdict, group findings for presentation, and identify items needing human confirmation.

## Design

LLM-first verdicting with deterministic fallback, confidence scoring, and file/category grouping for readable final output.

## Flow

Accept moderator output, evaluate risk/reasoning, build grouped results, and return ACCEPT/REJECT/NEEDS_HUMAN style outcomes.

## Integration

Consumes core types/config and shared logging; provides the pipeline’s terminal decision and report data.
