# packages/shared/

## Responsibility
Foundation package for cross-workspace types, validators, utilities, provider/env metadata, i18n, and static data. It is the lowest-level dependency used by core, CLI, GitHub, MCP, and desktop surfaces.

## Design
No barrel-style package layering inside the source tree; callers use direct subpath imports. The package is intentionally small, dependency-light, and split by concern: `src/utils`, `src/types`, `src/contracts`, `src/providers`, `src/data`, `src/meme`, and `src/i18n`.

## Flow
Static metadata and helpers flow upward into higher packages. Validation/result types are used to normalize user input, path handling, session data, and provider config before those values reach core orchestration or UI layers.

## Integration
Imported by nearly every package for shared schema, status, and utility behavior. Desktop and CLI both depend on its session/config conventions, while benchmark tooling uses its golden-bug mapping and scoring helpers.
