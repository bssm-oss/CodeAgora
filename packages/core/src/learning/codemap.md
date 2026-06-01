# packages/core/src/learning/

## Responsibility

Collect and persist learning signals from prior reviews so later runs can improve model selection and heuristics.

## Design

Small, persistence-backed feedback loop with filtering to avoid noisy or low-signal review outcomes.

## Flow

Receive review outcomes, extract useful patterns/metrics, filter invalid entries, and write learning state for future sessions.

## Integration

Feeds L0/model selection heuristics and may read core review outputs plus session state; uses shared utilities for persistence/logging.
