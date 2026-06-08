<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-20 | Updated: 2026-03-20 -->

# config — Configuration Management

## Purpose
Configuration management for CodeAgora review pipeline. Loads config from .ca/config.json or .ca/config.yaml, validates schema, manages credentials, provides templates, handles migrations, and applies mode presets.

## Key Files

| File | Description |
|------|-------------|
| `loader.ts` | Config loader: priority JSON > YAML, validation, caching |
| `validator.ts` | Schema validation: zod schemas for entire config tree |
| `credentials.ts` | Credentials management: loads from ~/.config/codeagora/credentials (0o600) |
| `templates.ts` | Config templates: default configs, starter templates, mode presets |
| `migrator.ts` | Config migration: upgrades old config formats to current version |
| `converter.ts` | Converter: YAML ↔ JSON, normalization |
| `mode-presets.ts` | Mode presets: auto/conservative/aggressive modify reviewer counts |

## Subdirectories
None (configuration utilities)

## For AI Agents

### Working In This Directory

**Key Concepts:**
- **Config Format:** .ca/config.json or .ca/config.yaml (JSON has priority)
- **Validation:** Zod schemas ensure type safety
- **Credentials:** Stored separately in ~/.config/codeagora/credentials (0o600 permissions)
- **Mode Presets:** auto/conservative/aggressive modify behavior
- **Migration:** Handles legacy config formats

**API Entry Point:**
- `loadConfig()` — load and validate config from .ca/ directory
- `normalizeConfig()` — apply defaults and mode presets
- `validateConfig()` — check config schema validity
- `loadCredentials()` — load credentials file

**Config Structure:**
```
{
  version: string,
  mode: 'auto' | 'conservative' | 'aggressive',
  reviewers: [ { model, provider, config: {} } | { auto: true } ],
  moderator: { enabled, supporter_pool },
  head: { enabled, model, provider },
  rules: [ ... ],
  plugins: [ ... ]
}
```

### Testing Requirements

**Loader:**
- JSON config exists and is valid → load successfully
- YAML config exists and is valid → load successfully
- Both JSON and YAML exist → JSON wins (warning emitted)
- No config exists → use defaults or prompt
- Invalid JSON/YAML → error with line number

**Validator:**
- Valid config passes validation
- Missing required fields → error
- Invalid enum values → error
- Type mismatches → error
- Nested schema validation (reviewers, moderator, head, rules)

**Credentials:**
- Load from ~/.config/codeagora/credentials
- Parse JSON/YAML
- Validate permissions (0o600 expected, warn if not)
- Merge with config-provided credentials
- Secrets not logged or printed

**Templates:**
- Starter templates generate valid config
- Mode presets apply correctly (reviewer count changes)
- Custom templates load from file

**Migration:**
- Upgrade v1 → v2 config format
- Preserve all settings during upgrade
- Log migration details
- Fallback to defaults for unknown fields

**Integration:**
- Load config → normalize → validate → ready for pipeline

### Common Patterns

**Config Loading Flow:**
1. Check .ca/config.json exists
2. If not, check .ca/config.yaml / .ca/config.yml
3. If not, use defaults or prompt user
4. Parse JSON/YAML
5. Validate with zod schema
6. Apply migrations if needed
7. Load credentials from ~/.config/codeagora/credentials
8. Merge credentials into config
9. Apply mode presets (auto/conservative/aggressive)
10. Cache for session duration

**Credential Handling:**
```
credentials = {
  openai_api_key: process.env.OPENAI_API_KEY,
  anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  openrouter_api_key: process.env.OPENROUTER_API_KEY,
  opencode_api_key: process.env.OPENCODE_API_KEY,
  groq_api_key: process.env.GROQ_API_KEY,
}
```

**Mode Preset Logic:**
- `auto` (default): balanced (5 reviewers)
- `conservative`: strict (7-10 reviewers, higher threshold)
- `aggressive`: fast (2-3 reviewers, lower threshold)

**Validation Pattern:**
```typescript
const config = validateConfig(parsed);
if (!config.success) {
  throw new ConfigError(config.error.message);
}
return config.data;
```

**Config Caching:**
- Loaded once per session
- Cached in SessionManager
- Reused across multiple pipeline runs
- Can be reloaded if .ca/config.* changes

## Dependencies

### Internal (Core)
- `types/config.ts` — all config type definitions
- `@codeagora/shared` — fs utilities, CA_ROOT constant

### External
- `zod` — schema validation
- `yaml` — YAML parsing
- Node.js `fs/promises` — file operations
- Node.js `path` — path manipulation
- Node.js `os` — home directory detection

<!-- MANUAL: -->
