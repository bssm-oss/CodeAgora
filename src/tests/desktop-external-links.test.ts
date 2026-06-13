import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

type WindowShim = typeof globalThis & {
  window?: Window & typeof globalThis;
};

function installWindow(options: { tauri?: boolean } = {}): { openMock: ReturnType<typeof vi.fn> } {
  const openMock = vi.fn();
  (globalThis as WindowShim).window = {
    ...(options.tauri ? { __TAURI_INTERNALS__: { invoke: invokeMock } } : {}),
    location: { pathname: '/packages/desktop/' },
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage,
    open: openMock,
  } as unknown as Window & typeof globalThis;
  return { openMock };
}

async function importBridge() {
  return import('../../packages/desktop/src/api/desktop-bridge.ts');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete (globalThis as WindowShim).window;
});

describe('desktop external link bridge', () => {
  it('opens Tauri links only through the approved native external-open command', async () => {
    const { openMock } = installWindow({ tauri: true });
    invokeMock.mockResolvedValueOnce(true);
    const bridge = await importBridge();

    await bridge.openExternalLink('https://github.com/bssm-oss/CodeAgora');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.slice(0, 2)).toEqual(['open_external_link', {
      url: 'https://github.com/bssm-oss/CodeAgora',
    }]);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe and unsupported schemes before invoking any opener path', async () => {
    const { openMock } = installWindow({ tauri: true });
    const bridge = await importBridge();

    for (const url of [
      'http://github.com/bssm-oss/CodeAgora',
      'mailto:security@example.com',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<h1>x</h1>',
      'tauri://localhost/settings',
      'https://user@example.com/private',
    ]) {
      await expect(bridge.openExternalLink(url)).rejects.toThrow('Unsupported external link URL');
    }

    expect(invokeMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does not open links directly in browser-preview fallback', async () => {
    const { openMock } = installWindow();
    const bridge = await importBridge();

    await expect(bridge.openExternalLink('https://codeagora.dev/docs')).rejects.toThrow(
      'requires the CodeAgora Desktop shell',
    );
    await expect(bridge.openExternalLink('javascript:alert(1)')).rejects.toThrow(
      'Unsupported external link URL',
    );

    expect(openMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('desktop external link UI routing', () => {
  it('routes anchor clicks through the bridge instead of direct WebView navigation', () => {
    const source = fs.readFileSync('packages/desktop/src/main.ts', 'utf-8');
    const bridge = fs.readFileSync('packages/desktop/src/api/desktop-bridge.ts', 'utf-8');

    expect(source).toContain('function onExternalLinkClick(event: MouseEvent): void');
    expect(source).toContain('isApprovedExternalUrl(anchor.href)');
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('openExternalLink(anchor.href)');
    expect(source).toContain("window.addEventListener('click', onExternalLinkClick)");
    expect(source).not.toContain('window.open(');
    expect(bridge).not.toContain('window.open(');
    expect(source).not.toContain('location.href =');
  });
});
