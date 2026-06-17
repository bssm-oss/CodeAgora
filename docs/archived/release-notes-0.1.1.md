# CodeAgora v0.1.1

CodeAgora v0.1.1 is a patch release for the stable `0.1.x` line.

## Highlights

- Hardened Desktop session result loading so `result.json` and `head-verdict.json`
  fallbacks preserve completed verdicts when a post-verdict artifact reports an error.
- Added public decision brief handling for Desktop session detail views, including
  promoted evidence cards and redaction before UI exposure.
- Tightened Desktop provider readiness gating before local review launch.
- Improved Desktop review cancellation by terminating the spawned process group on
  Unix platforms.
- Expanded Desktop WebDriver and visual QA coverage for toast dismissal, decision
  summary copy, and first-viewport preference controls.

## Install

```bash
npm i -g @codeagora/review
agora init
git diff | agora review
```

For MCP clients:

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

For GitHub Actions:

```yaml
- uses: bssm-oss/CodeAgora@v0.1.1
```

## Stable Packages

- `@codeagora/review@0.1.1` is published on npm `latest`.
- `@codeagora/mcp@0.1.1` is published on npm `latest`.
- GitHub Action users can pin `bssm-oss/CodeAgora@v0.1.1`.
- GitHub Release `v0.1.1` is a stable release, not a prerelease.

## Desktop DMG

The release includes a macOS arm64 Desktop DMG:

```txt
https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.1/CodeAgora_0.1.1_aarch64.dmg
```

The Desktop DMG is an unsigned preview build for v0.1.1. It is not Developer ID
signed, not notarized, and does not enable the Tauri updater channel. macOS
Gatekeeper warning is expected.

## Follow-up Scope

Developer ID signing, notarization, stapling, and stable Tauri updater
distribution remain outside this unsigned Desktop preview policy unless a later
release reintroduces those gates with fresh evidence.

**Full changelog:** https://github.com/bssm-oss/CodeAgora/compare/v0.1.0...v0.1.1
