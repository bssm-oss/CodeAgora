# Providers

CodeAgora supports 24+ API providers and 12 CLI backends. Providers are organized into three tiers.

## Tier 1 — Official

Directly tested, issue response guaranteed.

| Type | Provider | Env Var | Notes |
|------|----------|---------|-------|
| API | Groq | `GROQ_API_KEY` | Free tier available |
| API | Anthropic | `ANTHROPIC_API_KEY` | |
| CLI | Claude Code | `claude` | [claude.ai](https://claude.ai/download) |
| CLI | Gemini CLI | `gemini` | `npm i -g @google/gemini-cli` |
| CLI | Codex CLI | `codex` | `npm i -g @openai/codex` |

## Tier 2 — Verified

Confirmed working, best-effort support.

| Type | Provider | Env Var | Notes |
|------|----------|---------|-------|
| API | OpenAI | `OPENAI_API_KEY` | |
| API | Google | `GOOGLE_API_KEY` | |
| API | DeepSeek | `DEEPSEEK_API_KEY` | |
| API | OpenRouter | `OPENROUTER_API_KEY` | |
| CLI | Copilot CLI | `copilot` | |
| CLI | Cursor CLI | `agent` | [cursor.com](https://cursor.com) |

## Tier 3 — Experimental

Community / experimental. Added but not guaranteed.

| Type | Provider | Env Var |
|------|----------|---------|
| API | NVIDIA NIM | `NVIDIA_API_KEY` |
| API | Mistral | `MISTRAL_API_KEY` |
| API | Cerebras | `CEREBRAS_API_KEY` |
| API | Together | `TOGETHER_API_KEY` |
| API | xAI | `XAI_API_KEY` |
| API | Qwen | `QWEN_API_KEY` |
| API | ZAI | `ZAI_API_KEY` |
| API | GitHub Models | `GITHUB_TOKEN` |
| API | GitHub Copilot | `GITHUB_COPILOT_TOKEN` |
| API | Fireworks AI | `FIREWORKS_API_KEY` |
| API | Cohere | `COHERE_API_KEY` |
| API | DeepInfra | `DEEPINFRA_API_KEY` |
| API | Moonshot (Kimi) | `MOONSHOT_API_KEY` |
| API | Perplexity | `PERPLEXITY_API_KEY` |
| API | Hugging Face | `HUGGINGFACE_API_KEY` |
| API | Baseten | `BASETEN_API_KEY` |
| API | SiliconFlow | `SILICONFLOW_API_KEY` |
| API | Novita AI | `NOVITA_API_KEY` |
| CLI | Aider | `aider` |
| CLI | Goose | `goose` |
| CLI | Cline | `cline` |
| CLI | OpenCode | `opencode` |
| CLI | Qwen Code | `qwen` |
| CLI | Kiro | `kiro-cli` |
| CLI | Vibe | `vibe` |

## API Key Setup

```bash
# Set in environment
export GROQ_API_KEY=your_key_here

# Or store securely (permissions: 0o600)
echo "GROQ_API_KEY=your_key_here" >> ~/.config/codeagora/credentials

# Check what's detected
agora providers
```

`agora init` auto-detects installed CLI tools and available API keys.

## CLI Backends in GitHub Actions

CLI backends such as Claude Code (`claude`) and Codex (`codex`) can run in CI, but CodeAgora does not install or authenticate those CLIs for you. If `.ca/config.json` uses `"backend": "cli"`, install and authenticate the matching CLI before running CodeAgora.

For OAuth-based Claude Code automation in GitHub Actions, use the official Claude Code Action as a companion workflow or step. Its OAuth token is passed to that action, not to CodeAgora directly:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    prompt: |
      Review this PR for correctness, security, and maintainability risks.
```

Use CodeAgora's CLI backend path when the runner already has the CLI installed and authenticated. Use the companion action path when you want Claude Code's own GitHub Action behavior, OAuth handling, tools, and PR automation.
