# packages/core/src/l2/

## Responsibility

Moderate reviewer findings through deduplication, thresholds, supporter debate, objections, and final report assembly.

## Design

Consensus-oriented orchestration with parallel supporter rounds, devil’s-advocate support, event streaming, and graceful partial-failure handling.

## Flow

Take L1 outputs, merge duplicates, filter low-value findings, run discussion rounds, and emit a moderator report for L3.

## Integration

Consumes L1 evidence plus config/types, reads diff context when needed, and surfaces structured debate results to verdicting and reporting.
