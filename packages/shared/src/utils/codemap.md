# packages/shared/src/utils/

## Responsibility
Reusable low-level helpers for concurrency, diffs, filesystem access, logging, retries, path safety, process cleanup, issue mapping, scope detection, and golden-bug utilities.

## Design
Each utility file is meant to stand alone and avoid internal coupling. Security-sensitive helpers favor Result-style returns and validation before side effects; logger/fs/process helpers encapsulate the shared `.ca` layout.

## Flow
Raw paths, diffs, logs, and review artifacts are normalized here before being consumed by higher-level review/session code. Concurrency helpers gate fan-out; recovery helpers wrap retryable I/O; golden-bug helpers score and map benchmark data.

## Integration
Imported across the monorepo, especially core pipeline code, CLI orchestration, GitHub integrations, tests, and benchmark runners.
