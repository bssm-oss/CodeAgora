# benchmarks/

## Responsibility
Benchmark harnesses, golden bug fixtures, reference reports, and local session artifacts used to evaluate review quality and regression behavior.

## Design
The directory mixes durable benchmark inputs with generated `.ca` outputs. Root-level codemaps describe shared benchmark behavior so leaf fixture codemaps can stay minimal or disappear when redundant.

## Flow
Fixture diffs and expectations are consumed by scripts and test runners, which then emit session metadata, reports, and scored results under `.ca/`.

## Integration
Connects to shared golden-bug scoring, CLI/script automation, and reviewer evaluation workflows; it also stores generated evidence for inspection.
