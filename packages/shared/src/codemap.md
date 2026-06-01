# packages/shared/src/

## Responsibility
Source home for the package's direct-import modules and data assets. It groups reusable utilities, contract types, provider mappings, static JSON/markdown data, localization files, and meme-mode text pools.

## Design
The tree is organized by capability rather than runtime layer. Utilities remain independent, data files are treated as immutable inputs, and the package avoids a single re-export barrel so consumers import only what they need.

## Flow
Callers import specific subpaths; those modules normalize raw inputs, expose typed helpers, or serve static lookups. Shared data then feeds session formatting, provider setup, scoring, logging, and UI copy higher in the stack.

## Integration
Used by core for contracts and result types, by CLI/GitHub for filesystem and provider utilities, and by desktop for localized UI text and status rendering.
