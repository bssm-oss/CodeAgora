import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistry } from '../plugins/registry.js';
import { loadThirdPartyPlugins } from '../plugins/loader.js';
import fs from 'fs/promises';

vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('loadThirdPartyPlugins', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = new PluginRegistry();
  });

  it('should return empty result when plugin dir does not exist', async () => {
    mockFs.readdir.mockRejectedValue(new Error('ENOENT'));
    const result = await loadThirdPartyPlugins(registry, '/nonexistent');
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('should skip non-directory entries', async () => {
    mockFs.readdir.mockResolvedValue(['file.txt'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
    mockFs.stat.mockResolvedValue({ isDirectory: () => false } as Awaited<ReturnType<typeof fs.stat>>);
    const result = await loadThirdPartyPlugins(registry, '/plugins');
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});
