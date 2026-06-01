# benchmarks/golden-bugs/

## Responsibility
Curated security/quality regression fixtures with expected review outputs for benchmarked bug patterns and false-positive cases.

## Design
Each bug directory pairs a diff patch with expectations so benchmark tooling can compare reviewer findings against ground truth.

## Flow
Benchmark scripts load a fixture, run review logic, then compare generated evidence/decisions against the expected JSON for that case.

## Integration
Feeds shared benchmark scoring, regression checks, and detector tuning. Leaf fixture codemaps are unnecessary when this parent description covers the dataset structure.
