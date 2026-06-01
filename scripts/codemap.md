# scripts/

## Responsibility
Repository automation and maintenance scripts for builds, benchmarks, smoke checks, package verification, and model snapshot updates.

## Design
Mostly standalone Node/TS entrypoints with narrow purposes. They coordinate workspace data, benchmark fixtures, or release assets without becoming part of the runtime packages.

## Flow
Scripts read workspace files, transform or verify them, and write derived artifacts such as benchmark manifests, action bundles, or model snapshots.

## Integration
Used by package scripts, CI, and benchmark workflows. They lean on shared utility/data formats but avoid introducing new application APIs.
