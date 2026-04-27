# Troubleshooting

## Setup

### "Config file not found"
Run `agora init` to create a config in `.ca/config.json`.

### "API key not found for provider 'groq'"
1. Get a free key at [console.groq.com/keys](https://console.groq.com/keys)
2. Set it: `export GROQ_API_KEY=your_key_here`
3. Verify: `agora doctor`

Provider environment variable names follow the pattern `PROVIDER_API_KEY` (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`). Run `agora providers` to see all supported providers and their required env vars.

### "doctor passes but review fails with API error"
- Run `agora doctor --live` to test actual API connectivity
- Check if your API key is expired or rate-limited
- Groq free tier has daily limits; try again later or upgrade

### "JSON parse error in .ca/config.json"
Your config file has a syntax error. Options:
1. Edit manually: open `.ca/config.json` in your editor and fix the syntax
2. Regenerate: delete `.ca/` and run `agora init` again
3. Validate: paste your config into [jsonlint.com](https://jsonlint.com)

## Review

### "All reviewers failed"
All configured LLM providers returned errors. Common causes:
- **API keys missing**: Run `agora doctor` to check
- **Network issues**: Check your internet connection
- **Rate limiting**: Wait a few minutes and retry
- **Invalid model**: Check your config for typos in model names

### Empty output (no issues found)
If the diff contains no code changes (only whitespace, comments, or empty), the pipeline returns ACCEPT with "No code changes detected."

### Review takes too long (15+ minutes)
- Use quick mode: `agora review --quick` (L1 only, no debate)
- Reduce reviewers: `agora review --reviewers 2`
- Large diffs are automatically chunked; consider splitting your PR

### "Not in a git repository"
CodeAgora uses git for context-aware reviews. Run from within a git repo, or provide an explicit diff file:
```bash
agora review path/to/my.diff
```

## GitHub Actions

### Fork PR review skipped
Fork PRs don't have access to repository secrets. The review will be skipped with a warning. Options:
1. Ask the maintainer to run the review manually
2. Configure [Actions for forks](https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks)

### "max-diff-lines exceeded"
The PR diff exceeds the configured limit (default: 5000 lines). Options:
1. Split into smaller PRs
2. Increase the limit in your workflow:
   ```yaml
   with:
     max-diff-lines: '10000'
   ```

## MCP Integration

### "CodeAgora MCP not available in Claude Code"
1. Verify your MCP config (`~/.claude/mcp.json`):
   ```json
   {
     "mcpServers": {
       "codeagora": {
         "command": "npx",
         "args": ["-y", "@codeagora/mcp"]
       }
     }
   }
   ```
2. Restart Claude Code
3. Check that `npx @codeagora/mcp` runs without errors

## Exit Codes

| Code | Meaning | CI Action |
|------|---------|-----------|
| 0 | Review command completed and no requested failure gate tripped | Pipeline continues |
| 1 | `--fail-on-reject` or `--fail-on-severity` tripped | Pipeline fails |
| 2 | Setup/input/config error | Fix setup or command arguments |
| 3 | Runtime or pipeline failure | May be transient, retry |
