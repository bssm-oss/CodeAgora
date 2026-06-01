# packages/shared/src/providers/

## Responsibility
Single source of truth for provider-to-environment-variable mapping and provider tier metadata.

## Design
Maps are static and declarative so other packages can display setup status or load credentials without duplicating provider naming logic.

## Flow
CLI and desktop read the mapping to determine which keys are configured; provider setup screens and status summaries reflect the same source.

## Integration
Consumed by CLI startup, desktop provider status views, and tests that verify supported provider coverage.
