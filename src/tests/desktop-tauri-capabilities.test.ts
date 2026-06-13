import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Capability = {
  identifier: string;
  description?: string;
  windows?: string[];
  permissions?: Array<string | { identifier?: string; allow?: unknown; deny?: unknown }>;
};

type TauriWindow = {
  label?: string;
  title?: string;
};

const CAPABILITY_PATH = 'packages/desktop/src-tauri/capabilities/default.json';
const CAPABILITY_DIR = 'packages/desktop/src-tauri/capabilities';
const TAURI_CONFIG_PATH = 'packages/desktop/src-tauri/tauri.conf.json';
const RUST_MAIN_PATH = 'packages/desktop/src-tauri/src/main.rs';
const BRIDGE_PATH = 'packages/desktop/src/api/desktop-bridge.ts';

const REQUIRED_CAPABILITY_PERMISSIONS = [
  'core:default',
  'dialog:allow-open',
  'mcp-bridge:default',
  'notification:default',
  'window-state:default',
];

const DISALLOWED_PERMISSION_PREFIXES = [
  'clipboard:',
  'fs:',
  'global-shortcut:',
  'http:',
  'opener:',
  'os:',
  'process:',
  'shell:',
  'sql:',
  'store:',
  'upload:',
  'websocket:',
];

const EXPECTED_DESKTOP_COMMANDS = [
  'cancel_review_run',
  'export_session',
  'get_command_contract',
  'get_evidence_status',
  'get_github_action_status',
  'get_live_doctor_status',
  'get_mcp_status',
  'get_provider_status',
  'get_repo_info',
  'get_review_run',
  'get_session_detail',
  'list_sessions',
  'open_external_link',
  'open_repository',
  'read_config',
  'run_review',
  'set_notification_preferences',
  'start_review_run',
  'validate_config',
  'write_config',
];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function extractBridgeCommands(source: string): string[] {
  const commands = new Set<string>();
  for (const match of source.matchAll(/tauriCall<[^>]+>\('([^']+)'/g)) {
    commands.add(match[1]);
  }
  return sorted(commands);
}

function extractDirectPluginInvokes(source: string): string[] {
  const commands = new Set<string>();
  for (const match of source.matchAll(/invoke<[^>]+>\('([^']+)'/g)) {
    commands.add(match[1]);
  }
  return sorted(commands);
}

function extractGenerateHandlerCommands(source: string): string[] {
  const handler = source.match(/tauri::generate_handler!\[\s*([\s\S]*?)\s*\]/);
  expect(handler?.[1]).toBeDefined();
  return sorted(handler?.[1].match(/[a-z][a-z0-9_]+/g) ?? []);
}

function extractTauriCommandFns(source: string): string[] {
  const commands = new Set<string>();
  for (const match of source.matchAll(/#\[tauri::command\]\s*fn\s+([a-z][a-z0-9_]*)/g)) {
    commands.add(match[1]);
  }
  return sorted(commands);
}

function extractCommandContractNames(source: string): string[] {
  const contracts = source.match(/fn desktop_command_contracts\(\)[\s\S]*?\n}\n\nfn read_json/);
  expect(contracts?.[0]).toBeDefined();
  const names = new Set<string>();
  for (const match of contracts?.[0].matchAll(/name:\s*"([^"]+)"/g) ?? []) {
    names.add(match[1]);
  }
  return sorted(names);
}

describe('desktop Tauri capability permissions', () => {
  it('keeps one minimal default capability for the main window only', () => {
    const capabilityFiles = fs
      .readdirSync(CAPABILITY_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(CAPABILITY_DIR, file));
    expect(capabilityFiles).toEqual([CAPABILITY_PATH]);

    const capabilities = readJson<Capability[]>(CAPABILITY_PATH);
    expect(capabilities).toHaveLength(1);

    const [capability] = capabilities;
    expect(capability).toMatchObject({
      identifier: 'default',
      windows: ['main'],
    });

    const tauriConfig = readJson<{ app: { windows: TauriWindow[] } }>(TAURI_CONFIG_PATH);
    const configuredWindows = tauriConfig.app.windows.map((windowConfig) => windowConfig.label ?? 'main');
    expect(configuredWindows).toEqual(['main']);
  });

  it('permits only the required Tauri plugin scopes and no broad native surfaces', () => {
    const [capability] = readJson<Capability[]>(CAPABILITY_PATH);
    const permissions = capability.permissions ?? [];
    const permissionIds = permissions.map((permission) =>
      typeof permission === 'string' ? permission : permission.identifier ?? '',
    );

    expect(sorted(permissionIds)).toEqual(sorted(REQUIRED_CAPABILITY_PERMISSIONS));
    expect(permissions.every((permission) => typeof permission === 'string')).toBe(true);
    expect(permissionIds.filter((permission) => permission.endsWith(':default'))).toEqual([
      'core:default',
      'mcp-bridge:default',
      'notification:default',
      'window-state:default',
    ]);
    expect(permissionIds).not.toContain('dialog:default');
    expect(permissionIds).not.toContain('core:window:allow-create');
    expect(permissionIds).not.toContain('core:webview:allow-create-webview-window');
    for (const prefix of DISALLOWED_PERMISSION_PREFIXES) {
      expect(permissionIds.filter((permission) => permission.startsWith(prefix))).toEqual([]);
    }
  });

  it('keeps frontend bridge commands aligned with the registered Rust command handler', () => {
    const rustMain = fs.readFileSync(RUST_MAIN_PATH, 'utf-8');
    const bridge = fs.readFileSync(BRIDGE_PATH, 'utf-8');

    expect(extractBridgeCommands(bridge)).toEqual(EXPECTED_DESKTOP_COMMANDS);
    expect(extractTauriCommandFns(rustMain)).toEqual(EXPECTED_DESKTOP_COMMANDS);
    expect(extractGenerateHandlerCommands(rustMain)).toEqual(EXPECTED_DESKTOP_COMMANDS);
    expect(extractCommandContractNames(rustMain)).toEqual(EXPECTED_DESKTOP_COMMANDS);
  });

  it('requires capability permissions only for plugins that are actually wired', () => {
    const rustMain = fs.readFileSync(RUST_MAIN_PATH, 'utf-8');
    const bridge = fs.readFileSync(BRIDGE_PATH, 'utf-8');

    expect(extractDirectPluginInvokes(bridge)).toEqual(['plugin:dialog|open']);
    expect(rustMain).toContain('tauri_plugin_dialog::init()');
    expect(rustMain).toContain('tauri_plugin_mcp_bridge::init()');
    expect(rustMain).toContain('tauri_plugin_notification::init()');
    expect(rustMain).toContain('tauri_plugin_window_state::Builder::new().build()');
    expect(rustMain).not.toContain('tauri_plugin_shell');
    expect(rustMain).not.toContain('tauri_plugin_fs');
  });
});
