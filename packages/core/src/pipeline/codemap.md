# packages/core/src/pipeline/

## Responsibility

Orchestrate the end-to-end review run across L0-L3, including chunking, cost estimation, progress, telemetry, dryrun, and auto-approval.

## Design

Central coordinator with adaptive chunking, optional preview execution, structured reporting, and metrics hooks around each stage.

## Flow

Load config/session, chunk the diff, run L0-L3 per chunk, aggregate results, evaluate auto-approve, and emit the final report.

## Integration

Calls every core layer and consumes shared utilities plus concurrency helpers; provides the main API used by CLI/invocations.
