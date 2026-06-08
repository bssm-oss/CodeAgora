import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const cargoToml = fs.readFileSync('packages/desktop/src-tauri/Cargo.toml', 'utf-8');
const rustMain = fs.readFileSync('packages/desktop/src-tauri/src/main.rs', 'utf-8');
const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
  scripts: Record<string, string>;
};
const desktopPackage = JSON.parse(fs.readFileSync('packages/desktop/package.json', 'utf-8')) as {
  scripts: Record<string, string>;
};
const webdriverScript = fs.readFileSync('packages/desktop/scripts/macos-webdriver-e2e.mjs', 'utf-8');

describe('desktop WebDriver automation security boundary', () => {
  it('keeps the macOS WebDriver bridge behind an explicit optional Cargo feature', () => {
    expect(cargoToml).toContain('webdriver-automation = ["dep:tauri-plugin-webdriver-automation"]');
    expect(cargoToml).toContain('tauri-plugin-webdriver-automation = { version = "0.1.3", optional = true }');
    expect(rustMain).toContain('#[cfg(all(debug_assertions, feature = "webdriver-automation"))]');
    expect(rustMain).toContain('std::env::var("CODEAGORA_DESKTOP_WEBDRIVER").as_deref() == Ok("1")');
    expect(rustMain).toContain('tauri_plugin_webdriver_automation::init()');
  });

  it('does not enable the WebDriver feature in release build or desktop RC bundle scripts', () => {
    expect(desktopPackage.scripts['tauri:build']).toBe('tauri build');
    expect(desktopPackage.scripts['bundle:smoke']).not.toContain('webdriver-automation');
    expect(rootPackage.scripts['rc:desktop-gate']).toContain('macos:webdriver-e2e');
    expect(rootPackage.scripts['rc:desktop-gate']).not.toContain('--features webdriver-automation');

    expect(desktopPackage.scripts['macos:webdriver-e2e']).toContain('tauri build --debug --features webdriver-automation');
    expect(rootPackage.scripts['desktop:macos-webdriver-e2e']).toContain('macos:webdriver-e2e');
  });

  it('keeps the local WebDriver E2E runner debug-only and loopback-scoped', () => {
    expect(webdriverScript).toContain("process.platform !== 'darwin'");
    expect(webdriverScript).toContain("target', 'debug', 'codeagora-desktop'");
    expect(webdriverScript).toContain("CODEAGORA_DESKTOP_WEBDRIVER: '1'");
    expect(webdriverScript).toContain('http://127.0.0.1:');
    expect(webdriverScript).not.toContain('0.0.0.0');
  });

  it('keeps WebDriver markers out of an existing release binary', () => {
    const releaseBinary = 'packages/desktop/src-tauri/target/release/codeagora-desktop';
    if (!fs.existsSync(releaseBinary)) return;

    const result = spawnSync('strings', [releaseBinary], { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('tauri_plugin_webdriver_automation');
    expect(result.stdout).not.toContain('tauri-plugin-webdriver-automation');
    expect(result.stdout).not.toContain('CODEAGORA_DESKTOP_WEBDRIVER');
  });
});
