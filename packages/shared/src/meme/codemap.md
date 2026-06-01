# packages/shared/src/meme/

## Responsibility
Alternative verdict, badge, and status text pools for meme-mode presentation.

## Design
Keeps playful UI copy isolated from normal product text while reusing the same domain decisions and locale selection flow.

## Flow
Verdict/status identifiers are converted into alternate strings at display time and then surfaced in CLI or desktop UI.

## Integration
Used by presentation layers that want to switch between standard and meme output without changing review semantics.
