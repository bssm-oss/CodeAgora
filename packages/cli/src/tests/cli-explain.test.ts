/**
 * Tests for commands/explain.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { explainSession } from '../commands/explain.js';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

async function getFsMock() {
  const fs = await import('fs/promises');
  return fs.default as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    readdir: ReturnType<typeof vi.fn>;
  };
}

describe('explainSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for invalid session path format (no slash)', async () => {
    await expect(explainSession('/base', 'invalidsessionpath')).rejects.toThrow(
      'Session path must be in YYYY-MM-DD/NNN format',
    );
  });

  it('throws for path traversal attempt in date segment', async () => {
    await expect(explainSession('/base', '../evil/001')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('throws for path traversal attempt in id segment', async () => {
    await expect(explainSession('/base', '2024-01-15/../evil')).rejects.toThrow(
      'Path traversal detected',
    );
  });

  it('classifies a missing metadata.json session as legacy best-effort', async () => {
    const fs = await getFsMock();
    fs.readFile.mockRejectedValue(new Error('ENOENT'));
    fs.readdir.mockRejectedValue(new Error('ENOENT'));

    const result = await explainSession('/base', '2024-01-15/001');

    expect(result.narrative).toContain('legacy/best-effort');
    expect(result.narrative).not.toContain('ENOENT');
  });

  it('returns ExplainResult with sessionPath and narrative when session exists', async () => {
    const fs = await getFsMock();
    // metadata.json succeeds
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'approved' }))
      // head-verdict.json
      .mockResolvedValueOnce(JSON.stringify({ decision: 'APPROVE', reasoning: 'Looks good' }));
    // readdir for reviews and discussions
    fs.readdir.mockResolvedValue([]);

    const result = await explainSession('/base', '2024-01-15/001');
    expect(result.sessionPath).toBe('2024-01-15/001');
    expect(typeof result.narrative).toBe('string');
    expect(result.narrative).toContain('2024-01-15/001');
  });

  it('narrative includes decision from head verdict', async () => {
    const fs = await getFsMock();
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'pending' }))
      .mockResolvedValueOnce(JSON.stringify({ decision: 'REQUEST_CHANGES', reasoning: 'Issues found' }));
    fs.readdir.mockResolvedValue([]);

    const result = await explainSession('/base', '2024-01-15/001');
    expect(result.narrative).toContain('REQUEST_CHANGES');
  });

  it('narrative includes reviewer count from reviews directory', async () => {
    const fs = await getFsMock();
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'approved' }))
      .mockRejectedValueOnce(new Error('no verdict')); // head-verdict.json missing
    // reviews dir
    fs.readdir
      .mockResolvedValueOnce(['r1.md', 'r2.md', 'r3.json'])
      // discussions dir
      .mockRejectedValueOnce(new Error('no discussions'));

    const result = await explainSession('/base', '2024-01-15/001');
    expect(result.narrative).toContain('3');
  });

  it('narrative includes L2 discussion info when discussions exist', async () => {
    const fs = await getFsMock();
    fs.readFile
      .mockResolvedValueOnce(JSON.stringify({ status: 'approved' }))
      .mockRejectedValueOnce(new Error('no verdict'))
      // discussion verdict
      .mockResolvedValueOnce(
        JSON.stringify({ finalSeverity: 'WARNING', rounds: 2, consensusReached: true }),
      );
    fs.readdir
      .mockResolvedValueOnce([])         // reviews dir
      .mockResolvedValueOnce(['d001']);  // discussions dir

    const result = await explainSession('/base', '2024-01-15/001');
    expect(result.narrative).toContain('L2');
    expect(result.narrative).toContain('d001');
  });
});
