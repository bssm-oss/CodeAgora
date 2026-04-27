<!-- Parent: AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# npm Package Restart Plan

## Decision

CodeAgora will stop treating the existing `codeagora@2.x` package line as the future product line.

The current package line becomes legacy:

```txt
codeagora@2.x
```

The new product line starts over at `0.x` under a clearer package name:

```txt
@codeagora/review@0.x
```

The CLI binary names should remain stable:

```txt
codeagora
agora
```

So the install command changes, but the command users run can stay familiar:

```bash
npm i -g @codeagora/review
agora review
```

## Why Change the Package Link

The old `codeagora` package carried the expectations of the broader v2 platform:

- CLI
- GitHub Action
- MCP
- web dashboard
- terminal TUI
- Discord/Slack/generic webhook notifications
- multiple optional npm packages

The new direction is narrower:

- CLI for agents, scripts, and power users
- GitHub Action for PR automation
- MCP for agent/IDE integration
- Tauri desktop app for human local UI

That is enough of a product reset that keeping the old package line as `codeagora@3.0.0` would imply more continuity than we want.

Starting `@codeagora/review@0.x` says the quiet part clearly:

> This is the review-focused product line being reshaped from the CodeAgora core ideas.

## Package Map

Legacy:

```txt
codeagora@2.x
@codeagora/web
@codeagora/tui
@codeagora/notifications
```

New line:

```txt
@codeagora/review@0.x
@codeagora/mcp@0.x
@codeagora/desktop@0.x    # future Tauri app
```

`@codeagora/review` should own the CLI and GitHub Action distribution.

`@codeagora/mcp` can remain separate because MCP has a distinct install target and runtime shape.

`@codeagora/desktop` should be added when the Tauri app is ready to package.

## Versioning

Recommended sequence:

```txt
@codeagora/review@0.1.0-alpha.0  first package rename / surface cleanup prerelease
@codeagora/review@0.1.0-alpha.1  desktop scaffold and docs
@codeagora/review@0.1.0-beta.0   CLI/GitHub/MCP stabilization
@codeagora/review@0.1.0          first public review-focused release
@codeagora/review@0.2.0          desktop MVP
@codeagora/review@0.3.0          opencode / agent workflow expansion
@codeagora/review@1.0.0          stable API/CLI/desktop contract
```

The old `codeagora` package should not continue with normal feature releases after the final legacy release.

## Dist Tags

Publish the new package conservatively first:

```bash
npm publish --tag next
```

After the new package is ready to become the default recommendation:

```bash
npm dist-tag add @codeagora/review@0.1.0 latest
```

For old packages:

```bash
npm dist-tag add codeagora@2.3.4 legacy
```

Use the actual final legacy version if it is not `2.3.4`.

## Deprecation Messages

When the new package is available, deprecate retired packages:

```bash
npm deprecate @codeagora/web@"*" "Legacy package: replaced by the upcoming CodeAgora desktop app."
npm deprecate @codeagora/tui@"*" "Legacy package: replaced by the upcoming CodeAgora desktop app."
npm deprecate @codeagora/notifications@"*" "Legacy package: notification features are being consolidated into the desktop app."
```

Prefer waiting to deprecate `codeagora@2.x` until `@codeagora/review` is available:

```bash
npm deprecate codeagora@"<3" "Legacy package line. New review-focused package: npm i -g @codeagora/review"
```

## Final Legacy Release Note

The final `codeagora` release should say:

```md
CodeAgora 2.x is now the legacy package line.

The project is restarting its npm distribution under `@codeagora/review@0.x`,
focused on CLI, GitHub Actions, MCP, and a future Tauri desktop app.

Retired surfaces:
- `@codeagora/web`
- `@codeagora/tui`
- `@codeagora/notifications`
- `agora dashboard`
- `agora tui`
- `agora notify`
- `agora review --notify`

New install path:

`npm i -g @codeagora/review`
```

## Release Workflow Implication

Before publishing the new line, update package metadata:

```json
{
  "name": "@codeagora/review",
  "version": "0.1.0-alpha.0",
  "bin": {
    "codeagora": "./packages/cli/dist/index.js",
    "agora": "./packages/cli/dist/index.js"
  }
}
```

The GitHub Action branding should also move from the old `codeagora` package assumption to the new review-focused package line.

