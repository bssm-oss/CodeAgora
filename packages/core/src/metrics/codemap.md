# packages/core/src/metrics/

## Responsibility

Collect runtime and review metrics used for telemetry, confidence, and operational visibility.

## Design

Metrics are modeled as lightweight, append-only observations so pipeline stages can record timing, counts, cost, and quality without tight coupling.

## Flow

Stages emit measurements during execution; telemetry/reporting code aggregates them into session- or run-level summaries.

## Integration

Consumed by pipeline telemetry and potentially learning/confidence logic; depends on core types and shared logging conventions.
