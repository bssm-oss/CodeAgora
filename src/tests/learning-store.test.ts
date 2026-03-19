/**
 * Tests for src/learning/store.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLearnedPatterns, saveLearnedPatterns, mergePatterns } from '@codeagora/core/learning/store.js';
import type { DismissedPattern, LearnedPatterns } from '@codeagora/core/learning/store.js';

// ============================================================================
// Mock fs/promises
// ============================================================================

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
  },
}));

// ============================================================================
// Fixtures
// ============================================================================

const validPattern: DismissedPattern = {
  pattern: 'sql injection',
  severity: 'CRITICAL',
  dismissCount: 2,
  lastDismissed: '2026-03-01',
  action: 'downgrade',
};

const validData: LearnedPatterns = {
  version: 1,
  dismissedPatterns: [validPattern],
};

// ============================================================================
// loadLearnedPatterns
// ============================================================================

describe('loadLearnedPatterns', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('returns parsed data for a valid file', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validData));
    const result = await loadLearnedPatterns('/project');
    expect(result).toEqual(validData);
  });

  it('returns null when the file does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await loadLearnedPatterns('/project');
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not-json{{');
    const result = await loadLearnedPatterns('/project');
    expect(result).toBeNull();
  });

  it('returns null when schema validation fails', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 2, dismissedPatterns: [] }));
    const result = await loadLearnedPatterns('/project');
    expect(result).toBeNull();
  });
});

// ============================================================================
// saveLearnedPatterns
// ============================================================================

describe('saveLearnedPatterns', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('writes valid JSON to the expected path', async () => {
    await saveLearnedPatterns('/project', validData);
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [filePath, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(filePath).toContain('.ca/learned-patterns.json');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(validData);
  });

  it('creates the .ca directory before writing', async () => {
    await saveLearnedPatterns('/project', validData);
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('.ca'), { recursive: true });
  });
});

// ============================================================================
// mergePatterns
// ============================================================================

describe('mergePatterns', () => {
  it('adds a new pattern when existing list is empty', () => {
    const result = mergePatterns([], [validPattern]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(validPattern);
  });

  it('increments dismissCount for an existing pattern', () => {
    const incoming: DismissedPattern = {
      ...validPattern,
      dismissCount: 3,
      lastDismissed: '2026-03-10',
    };
    const result = mergePatterns([validPattern], [incoming]);
    expect(result).toHaveLength(1);
    expect(result[0]!.dismissCount).toBe(validPattern.dismissCount + incoming.dismissCount);
    expect(result[0]!.lastDismissed).toBe('2026-03-10');
  });

  it('updates lastDismissed to the incoming value', () => {
    const incoming: DismissedPattern = {
      ...validPattern,
      dismissCount: 1,
      lastDismissed: '2026-03-17',
    };
    const result = mergePatterns([validPattern], [incoming]);
    expect(result[0]!.lastDismissed).toBe('2026-03-17');
  });

  it('does not create duplicates for the same pattern', () => {
    const result = mergePatterns([validPattern], [validPattern]);
    expect(result).toHaveLength(1);
  });

  it('adds a distinct pattern alongside an existing one', () => {
    const other: DismissedPattern = {
      pattern: 'xss vulnerability',
      severity: 'WARNING',
      dismissCount: 1,
      lastDismissed: '2026-03-05',
      action: 'suppress',
    };
    const result = mergePatterns([validPattern], [other]);
    expect(result).toHaveLength(2);
  });

  it('handles empty incoming array without mutation', () => {
    const result = mergePatterns([validPattern], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(validPattern);
  });
});
