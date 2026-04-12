# FAQ

## General

### What is CodeAgora?
A CLI tool where multiple AI models collaboratively review your code. Reviewers run in parallel, debate conflicting opinions, and a head agent makes the final verdict (ACCEPT / REJECT / NEEDS_HUMAN).

### Is it free?
CodeAgora itself is free and open-source (MIT). You need API keys for LLM providers. [Groq](https://groq.com) offers a free tier that works out-of-the-box.

### Which providers are supported?
24+ API providers (OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral, etc.) and 12+ CLI tools (Claude Code, Copilot, Codex, etc.). See [PROVIDERS.md](PROVIDERS.md) for the full list.

## Reviews

### What's the difference between ACCEPT, REJECT, and NEEDS_HUMAN?
- **ACCEPT**: No critical issues found. Safe to merge.
- **REJECT**: High-confidence critical issues detected. Fix before merging.
- **NEEDS_HUMAN**: Low-confidence critical findings or unresolved debates. A human should verify.

### Can I customize which models review my code?
Yes. Edit `.ca/config.json` or run `agora init` to select providers/models. You can also use `--provider` and `--model` flags per-review.

### What are specialist personas?
Built-in review focus areas: `builtin:security` (OWASP), `builtin:logic` (race conditions, null checks), `builtin:api-contract` (breaking changes), `builtin:general` (maintainability). Assign them to reviewers in your config.

### What is the "head" agent?
The L3 head agent makes the final ACCEPT/REJECT/NEEDS_HUMAN verdict based on all reviewer findings and debate outcomes. If the LLM-based head fails, a rule-based fallback is used automatically.

### How do I see past reviews?
- CLI: `agora sessions` to list, `agora sessions show <date>/<id>` for details
- Web: `agora dashboard` opens the web UI with full session history
- Replay: `agora replay <date>/<id>` to re-render a past review

## Configuration

### Where is the config file?
`.ca/config.json` (or `.ca/config.yaml`) in your project root. Created by `agora init`.

### Can I use YAML instead of JSON?
Yes. CodeAgora supports both `.ca/config.json` and `.ca/config.yaml`. JSON takes precedence if both exist.

### How do I change the number of reviewers?
In config: set `reviewers.count`. Or per-review: `agora review --reviewers 5`.

## Integration

### Can I use CodeAgora with GitHub Enterprise?
Yes, set `GITHUB_TOKEN` for your GHE instance. The PR diff fetching uses `gh` CLI which supports GHE.

### Can I use it in a monorepo?
Yes. CodeAgora detects project context (package.json, tsconfig.json) to reduce false positives across package boundaries.

### Does it work with non-TypeScript projects?
Yes. The review pipeline works with any language. TypeScript diagnostics (pre-analysis) are skipped for non-TS projects automatically.
