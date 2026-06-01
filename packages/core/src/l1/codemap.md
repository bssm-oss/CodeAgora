# packages/core/src/l1/

## Responsibility

Run multiple reviewers concurrently, execute either API or CLI backends, parse responses into findings, and enforce circuit breaking.

## Design

Backend abstraction, Promise.allSettled batch execution, markdown-to-structure parsing, and provider-level failure isolation.

## Flow

Receive reviewer configs, skip blocked providers, call backend, parse evidence documents, and emit review outputs plus health feedback.

## Integration

Depends on L0 health state, core config/types, shared diff/path utilities, and Node spawn/Vercel AI SDK for execution.
