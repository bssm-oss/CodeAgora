# CodeAgora v0.1.2

CodeAgora v0.1.2 is a patch release for the stable `0.1.x` line.

## Highlights

- Ships the landing page social preview as a raster PNG so Korean text renders
  correctly in Open Graph and chat preview clients.
- Keeps production landing metadata aligned with the stable package version and
  GitHub Action reference.
- Preserves the v0.1.1 Desktop distribution policy: macOS arm64 unsigned preview
  DMG, with Developer ID signing, notarization, stapling, and updater
  distribution still outside this patch release.

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
- uses: bssm-oss/CodeAgora@v0.1.2
```

## Stable Packages

- `@codeagora/review@0.1.2` is published on npm `latest`.
- `@codeagora/mcp@0.1.2` is published on npm `latest`.
- GitHub Action users can pin `bssm-oss/CodeAgora@v0.1.2`.
- GitHub Release `v0.1.2` is a stable release, not a prerelease.

## Desktop DMG

The release includes a macOS arm64 Desktop DMG:

```txt
https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.2/CodeAgora_0.1.2_aarch64.dmg
```

The Desktop DMG is an unsigned preview build for v0.1.2. It is not Developer ID
signed, not notarized, and does not enable the Tauri updater channel. macOS
Gatekeeper warning is expected.

## Follow-up Scope

Developer ID signing, notarization, stapling, and stable Tauri updater
distribution remain outside this unsigned Desktop preview policy unless a later
release reintroduces those gates with fresh evidence.

**Full changelog:** https://github.com/bssm-oss/CodeAgora/compare/v0.1.1...v0.1.2
