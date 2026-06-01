# packages/core/src/session/

## Responsibility

Manage per-run session state, including cached config, progress, and other workflow-scoped data.

## Design

Session state is centralized so pipeline stages can share context without threading large mutable objects through every call.

## Flow

Initialize at pipeline start, store config/runtime metadata, expose getters/setters during execution, and reset per review run.

## Integration

Consumed by config and pipeline orchestration; supports resume-like behavior and consistent progress/reporting state.
