# packages/cli/src/formatters/

## Responsibility

Render review/session results into presentation-specific outputs: plain text, JSON, Markdown, GitHub-flavored annotations, and inline diff markup.

## Design Patterns

Pure formatting functions over normalized review data; output variants share a common representation and only diverge at the final rendering step.

## Data & Control Flow

Command modules pass core results into formatter helpers, which assemble human-readable summaries or machine-friendly payloads for stdout/GitHub posting.

## Integration Points

Used by CLI review/session commands and by GitHub output paths; consumes shared review types and diff/finding metadata from core/github packages.
