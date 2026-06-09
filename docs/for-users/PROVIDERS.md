# Providers

CodeAgora supports a curated provider set across API providers and local CLI backends. Providers are organized into support tiers.

## Tier 1 — Official

Directly tested, issue response guaranteed.

| Type | Provider | Env Var | Notes |
|------|----------|---------|-------|
| API | OpenRouter | `OPENROUTER_API_KEY` | Recommended review runtime |
| API | Anthropic | `ANTHROPIC_API_KEY` | |
| API | OpenAI | `OPENAI_API_KEY` | |
| CLI | Claude Code | `claude` | [claude.ai](https://claude.ai/download) |
| CLI | Gemini CLI | `gemini` | `npm i -g @google/gemini-cli` |
| CLI | Codex CLI | `codex` | `npm i -g @openai/codex` |
| CLI | Antigravity CLI | `agy` | [antigravity.google](https://antigravity.google/docs/cli-install) |

## Tier 2 — Verified

Confirmed working, best-effort support.

| Type | Provider | Env Var | Notes |
|------|----------|---------|-------|
| API | Groq | `GROQ_API_KEY` | Fast fallback provider |
| API | OpenCode Go | `OPENCODE_API_KEY` | OpenAI-compatible endpoint at `https://opencode.ai/zen/go/v1` |
| API | OpenCode Zen | `OPENCODE_API_KEY` | OpenAI Responses-compatible endpoint at `https://opencode.ai/zen/v1` |
| CLI | OpenCode | `opencode` | |
| CLI | Copilot CLI | `copilot` | |
| CLI | Cursor CLI | `agent` | [cursor.com](https://cursor.com) |
| CLI | Pi | `pi` | [pi.dev](https://pi.dev/docs/latest) |

## Tier 3 — Experimental

No experimental providers are enabled by default. Unsupported API providers may still be used as custom `backend: "api"` configurations, but they are warnings rather than part of the supported provider list.

## API Key Setup

```bash
# Set in environment
export OPENROUTER_API_KEY=your_key_here

# Or store securely (permissions: 0o600)
echo "OPENROUTER_API_KEY=your_key_here" >> ~/.config/codeagora/credentials

# Check what's detected
agora providers
```

`agora init` auto-detects installed CLI tools and available API keys.
