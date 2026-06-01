# packages/core/src/security/

## Responsibility

Provide security boundaries for file, shell, and external-input handling inside core.

## Design

Favor `Result<T>`-style containment, strict validation, and sanitized command execution to keep unsafe inputs from reaching the runtime.

## Flow

Validate inputs before file/process access, return explicit success/failure states, and keep sensitive data out of logs and prompts.

## Integration

Used by config, L1 CLI backend, and any file/system-touching code; relies on shared validation and path helpers.
