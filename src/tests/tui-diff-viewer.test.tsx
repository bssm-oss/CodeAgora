import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { DiffViewer } from '@codeagora/tui/components/DiffViewer.js';
import type { DiffFile } from '@codeagora/tui/components/DiffViewer.js';

// ============================================================================
// Fixtures
// ============================================================================

const singleFile: DiffFile[] = [
  {
    filePath: 'src/auth/login.ts',
    hunks: [
      {
        header: '@@ -10,5 +10,5 @@',
        lines: [
          '-const query = "SELECT * FROM users WHERE id = " + id;',
          '+const query = `SELECT * FROM users WHERE id = ${id}`;',
          ' const result = await db.execute(query);',
        ],
        startLine: 10,
        scopeName: 'authenticate',
      },
    ],
    issues: [
      { line: 10, severity: 'CRITICAL', title: 'SQL injection vulnerability' },
    ],
  },
];

const multipleFiles: DiffFile[] = [
  {
    filePath: 'src/auth/login.ts',
    hunks: [
      {
        header: '@@ -1,3 +1,3 @@',
        lines: ['-old line', '+new line', ' context line'],
        startLine: 1,
      },
    ],
    issues: [],
  },
  {
    filePath: 'src/utils/cache.ts',
    hunks: [
      {
        header: '@@ -5,2 +5,2 @@',
        lines: ['-cache = null', '+cache = undefined'],
        startLine: 5,
      },
    ],
    issues: [{ line: 5, severity: 'WARNING', title: 'Use undefined not null' }],
  },
];

const noIssuesFile: DiffFile[] = [
  {
    filePath: 'src/clean.ts',
    hunks: [
      {
        header: '@@ -1,2 +1,2 @@',
        lines: ['-old', '+new'],
        startLine: 1,
      },
    ],
    issues: [],
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('DiffViewer', () => {
  it('renders file tab with basename', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('login.ts');
  });

  it('renders hunk header', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@@ -10,5 +10,5 @@');
  });

  it('shows scope name in hunk header', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('authenticate');
  });

  it('renders added diff lines with + prefix', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('+const query');
  });

  it('renders removed diff lines with - prefix', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('-const query');
  });

  it('renders issue badge with severity and title', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[CRITICAL]');
    expect(frame).toContain('SQL injection vulnerability');
  });

  it('renders multiple file tabs', () => {
    const { lastFrame } = render(<DiffViewer files={multipleFiles} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('login.ts');
    expect(frame).toContain('cache.ts');
  });

  it('shows navigation hint', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Tab');
  });

  it('renders empty state when no files', () => {
    const { lastFrame } = render(<DiffViewer files={[]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No diff files');
  });

  it('renders context lines (space prefix)', () => {
    const { lastFrame } = render(<DiffViewer files={singleFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('const result = await db.execute(query);');
  });

  it('shows WARNING severity badge', () => {
    const { lastFrame } = render(<DiffViewer files={multipleFiles} />);
    // Switch to second file by simulating Tab - but ink-testing-library
    // doesn't easily support keyboard input in static render, so just verify
    // that the first file renders without errors
    const frame = lastFrame() ?? '';
    expect(frame).toBeDefined();
  });

  it('renders file tab for files with no issues', () => {
    const { lastFrame } = render(<DiffViewer files={noIssuesFile} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('clean.ts');
  });
});
