# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Email the maintainers or use [GitHub Security Advisories](https://github.com/justn-hyeok/CodeAgora/security/advisories/new)
3. Include steps to reproduce and potential impact

We will respond within 48 hours and work on a fix.

## API Key Safety

- API keys are stored in `~/.config/codeagora/credentials` (user home directory, not in project)
- Never commit API keys to git
- The `.env` file in project root is gitignored
- Use `agora doctor` to verify your setup

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | No        |
| < 1.0   | No        |
