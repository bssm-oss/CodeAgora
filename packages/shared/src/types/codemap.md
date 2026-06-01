# packages/shared/src/types/

## Responsibility
Typed domain models for sessions, evidence, severity, confidence traces, result wrappers, and golden-bug metadata.

## Design
Types are kept framework-agnostic and reusable across packages. They define the payload shape that higher layers serialize, score, display, and validate.

## Flow
Validation and ingestion layers coerce raw JSON or CLI output into these shapes; UI, export, and reporting code then render them without reinterpreting structure.

## Integration
Consumed by core session/review logic, shared utilities, desktop bridge normalization, and benchmark/reporting code.
