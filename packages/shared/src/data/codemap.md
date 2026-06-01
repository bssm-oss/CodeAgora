# packages/shared/src/data/

## Responsibility
Static data files for model rankings, pricing, supported models, and GitHub Actions templates.

## Design
Treats external reference data as build-time inputs. Files are simple, versioned assets rather than generated runtime state.

## Flow
Higher-level code imports these assets to compute costs, show leaderboard-style rankings, or stamp out workflow templates.

## Integration
Used by scoring, model selection, and documentation/automation generation paths in core, CLI, and benchmark tooling.
