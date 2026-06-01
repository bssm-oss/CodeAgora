# packages/core/src/l0/

## Responsibility

Select and score reviewer models using health, capability, specificity, and bandit-learned performance history.

## Design

Uses a multi-armed-bandit style selector, in-memory health tracking, persistent arm state, and lightweight quality metrics to bias future reviewer picks.

## Flow

Input reviewer intents/config → classify issue family → filter blocked models → score candidates → return concrete agent configs for L1.

## Integration

Consumes core config/types and shared logger/utilities; its output is the entry point for L1 execution and feedback from L1 updates health/quality state.
