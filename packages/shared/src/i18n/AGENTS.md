<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# i18n/ (@codeagora/shared internationalization)

## Purpose
Lightweight internationalization module providing locale-aware message retrieval. Supports English ('en') and Korean ('ko') locales via JSON files. No external i18n libraries (no i18next, messageformat). Simple setLocale/getText API for active CodeAgora packages.

## Key Files
| File | Description |
|------|-------------|
| `index.ts` | Main i18n module; setLocale(), getText() functions; locale state |
| `locales/en.json` | English locale messages (complete message catalog) |
| `locales/ko.json` | Korean locale messages (translated catalog) |

## For AI Agents

### Working In This Directory

**Module Architecture:**
- Single `index.ts` file exports two functions: `setLocale(lang)` and `getText(key, fallback?)`
- Locale data imported as JSON objects (no dynamic loading)
- No support for variable interpolation; use string concatenation if dynamic values needed
- Default locale is 'en' if unset

**API:**

**setLocale(lang: 'en' | 'ko')**
- Changes global locale for subsequent getText() calls
- Called at app startup or when user changes language preference
- No validation error if language not supported; silently ignores invalid locales

**getText(key: string, fallback?: string): string**
- Retrieves message by dot-notation key (e.g., 'app.title', 'home.review')
- Returns string from current locale's JSON object
- If key not found, returns fallback (or key itself if no fallback provided)
- No pluralization or formatting; plain string lookup

**Locale JSON Structure:**
- Keys use dot notation for namespacing (e.g., 'app', 'home', 'review', 'error.validation')
- Values are plain strings (no variable placeholders)
- Both en.json and ko.json must have identical key structures (to avoid missing translations)

### Common Patterns

**Initialization (CLI/Web):**
```typescript
import { setLocale, getText } from '@codeagora/shared/i18n/index.js';

// At startup
const userLang = process.env.LANG?.split('_')[0] ?? 'en';
if (userLang === 'ko') {
  setLocale('ko');
}
```

**String Retrieval:**
```typescript
import { getText } from '@codeagora/shared/i18n/index.js';

const title = getText('app.title');  // Returns 'CodeAgora' (en) or '코드아고라' (ko)
const subtitle = getText('app.subtitle', 'Multi-LLM Code Review');
```

**Dynamic Strings (No Interpolation):**
```typescript
// Instead of: getText('welcome', `Welcome ${name}`)
// Use:
const welcomeTemplate = getText('messages.welcome');  // "Welcome %s"
const greeting = welcomeTemplate.replace('%s', name);

// Or simpler: just concatenate
const message = getText('messages.review_complete') + ` for ${filename}`;
```

**Command/CLI Usage:**
```typescript
import { getText } from '@codeagora/shared/i18n/index.js';

program
  .command('review')
  .description(getText('commands.review.description'))
  .action(async (options) => {
    console.log(getText('messages.starting_review'));
    // ...
  });
```

**Error Messages:**
```typescript
import { getText } from '@codeagora/shared/i18n/index.js';

if (!config.valid) {
  throw new Error(getText('errors.invalid_config', 'Invalid configuration'));
}
```

### Adding New Messages

1. Add key-value pair to `locales/en.json` first (source of truth)
2. Add corresponding translation to `locales/ko.json`
3. Keys should use dot notation: `section.subsection.message`
4. Avoid nesting too deeply; keep at 2-3 levels
5. Use getText() to retrieve the message at runtime

**Example Addition:**
```json
// locales/en.json
{
  "commands": {
    "newcommand": {
      "description": "Do something useful",
      "success": "Operation completed successfully"
    }
  }
}

// locales/ko.json
{
  "commands": {
    "newcommand": {
      "description": "유용한 작업 수행",
      "success": "작업이 완료되었습니다"
    }
  }
}
```

Then use:
```typescript
getText('commands.newcommand.description');
getText('commands.newcommand.success');
```

### Error Handling

- Missing keys: getText() returns fallback or key name (does not throw)
- Invalid locale: setLocale() silently ignores; keeps current locale
- No validation that en.json and ko.json have matching keys (manual responsibility)

### TypeScript

- Locale parameter is a union type: `'en' | 'ko'`
- No type safety for key lookups (keys are strings, not template literals)
- Consider adding a separate type-safe key enum if localization becomes critical

## Dependencies

### Internal
None — i18n is a standalone module.

### External
- None — pure JSON data and vanilla TypeScript

<!-- MANUAL: -->
