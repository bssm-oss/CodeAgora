import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = readJson('package.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const capabilities = readJson('src-tauri/capabilities/default.json');
const cargoToml = readText('src-tauri/Cargo.toml');
const main = readText('src-tauri/src/main.rs');

assert(fs.existsSync(path.join(root, 'dist/index.html')), 'dist/index.html is missing');
assert(fs.existsSync(path.join(root, 'dist/main.js')), 'dist/main.js is missing');
assert(fs.existsSync(path.join(root, 'dist/styles.css')), 'dist/styles.css is missing');
assert(fs.existsSync(path.join(root, 'scripts/visual-qa.mjs')), 'desktop visual QA script is missing');
assert(
  packageJson.scripts?.['macos:webdriver-e2e']?.includes('tauri build --debug --features webdriver-automation'),
  'macOS WebDriver E2E must build a debug .app bundle with webdriver automation enabled',
);

const builtJs = readText('dist/main.js');
const builtCss = readText('dist/styles.css').toLowerCase();
assert(!builtJs.includes('from "@tauri-apps/api/'), 'Built JS must bundle @tauri-apps/api imports for the Tauri webview');
assert(!builtJs.includes("from '@tauri-apps/api/"), 'Built JS must bundle @tauri-apps/api imports for the Tauri webview');
assert(builtCss.includes('#191a51'), 'Built CSS is missing logo navy #191A51');
assert(builtCss.includes('#05a6b9'), 'Built CSS is missing logo cyan #05A6B9');

assert(tauriConfig.version === packageJson.version, 'Tauri config version does not match package version');
assert(tauriConfig.productName === 'CodeAgora', 'Unexpected Tauri product name');
assert(tauriConfig.app?.withGlobalTauri === true, 'Tauri global API must be enabled for the MCP bridge');
assert(typeof tauriConfig.app?.security?.csp === 'string' && tauriConfig.app.security.csp.includes("default-src 'self'"), 'Tauri CSP must be enabled for desktop RC gates');
assert(capabilities[0]?.permissions?.includes('mcp-bridge:default'), 'MCP bridge permission is missing');
assert(cargoToml.includes('tauri-plugin-mcp-bridge'), 'MCP bridge dependency is missing from Cargo.toml');
assert(main.includes('tauri_plugin_mcp_bridge::init()'), 'MCP bridge plugin is not registered');
assert(main.includes('#[cfg(debug_assertions)]'), 'MCP bridge must remain debug-build only');
assert(main.includes('tauri_plugin_webdriver_automation::init()'), 'WebDriver automation plugin is not registered');

const requiredCommands = [
  'open_repository',
  'get_repo_info',
  'list_sessions',
  'get_session_detail',
  'export_session',
  'start_review_run',
  'get_review_run',
  'cancel_review_run',
  'read_config',
  'validate_config',
  'write_config',
  'get_provider_status',
  'get_mcp_status',
  'get_github_action_status',
  'get_evidence_status',
];

for (const command of requiredCommands) {
  assert(main.includes(command), `Tauri command is missing from bridge: ${command}`);
}

console.log(`CodeAgora desktop smoke passed (${packageJson.version})`);
