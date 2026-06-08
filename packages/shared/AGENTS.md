<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# shared Package (@codeagora/shared)

## Purpose
Foundation layer providing types, utilities, config schemas, validators, i18n, and provider environment variable mappings used across all CodeAgora packages. Zero external dependencies except zod. No index.ts barrel — other packages import subpaths directly (`@codeagora/shared/utils/`, `@codeagora/shared/providers/`, etc.).

## Key Files
| File | Description |
|------|-------------|
| `package.json` | Package metadata; main entry point is `./dist/index.js` |
| `src/utils/` | Shared utility functions (7 modules) |
| `src/i18n/` | Internationalization system (en.json, ko.json locale files) |
| `src/data/` | Static JSON data (model rankings, pricing, Groq model list, GitHub Actions template) |
| `src/providers/` | Provider environment variable mapping (single source of truth) |
| `src/meme/` | Meme mode: alternate text pools for verdicts and status messages |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/utils/` | Concurrency helpers (pLimit), diff parsing, filesystem, logging, path validation, process killing, error recovery, scope detection, issue mapping |
| `src/i18n/` | Lightweight i18n module (no external deps); supports 'en' and 'ko' locales |
| `src/data/` | Static config: model rankings, pricing, supported Groq models, GitHub Actions template |
| `src/providers/` | Provider name → environment variable mapping (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) |
| `src/meme/` | Verdict and status message pools for meme mode presentation |

## For AI Agents

### Working In This Directory

**Import Conventions:**
- No barrel exports (no index.ts) — import directly from subpaths
- Other packages import as: `import { pLimit } from '@codeagora/shared/utils/concurrency.js'`
- Never use relative imports across packages; always use `@codeagora/` scoped paths

**Utilities Overview:**
- `concurrency.ts` — Lightweight pLimit implementation (no external p-limit dependency); used for parallel task scheduling
- `diff.ts` — Extract file paths and code snippets from unified diffs
- `fs.ts` — Filesystem helpers for `.ca/` directory structure (sessions, reviews, logs, credentials)
- `issue-mapper.ts` — Map evidence documents (findings) to diff line numbers; fuzzy file path matching
- `logger.ts` — Structured logging system; logs to `.ca/logs/` directory with timestamp/component/level
- `path-validation.ts` — Path security (reject empty, null bytes, absolute, symlinks, traversal attacks); Result<T> pattern
- `process-kill.ts` — Unix-only process tree kill (kill process + children via process groups)
- `recovery.ts` — Retry logic with exponential backoff; configurable max retries, delays, backoff factor
- `scope-detector.ts` — Lightweight (no AST) function/class scope detection via regex; supports ts/tsx/js/jsx/py/go

**i18n System:**
- `setLocale(lang)` — Switch locale ('en' or 'ko')
- `getText(key, fallback?)` — Retrieve localized string by dot-notation key
- Locale files in `locales/{lang}.json`; keys use dot notation (e.g., `app.title`, `home.review`)
- No pluralization or variable substitution (use simple concatenation)

**Data Files:**
- `data/model-rankings.json` — Model performance rankings from artificialanalysis.ai; used for leaderboard display
- `data/pricing.json` — Per-token pricing for cost calculations
- `data/groq-models.json` — Supported Groq API models
- `data/github-actions-template.md` — Template for GitHub Actions workflow

**Provider Mapping:**
- `PROVIDER_ENV_VARS` — Single source of truth: provider name → environment variable name
- Used by CLI to load credentials from environment at startup
- Supported API providers: 'anthropic', 'openai', 'openrouter', 'opencode-go', 'opencode-zen', 'groq'.

**Meme Mode:**
- `getMemeVerdict(verdict)` — Return alternate text pool for verdict message
- `getMemeBadge(badgeType)` — Return alternate text for badges
- Supports both 'en' and 'ko' locales; falls back to default if not found

### Common Patterns

**Concurrency:**
```typescript
import { pLimit } from '@codeagora/shared/utils/concurrency.js';

const limit = pLimit(3);
const results = await Promise.allSettled(
  tasks.map(t => limit(() => processTask(t)))
);
```

**Path Validation (Result<T> pattern):**
```typescript
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';
import { ok, err } from '@codeagora/core/types/core.js';

const result = validateDiffPath(userInput);
if (result.ok) {
  // use result.value
} else {
  // use result.error
}
```

**Logging:**
```typescript
import { createLogger } from '@codeagora/shared/utils/logger.js';

const logger = createLogger('component-name');
logger.info('message', { data: 'value' });
logger.error('error', { stack: err.stack });
```

**Retry with Backoff:**
```typescript
import { retryAsync } from '@codeagora/shared/utils/recovery.js';

const result = await retryAsync(
  () => apiCall(),
  { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, backoffFactor: 2 }
);
```

**Error Handling:**
- Use zod for input validation (imported from `zod` in this package)
- Path operations use Result<T, string> pattern (ok/err from core)
- Async operations use try-catch with graceful fallbacks
- All shell/file operations sanitized before execution

**TypeScript:**
- Strict mode enforced
- No `any` types; use `unknown` with narrowing
- Prefer functional, immutable patterns
- Export types alongside implementations

## Dependencies

### Internal
None — shared has no internal dependencies. It is the foundation layer.

### External
- `zod` — Schema validation (imported and re-exported)
- `picocolors` — Terminal color utilities (for logging)
- Node.js builtins: `fs/promises`, `path`, `process`, `child_process`

<!-- MANUAL: -->
