# packages/core/src/config/

## Responsibility

Load, validate, normalize, and migrate core configuration plus credentials and mode presets.

## Design

Prefer JSON over YAML, validate with zod, keep credentials separate from config, and treat normalization/migration as idempotent steps.

## Flow

Read `.ca/config.*`, validate/migrate, merge credentials, apply presets, cache for the session, and hand a normalized config to the pipeline.

## Integration

Feeds pipeline/session initialization and provides typed config objects to L0-L3, rules, and plugins; uses filesystem, path, os, and zod utilities.
