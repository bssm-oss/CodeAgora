# Configuration

CodeAgora reads `.ca/config.json`, `.ca/config.yaml`, or `.ca/config.yml` from the current working directory.

If multiple config files exist, load precedence is `config.json` > `config.yaml` > `config.yml`. Run `agora init` to generate a starter config, or create one manually.

> **Current schema quick map**
>
> | Section | Purpose |
> |---|---|
> | `reviewers` | L1 reviewer pool |
> | `supporters` | L2 supporters, including `pool`, `pickCount`, and `devilsAdvocate` |
> | `moderator` / `head` | L2/L3 moderation and final verdict agent |
> | `discussion` | Debate rounds and severity thresholds |
> | `errorHandling` | Retry / forfeiture behavior |
> | `reviewContext` | Extra project context passed into reviews |
>
> YAML and JSON both map to the same schema; when both exist, `config.json` wins, then `config.yaml`, then `config.yml`.

## Example Config

```json
{
  "reviewers": [
    { "id": "r-mimo", "model": "xiaomi/mimo-v2.5", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-nemotron-super", "model": "nvidia/nemotron-3-super-120b-a12b", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-hy3", "model": "tencent/hy3-preview", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-deepseek-flash", "model": "deepseek/deepseek-v4-flash", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    { "id": "r-llama-scout", "model": "meta-llama/llama-4-scout", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 }
  ],
  "supporters": {
    "pool": [
      { "id": "s-glm", "model": "z-ai/glm-5.1", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
      { "id": "s-minimax", "model": "minimax/minimax-m3", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 }
    ],
    "pickCount": 2,
    "pickStrategy": "random",
    "devilsAdvocate": { "id": "da-grok", "model": "x-ai/grok-4.3", "backend": "api", "provider": "openrouter", "enabled": true, "timeout": 180 },
    "personaPool": [".ca/personas/strict.md"],
    "personaAssignment": "random"
  },
  "moderator": {
    "model": "openai/gpt-5.3-codex",
    "backend": "api",
    "provider": "openrouter",
    "timeout": 180
  },
  "discussion": {
    "maxRounds": 2,
    "registrationThreshold": {
      "HARSHLY_CRITICAL": 1,
      "CRITICAL": 1,
      "WARNING": 2,
      "SUGGESTION": null
    },
    "codeSnippetRange": 10
  },
  "head": {
    "backend": "api",
    "model": "qwen/qwen3.7-max",
    "provider": "openrouter",
    "enabled": true,
    "timeout": 180
  },
  "errorHandling": {
    "maxRetries": 2,
    "forfeitThreshold": 0.7
  }
}
```

## Key Fields

**`reviewers`** — L1 reviewer agents. Use different OpenRouter models for heterogeneous coverage.

**`supporters.pool`** — L2 agents that validate issues during discussion.

**`supporters.devilsAdvocate`** — Agent that argues against the majority to surface overlooked counterarguments.

**`supporters.personaPool`** — Markdown files describing reviewer personas (e.g., strict, pragmatic, security-focused). Assigned randomly or round-robin.

**`head`** — L3 Head agent config. When set, uses LLM to evaluate reasoning quality instead of rule-based counting.

**`discussion.registrationThreshold`** — Controls which severity levels trigger a discussion round:
- `HARSHLY_CRITICAL: 1` — one reporter is enough
- `CRITICAL: 1` — one reporter with supporter agreement
- `WARNING: 2` — requires at least two reporters
- `SUGGESTION: null` — skips discussion, goes to `suggestions.md`

**`errorHandling.forfeitThreshold`** — If this fraction of reviewers fail, the pipeline aborts. Default `0.7` means the pipeline continues as long as 30% of reviewers succeed.

## `reviewContext`

The `reviewContext` field provides additional context to guide the review process:

```json
{
  "reviewContext": {
    "deploymentType": "production",
    "notes": "Auth module refactoring in progress",
    "bundledOutputs": true,
    "pathRules": {
      "src/auth/**": "builtin:security",
      "src/api/**": "builtin:api-contract"
    },
    "verifySuggestions": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deploymentType` | `string` | Deployment context: `"production"`, `"staging"`, `"internal"` |
| `notes` | `string` | Free-text notes passed to reviewers as project context |
| `bundledOutputs` | `boolean` | Whether to include bundled outputs in review |
| `pathRules` | `object` | Glob-to-persona mapping for path-specific specialist review |
| `verifySuggestions` | `boolean` | Enable tsc transpile check on CRITICAL+ suggestions |

## Specialist Personas

Assign built-in specialist personas to reviewers:

```json
{
  "reviewers": [
    { "id": "r-deepseek-flash", "model": "deepseek/deepseek-v4-flash", "backend": "api", "provider": "openrouter", "persona": "builtin:security" },
    { "id": "r-nemotron-super", "model": "nvidia/nemotron-3-super-120b-a12b", "backend": "api", "provider": "openrouter", "persona": "builtin:logic" },
    { "id": "r-hy3", "model": "tencent/hy3-preview", "backend": "api", "provider": "openrouter", "persona": "builtin:api-contract" },
    { "id": "r-mimo", "model": "xiaomi/mimo-v2.5", "backend": "api", "provider": "openrouter", "persona": "builtin:general" }
  ]
}
```

Available built-in personas:
- `builtin:security` — Focuses on security vulnerabilities, injection attacks, auth issues
- `builtin:logic` — Focuses on logic errors, race conditions, edge cases
- `builtin:api-contract` — Focuses on API contract violations, breaking changes, type mismatches
- `builtin:general` — Balanced general-purpose review

## `.reviewrules`

Create a `.reviewrules` file for custom review rules. Supports a `suggestion` field:

```yaml
rules:
  - name: no-any-type
    description: "Avoid using 'any' type"
    severity: WARNING
    suggestion: "Use unknown or a specific type instead"
  - name: require-error-handling
    description: "All async functions must have error handling"
    severity: CRITICAL
```

## External AI Rule Files

CodeAgora automatically detects and includes external AI rule files from the project root:
- `.cursorrules` — Cursor editor rules
- `CLAUDE.md` — Claude Code instructions
- `copilot-instructions.md` — GitHub Copilot instructions

These are injected into reviewer context automatically. No configuration needed.

## Built-in Artifact Exclusion

The following patterns are excluded from review by default (no configuration needed):
- `dist/` directories
- Lock files (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`)
- Minified files (`*.min.js`, `*.min.css`)

## `.reviewignore`

Place a `.reviewignore` file in your project root to exclude additional files from review. Uses `.gitignore` syntax:

```
dist/**
*.min.js
coverage/**
tests/fixtures/**
```

## CLI Config Commands

```bash
agora config                           # Display loaded config
agora config-set discussion.maxRounds 3 # Set value in .ca/config.json (dot notation)
agora config-edit                      # Open config in $EDITOR
agora language ko                      # Switch to Korean
```

`agora config-set` currently mutates `.ca/config.json` only. If the active config is YAML, edit it manually or convert it to JSON before using `config-set`.
