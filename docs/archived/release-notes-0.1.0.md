# CodeAgora v0.1.0

CodeAgora v0.1.0 is the first stable release line for the CLI, GitHub Action,
MCP server, and Desktop app surface.

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
- uses: bssm-oss/CodeAgora@v0.1.0
```

## Stable Packages

- `@codeagora/review@0.1.0` is published on npm `latest`.
- `@codeagora/mcp@0.1.0` is published on npm `latest`.
- GitHub Action users can pin `bssm-oss/CodeAgora@v0.1.0`.
- GitHub Release `v0.1.0` is a stable release, not a prerelease.

## Desktop DMG

The release includes a macOS arm64 Desktop DMG:

```txt
https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0/CodeAgora_0.1.0_aarch64.dmg
```

The Desktop DMG is an unsigned preview build for v0.1.0. It is not Developer ID
signed, not notarized, and does not enable the Tauri updater channel. macOS
Gatekeeper warning is expected.

## Evidence

- Release workflow: https://github.com/bssm-oss/CodeAgora/actions/runs/27674620478
- Evidence artifact: `release-evidence-v0.1.0`
- Release assets:
  - `CodeAgora_0.1.0_aarch64.dmg`
  - `desktop-unsigned-dmg-evidence.json`
  - `desktop-unsigned-dmg-gate.log`
  - `evidence-manifest.json`

## Follow-up Scope

Developer ID signing, notarization, stapling, stable Tauri updater distribution,
and Vercel production deployment verification are tracked as follow-up work and
are not claimed by the v0.1.0 unsigned Desktop preview.

**Full changelog:** https://github.com/bssm-oss/CodeAgora/compare/v0.1.0-rc.5...v0.1.0
