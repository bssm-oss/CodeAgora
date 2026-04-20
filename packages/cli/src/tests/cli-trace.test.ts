import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { traceSession } from '../commands/trace.js';

/**
 * Integration tests for `agora trace` command.
 * Builds a real-on-disk mock session under a tmpdir and exercises the command.
 */

let tmpDir: string;

async function writeSession(date: string, id: string, result: unknown): Promise<void> {
  const dir = path.join(tmpDir, '.ca', 'sessions', date, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(result), 'utf-8');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-trace-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('traceSession', () => {
  it('renders summary for session with multiple findings', async () => {
    await writeSession('2026-04-20', '001', {
      summary: { decision: 'ACCEPT' },
      evidenceDocs: [
        {
          issueTitle: 'First finding',
          severity: 'WARNING',
          filePath: 'src/a.ts',
          lineRange: [10, 10],
          confidenceTrace: { raw: 60, filtered: 60, corroborated: 48, final: 48 },
        },
        {
          issueTitle: 'Second finding',
          severity: 'CRITICAL',
          filePath: 'src/b.ts',
          lineRange: [20, 22],
          confidenceTrace: { raw: 90, filtered: 90, corroborated: 100, verified: 100, final: 100 },
        },
      ],
    });

    const result = await traceSession(tmpDir, '2026-04-20/001');
    expect(result.findingCount).toBe(2);
    expect(result.output).toContain('Session 2026-04-20/001 — ACCEPT (2 findings)');
    expect(result.output).toContain('[1] src/a.ts:10 — First finding (WARNING)');
    expect(result.output).toContain('[2] src/b.ts:20-22 — Second finding (CRITICAL)');
  });

  it('renders single finding detail with --finding N', async () => {
    await writeSession('2026-04-20', '002', {
      summary: { decision: 'REJECT' },
      evidenceDocs: [
        {
          issueTitle: 'Alpha',
          severity: 'CRITICAL',
          filePath: 'src/x.ts',
          lineRange: [5, 5],
          confidenceTrace: { raw: 80, filtered: 80, corroborated: 100, final: 100 },
        },
        {
          issueTitle: 'Beta',
          severity: 'WARNING',
          filePath: 'src/y.ts',
          lineRange: [15, 15],
          confidenceTrace: { raw: 40, filtered: 40, corroborated: 32, final: 32 },
        },
      ],
    });

    const result = await traceSession(tmpDir, '2026-04-20/002', { finding: 2 });
    expect(result.output).toContain('Beta');
    expect(result.output).not.toContain('Alpha');
  });

  it('handles empty session gracefully', async () => {
    await writeSession('2026-04-20', '003', {
      summary: { decision: 'ACCEPT' },
      evidenceDocs: [],
    });
    const result = await traceSession(tmpDir, '2026-04-20/003');
    expect(result.findingCount).toBe(0);
    expect(result.output).toContain('No findings in this session.');
  });

  it('throws for missing session', async () => {
    await expect(
      traceSession(tmpDir, '2026-04-20/999'),
    ).rejects.toThrow(/Session result not found/);
  });

  it('throws for malformed session path', async () => {
    await expect(
      traceSession(tmpDir, 'not-a-valid-path'),
    ).rejects.toThrow(/YYYY-MM-DD\/NNN format/);
  });

  it('throws for --finding index out of range', async () => {
    await writeSession('2026-04-20', '004', {
      summary: { decision: 'ACCEPT' },
      evidenceDocs: [
        {
          issueTitle: 'Only one',
          severity: 'WARNING',
          filePath: 'src/a.ts',
          lineRange: [1, 1],
          confidenceTrace: { raw: 50, final: 50 },
        },
      ],
    });
    await expect(
      traceSession(tmpDir, '2026-04-20/004', { finding: 5 }),
    ).rejects.toThrow(/out of range/);
  });

  it('blocks path traversal in session argument', async () => {
    await expect(
      traceSession(tmpDir, '../../../etc/passwd'),
    ).rejects.toThrow(/Path traversal|resolves outside/);
  });

  it('renders triage tab classification for each finding', async () => {
    await writeSession('2026-04-20', '005', {
      summary: { decision: 'REJECT' },
      evidenceDocs: [
        {
          issueTitle: 'Must fix',
          severity: 'CRITICAL',
          filePath: 'src/a.ts',
          lineRange: [1, 1],
          confidenceTrace: { final: 85 },
        },
        {
          issueTitle: 'Low confidence',
          severity: 'CRITICAL',
          filePath: 'src/b.ts',
          lineRange: [1, 1],
          confidenceTrace: { final: 15 },
        },
      ],
    });
    const result = await traceSession(tmpDir, '2026-04-20/005');
    expect(result.output).toContain('→ must-fix tab');
    expect(result.output).toContain('→ ignore tab');
  });
});
