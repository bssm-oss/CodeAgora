# packages/core/src/plugins/

## Responsibility

Load and register plugin providers that extend or customize core review behavior.

## Design

Registry-driven extensibility with typed plugin metadata and provider managers so built-ins and custom plugins share the same lifecycle.

## Flow

Config selects plugins, loader instantiates them, registry exposes them to the pipeline, and plugin hooks influence review execution.

## Integration

Bridges config and pipeline layers; uses core types for plugin contracts and shared utilities for validation/logging.
