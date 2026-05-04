/**
 * Tests for commands/replay.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSessionForReplay } from '../commands/replay.js';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

vi.mock('@codeagora/shared/utils/path-validation.js', () => ({
  validateDiffPath: vi.fn().mockReturnValue({ success: false }),
}));

async function getFsMock() {
  const fs = await import('fs/promises');
  return fs.default as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    readdir: ReturnType<typeof vi.fn>;
  };
}

describe('loadSessionForReplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for invalid session path format (no slash)', async () => {
    await expect(loadSessionForReplay('/base', 'invalidsession')).rejects.toThrow(
      'Session path must be in YYYY-MM-DD/NNN format',
    );
  });

  it('throws for path traversal in date segment', async () => {
    await expect(loadSessionForReplay('/base', '../evil/001')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('throws for path traversal in id segment', async () => {
    await expect(loadSessionForReplay('/base', '2024-01-15/../evil')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('classifies missing artifacts as legacy best-effort instead of throwing raw errors', async () => {
    const fs = await getFsMock();
    fs.readFile.mockRejectedValue(new Error('ENOENT'));
    fs.readdir.mockRejectedValue(new Error('ENOENT'));

    const result = await loadSessionForReplay('/base', '2024-01-15/001');

    expect(result.decision).toBe('legacy/best-effort');
    expect(result.evidenceDocs).toEqual([]);
    expect(result.diffContent).toBeNull();
  });

  it('returns ReplayResult with decision "unknown" when no head verdict', async () => {
    const fs = await getFsMock();
    // metadata.json succeeds
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'pending' }))
      // head-verdict.json fails
      .mockRejectedValueOnce(new Error('ENOENT'))
      // result.json fails
      .mockRejectedValueOnce(new Error('ENOENT'));
    fs.readdir.mockRejectedValue(new Error('no reviews'));

    const result = await loadSessionForReplay('/base', '2024-01-15/001');
    expect(result.sessionPath).toBe('2024-01-15/001');
    expect(result.decision).toBe('unknown');
    expect(result.evidenceDocs).toEqual([]);
    expect(result.diffContent).toBeNull();
  });

  it('returns correct decision from head verdict', async () => {
    const fs = await getFsMock();
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'done' }))
      .mockResolvedValueOnce(JSON.stringify({ decision: 'APPROVE' }))
      .mockRejectedValueOnce(new Error('no result'));
    fs.readdir.mockRejectedValue(new Error('no reviews'));

    const result = await loadSessionForReplay('/base', '2024-01-15/001');
    expect(result.decision).toBe('APPROVE');
  });

  it('uses result.json summary decision when head verdict is missing', async () => {
    const fs = await getFsMock();
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'completed' }))
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(JSON.stringify({ summary: { decision: 'ACCEPT' }, evidenceDocs: [] }));

    const result = await loadSessionForReplay('/base', '2024-01-15/001');

    expect(result.decision).toBe('ACCEPT');
    expect(result.evidenceDocs).toEqual([]);
  });

  it('returns evidenceDocs from result.json when present', async () => {
    const fs = await getFsMock();
    const evidenceDocs = [{ id: 'doc1', content: 'some content' }];
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'done' }))
      .mockResolvedValueOnce(JSON.stringify({ decision: 'APPROVE' }))
      .mockResolvedValueOnce(JSON.stringify({ evidenceDocs }));

    const result = await loadSessionForReplay('/base', '2024-01-15/001');
    expect(result.evidenceDocs).toEqual(evidenceDocs);
  });

  it('returns null diffContent when diff path validation fails', async () => {
    const fs = await getFsMock();
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ diffPath: '/some/path.diff' }))
      .mockRejectedValueOnce(new Error('no verdict'))
      .mockRejectedValueOnce(new Error('no result'));
    fs.readdir.mockRejectedValue(new Error('no reviews'));

    const result = await loadSessionForReplay('/base', '2024-01-15/001');
    expect(result.diffContent).toBeNull();
  });
});
