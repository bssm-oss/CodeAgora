import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStableScopeAuditFromNameStatus,
  buildStableScopeAuditArtifact,
  buildStableScopeAuditExclusionSections,
  classifyStableScopePath,
  collectRemovedOrIgnoredDesktopScopedPaths,
  collectRemovedOrIgnoredProviderMatrixPaths,
  discoverDeletedProviderMatrixPaths,
  discoverDesktopScopedDiffPaths,
  discoverIgnoredDesktopScopedPaths,
  discoverIgnoredProviderMatrixPaths,
  formatStableScopeAuditArtifact,
  isDesktopScopedPath,
  isProviderMatrixPath,
  parseGitIgnoredStatusZ,
  parseGitNameStatusZ,
  readGitIgnoredStatus,
  STABLE_SCOPE_ALLOWED_CATEGORIES,
  validateStableScopeAuditArtifact,
  writeStableScopeAuditArtifact,
} from '../../scripts/stable-scope-audit.mjs';

const POSITIVE_CATEGORY_FIXTURES = [
  {
    category: 'cli',
    paths: [
      'packages/cli/src/commands/review.ts',
      'packages/cli/src/tests/cli-review.test.ts',
      'src/tests/cli-clean-diff-smoke.test.ts',
    ],
  },
  {
    category: 'mcp',
    paths: [
      'packages/mcp/src/index.ts',
      'packages/mcp/src/registry.ts',
      'packages/mcp/src/tests/stdio-startup.test.ts',
    ],
  },
  {
    category: 'github_actions',
    paths: [
      'action.yml',
      '.github/workflows/review.yml',
      'packages/github/src/action.ts',
      'src/tests/github-actions-runtime.test.ts',
      'docs/for-users/GITHUB_ACTIONS_SETUP.md',
    ],
  },
  {
    category: 'desktop',
    paths: [
      'packages/desktop/src/main.ts',
      'src/tests/desktop-readiness.test.ts',
      'scripts/desktop-release-gate-runner.mjs',
    ],
  },
  {
    category: 'vercel_production_support',
    paths: [
      'packages/site/src/pages/index.astro',
      'src/tests/site-landing.test.ts',
      'vercel.json',
      '.vercelignore',
    ],
  },
  {
    category: 'shared_support',
    paths: [
      'package.json',
      'packages/shared/src/contracts/stable.ts',
      'packages/core/src/pipeline/report.ts',
      'scripts/AGENTS.md',
    ],
  },
  {
    category: 'test_evidence_support',
    paths: [
      'scripts/release-gate-runner.mjs',
      'scripts/stable-scope-audit.mjs',
      'docs/archived/RELEASE_EVIDENCE.md',
      'packages/core/src/tests/pipeline-chunker.test.ts',
    ],
  },
] as const;

function nameStatusZ(fields: string[]): string {
  return `${fields.join('\0')}\0`;
}

describe('stable scope audit', () => {
  it('classifies representative positive path fixtures for every stable allowed category', () => {
    expect(STABLE_SCOPE_ALLOWED_CATEGORIES).toEqual([
      'cli',
      'mcp',
      'github_actions',
      'desktop',
      'vercel_production_support',
      'shared_support',
      'test_evidence_support',
    ]);

    expect(POSITIVE_CATEGORY_FIXTURES.map((fixture) => fixture.category)).toEqual(STABLE_SCOPE_ALLOWED_CATEGORIES);

    for (const fixture of POSITIVE_CATEGORY_FIXTURES) {
      for (const filePath of fixture.paths) {
        const classification = classifyStableScopePath(filePath);
        const assignedAllowedCategories = STABLE_SCOPE_ALLOWED_CATEGORIES.filter(
          (category) => classification.category === category,
        );

        expect(classification.decision).toBe('keep');
        expect(assignedAllowedCategories).toEqual([fixture.category]);
        expect(classification.category).toBe(fixture.category);
      }
    }
  });

  it('emits one kept audit entry per changed path from a fixture diff without omissions or duplicates', () => {
    const audit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'M',
      'packages/cli/src/commands/review.ts',
      'A',
      'packages/mcp/src/registry.ts',
      'M',
      'packages/github/src/action.ts',
      'M',
      'packages/shared/src/contracts/stable.ts',
      'M',
      'scripts/release-gate-runner.mjs',
      'M',
      'docs/for-users/GITHUB_ACTIONS_SETUP.md',
      'M',
      'src/tests/github-actions-runtime.test.ts',
      'M',
      'packages/desktop/src/main.ts',
      'D',
      'scripts/desktop-release-gate-runner.mjs',
      'M',
      'packages/site/src/pages/index.astro',
      'R100',
      'docs/for-users/OLD_GITHUB_ACTIONS.md',
      'docs/for-users/GITHUB_ACTIONS_SETUP.md',
    ]));

    const expectedKeptPaths = [
      'packages/cli/src/commands/review.ts',
      'packages/mcp/src/registry.ts',
      'packages/github/src/action.ts',
      'packages/shared/src/contracts/stable.ts',
      'scripts/release-gate-runner.mjs',
      'docs/for-users/GITHUB_ACTIONS_SETUP.md',
      'src/tests/github-actions-runtime.test.ts',
      'packages/desktop/src/main.ts',
      'scripts/desktop-release-gate-runner.mjs',
      'packages/site/src/pages/index.astro',
      'docs/for-users/OLD_GITHUB_ACTIONS.md',
    ];
    const keptPaths = audit.keptChangedPathAuditEntries.map((entry: { path: string }) => entry.path);

    expect(keptPaths).toEqual(expectedKeptPaths);
    expect(new Set(keptPaths).size).toBe(keptPaths.length);
    expect(audit.keptChangedPathCount).toBe(expectedKeptPaths.length);
    expect(audit.unclassifiedChangedPathAuditEntries).toEqual([]);
    expect(audit.hasDuplicateChangedPaths).toBe(true);
    expect(audit.duplicateChangedPaths).toEqual([
      {
        path: 'docs/for-users/GITHUB_ACTIONS_SETUP.md',
        firstAuditIndex: 5,
        duplicateChangeIndex: 10,
        status: 'R100',
        changeType: 'renamed',
      },
    ]);
    expect(audit.excludedChangedPathAuditEntries).toEqual([]);
    expect(audit.keptChangedPathAuditEntries.map((entry: { surface: string }) => entry.surface)).toEqual([
      'cli',
      'mcp',
      'github-actions',
      'shared-support',
      'tests-evidence',
      'github-actions',
      'github-actions',
      'desktop',
      'desktop',
      'vercel-production',
      'github-actions',
    ]);
    expect(audit.keptChangedPathAuditEntries.map((entry: { category: string }) => entry.category)).toEqual([
      'cli',
      'mcp',
      'github_actions',
      'shared_support',
      'test_evidence_support',
      'github_actions',
      'github_actions',
      'desktop',
      'desktop',
      'vercel_production_support',
      'github_actions',
    ]);
    for (const entry of audit.keptChangedPathAuditEntries) {
      const assignedAllowedCategories = STABLE_SCOPE_ALLOWED_CATEGORIES.filter(
        (category) => entry.category === category,
      );

      expect(entry.decision).toBe('keep');
      expect(assignedAllowedCategories).toHaveLength(1);
      expect(entry.category).not.toBeNull();
    }
  });

  it('writes a structural audit artifact with every validated entry path and category', async () => {
    const audit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'M',
      'packages/cli/src/commands/review.ts',
      'A',
      'packages/mcp/src/registry.ts',
      'M',
      'packages/github/src/action.ts',
      'M',
      'packages/shared/src/contracts/stable.ts',
      'M',
      'scripts/stable-scope-audit.mjs',
      'M',
      'packages/desktop/src/main.ts',
      'M',
      'packages/site/src/pages/index.astro',
      'A',
      'for-antigravity.md',
    ]));
    const repoDir = await mkdtemp(path.join(tmpdir(), 'codeagora-stable-scope-audit-artifact-'));
    const artifactPath = path.join(repoDir, 'artifacts', 'diff-audit.json');

    try {
      const artifact = writeStableScopeAuditArtifact(audit, artifactPath, {
        generatedAt: '2026-06-12T00:00:00.000Z',
      });
      const writtenArtifact = JSON.parse(await readFile(artifactPath, 'utf-8'));
      const expectedEntries = [
        {
          path: 'packages/cli/src/commands/review.ts',
          category: 'cli',
        },
        {
          path: 'packages/desktop/src/main.ts',
          category: 'desktop',
        },
        {
          path: 'packages/github/src/action.ts',
          category: 'github_actions',
        },
        {
          path: 'packages/mcp/src/registry.ts',
          category: 'mcp',
        },
        {
          path: 'packages/shared/src/contracts/stable.ts',
          category: 'shared_support',
        },
        {
          path: 'packages/site/src/pages/index.astro',
          category: 'vercel_production_support',
        },
        {
          path: 'scripts/stable-scope-audit.mjs',
          category: 'test_evidence_support',
        },
      ];

      expect(writtenArtifact).toEqual(artifact);
      expect(await readFile(artifactPath, 'utf-8')).toBe(formatStableScopeAuditArtifact(artifact));
      expect(writtenArtifact.schemaVersion).toBe('codeagora.stable-scope-audit.v1');
      expect(writtenArtifact.generatedAt).toBe('2026-06-12T00:00:00.000Z');
      expect(writtenArtifact.validatedEntryCount).toBe(expectedEntries.length);
      expect(writtenArtifact.validatedEntries).toHaveLength(expectedEntries.length);
      expect(
        writtenArtifact.validatedEntries.map((entry: { path: string; category: string }) => ({
          path: entry.path,
          category: entry.category,
        })),
      ).toEqual(expectedEntries);
      for (const entry of writtenArtifact.validatedEntries) {
        expect(typeof entry.path).toBe('string');
        expect(entry.path.length).toBeGreaterThan(0);
        expect(STABLE_SCOPE_ALLOWED_CATEGORIES).toContain(entry.category);
      }
      expect(writtenArtifact.validatedEntries.map((entry: { path: string }) => entry.path)).not.toEqual(
        expect.arrayContaining([
          'for-antigravity.md',
        ]),
      );
      expect(writtenArtifact.changedPathCount).toBe(8);
      expect(writtenArtifact.excludedChangedPathCount).toBe(0);
      expect(writtenArtifact.unclassifiedChangedPathCount).toBe(1);
      expect(writtenArtifact.hasDesktopScope).toBe(true);
      expect(writtenArtifact.removedOrIgnoredProviderMatrixPaths).toEqual([]);
      expect(writtenArtifact.removedOrIgnoredProviderMatrixPathCount).toBe(0);
      expect(writtenArtifact.hasProviderMatrixRemovalOrIgnored).toBe(false);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('writes deterministic audit artifact JSON across repeated runs and input ordering', async () => {
    const auditA = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'M',
      'packages/mcp/src/registry.ts',
      'M',
      'scripts/stable-scope-audit.mjs',
      'M',
      'packages/cli/src/commands/review.ts',
      'M',
      'packages/github/src/action.ts',
      'M',
      'docs/for-users/OLD_GITHUB_ACTIONS.md',
    ]));
    const auditB = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'M',
      'docs/for-users/OLD_GITHUB_ACTIONS.md',
      'M',
      'packages/github/src/action.ts',
      'M',
      'packages/cli/src/commands/review.ts',
      'M',
      'scripts/stable-scope-audit.mjs',
      'M',
      'packages/mcp/src/registry.ts',
    ]));
    const repoDir = await mkdtemp(path.join(tmpdir(), 'codeagora-stable-scope-audit-deterministic-'));
    const artifactPathA = path.join(repoDir, 'run-a', 'diff-audit.json');
    const artifactPathB = path.join(repoDir, 'run-b', 'diff-audit.json');

    try {
      const artifactA = writeStableScopeAuditArtifact(auditA, artifactPathA);
      const artifactB = writeStableScopeAuditArtifact(auditB, artifactPathB);
      const artifactJsonA = await readFile(artifactPathA, 'utf-8');
      const artifactJsonB = await readFile(artifactPathB, 'utf-8');

      expect(artifactJsonA).toBe(artifactJsonB);
      expect(artifactJsonA).toBe(formatStableScopeAuditArtifact(artifactA));
      expect(artifactA).toEqual(artifactB);
      expect(artifactA.generatedAt).toBeNull();
      expect(artifactA.validatedEntries.map((entry: { path: string }) => entry.path)).toEqual([
        'docs/for-users/OLD_GITHUB_ACTIONS.md',
        'packages/cli/src/commands/review.ts',
        'packages/github/src/action.ts',
        'packages/mcp/src/registry.ts',
        'scripts/stable-scope-audit.mjs',
      ]);
      expect(artifactA.duplicateChangedPaths).toEqual([]);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('rejects audit artifacts with unknown categories, duplicate paths, or paths outside the kept changed-path set', async () => {
    const validAudit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'M',
      'packages/cli/src/commands/review.ts',
      'M',
      'packages/mcp/src/registry.ts',
      'M',
      'packages/github/src/action.ts',
    ]));
    const validResult = validateStableScopeAuditArtifact(validAudit);

    expect(validResult).toEqual({
      valid: true,
      errors: [],
    });

    const unknownCategoryAudit = JSON.parse(JSON.stringify(validAudit));
    unknownCategoryAudit.keptChangedPathAuditEntries[0].category = 'unknown_surface';
    const unknownCategoryResult = validateStableScopeAuditArtifact(unknownCategoryAudit);

    expect(unknownCategoryResult.valid).toBe(false);
    expect(unknownCategoryResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_category',
          path: 'packages/cli/src/commands/review.ts',
          category: 'unknown_surface',
        }),
      ]),
    );

    const duplicatePathAudit = JSON.parse(JSON.stringify(validAudit));
    duplicatePathAudit.keptChangedPathAuditEntries.push({
      ...duplicatePathAudit.keptChangedPathAuditEntries[0],
    });
    const duplicatePathResult = validateStableScopeAuditArtifact(duplicatePathAudit);

    expect(duplicatePathResult.valid).toBe(false);
    expect(duplicatePathResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate_path',
          path: 'packages/cli/src/commands/review.ts',
        }),
      ]),
    );

    const outsideKeptSetAudit = JSON.parse(JSON.stringify(validAudit));
    outsideKeptSetAudit.keptChangedPathAuditEntries.push({
      path: 'packages/shared/src/contracts/stable.ts',
      status: 'M',
      changeType: 'modified',
      pathRole: 'path',
      decision: 'keep',
      category: 'shared_support',
      surface: 'shared-support',
      reason: 'Injected fixture path outside the changed keep set.',
    });
    const outsideKeptSetResult = validateStableScopeAuditArtifact(outsideKeptSetAudit);

    expect(outsideKeptSetResult.valid).toBe(false);
    expect(outsideKeptSetResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'path_outside_kept_changed_path_set',
          path: 'packages/shared/src/contracts/stable.ts',
        }),
      ]),
    );

    const reportedDuplicateAudit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'M',
      'packages/cli/src/commands/review.ts',
      'R100',
      'packages/mcp/src/old-registry.ts',
      'packages/cli/src/commands/review.ts',
    ]));
    const reportedDuplicateResult = validateStableScopeAuditArtifact(reportedDuplicateAudit);

    expect(reportedDuplicateResult.valid).toBe(false);
    expect(reportedDuplicateResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate_changed_path',
          path: 'packages/cli/src/commands/review.ts',
        }),
      ]),
    );

    const repoDir = await mkdtemp(path.join(tmpdir(), 'codeagora-stable-scope-audit-validation-'));
    const artifactPath = path.join(repoDir, 'invalid-audit.json');
    const scriptPath = path.resolve('scripts/stable-scope-audit.mjs');

    try {
      await writeFile(artifactPath, `${JSON.stringify(outsideKeptSetAudit, null, 2)}\n`, 'utf-8');
      const result = spawnSync(process.execPath, [scriptPath, '--validate-artifact', artifactPath], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('outside the kept changed-path set');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('generates an audit artifact listing deleted and ignored Desktop paths without omissions', async () => {
    const repoDir = await mkdtemp(path.join(tmpdir(), 'codeagora-stable-scope-audit-cli-'));
    const scriptPath = path.resolve('scripts/stable-scope-audit.mjs');

    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      await mkdir(path.join(repoDir, 'packages', 'desktop', 'src'), { recursive: true });
      await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
      await writeFile(path.join(repoDir, 'packages', 'desktop', 'src', 'main.ts'), 'export {};\n', 'utf-8');
      await writeFile(path.join(repoDir, 'scripts', 'desktop-release-gate-runner.mjs'), 'export {};\n', 'utf-8');
      execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync(
        'git',
        ['-c', 'user.name=CodeAgora Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'],
        { cwd: repoDir, stdio: 'ignore' },
      );

      await unlink(path.join(repoDir, 'packages', 'desktop', 'src', 'main.ts'));
      await unlink(path.join(repoDir, 'scripts', 'desktop-release-gate-runner.mjs'));
      await mkdir(path.join(repoDir, 'packages', 'desktop', 'dist'), { recursive: true });
      await mkdir(path.join(repoDir, 'desktop-ux-audit-artifacts'), { recursive: true });
      await writeFile(
        path.join(repoDir, '.gitignore'),
        'packages/desktop/dist/\ndesktop-ux-audit-artifacts/\n',
        'utf-8',
      );
      await writeFile(path.join(repoDir, 'packages', 'desktop', 'dist', 'index.html'), '<main></main>\n', 'utf-8');
      await writeFile(path.join(repoDir, 'desktop-ux-audit-artifacts', 'report.json'), '{}\n', 'utf-8');

      const result = spawnSync(process.execPath, [scriptPath, '--cwd', repoDir], {
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const audit = JSON.parse(result.stdout);
      const deletedPaths = audit.changedDesktopScopedPaths.filter(
        (entry: { changeType: string }) => entry.changeType === 'deleted',
      );
      const ignoredPaths = audit.ignoredDesktopScopedPaths;

      expect(deletedPaths).toEqual([
        {
          path: 'packages/desktop/src/main.ts',
          status: 'D',
          changeType: 'deleted',
        },
        {
          path: 'scripts/desktop-release-gate-runner.mjs',
          status: 'D',
          changeType: 'deleted',
        },
      ]);
      expect(ignoredPaths).toEqual([
        {
          path: 'desktop-ux-audit-artifacts/',
          status: '!!',
          changeType: 'ignored',
        },
        {
          path: 'packages/desktop/dist/',
          status: '!!',
          changeType: 'ignored',
        },
      ]);
      expect(audit.removedOrIgnoredDesktopScopedPaths).toEqual([
        {
          path: 'desktop-ux-audit-artifacts/',
          status: '!!',
          changeType: 'ignored',
          source: 'ignore',
        },
        {
          path: 'packages/desktop/dist/',
          status: '!!',
          changeType: 'ignored',
          source: 'ignore',
        },
        {
          path: 'packages/desktop/src/main.ts',
          status: 'D',
          changeType: 'deleted',
          source: 'diff',
        },
        {
          path: 'scripts/desktop-release-gate-runner.mjs',
          status: 'D',
          changeType: 'deleted',
          source: 'diff',
        },
      ]);
      expect(audit.removedOrIgnoredDesktopScopedPathCount).toBe(4);
      expect(audit.desktopScopedPaths).toHaveLength(deletedPaths.length + ignoredPaths.length);
      expect(audit.desktopScopedPaths).toEqual([...deletedPaths, ...ignoredPaths]);
      expect(audit.hasDesktopScope).toBe(true);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('detects deleted Desktop-scoped paths from git name-status output', () => {
    const audit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'D',
      'packages/desktop/src/main.ts',
      'M',
      'packages/cli/src/index.ts',
      'D',
      'scripts/desktop-release-gate-runner.mjs',
    ]));

    expect(audit.hasDesktopScope).toBe(true);
    expect(audit.desktopScopedPaths).toEqual([
      {
        path: 'packages/desktop/src/main.ts',
        status: 'D',
        changeType: 'deleted',
      },
      {
        path: 'scripts/desktop-release-gate-runner.mjs',
        status: 'D',
        changeType: 'deleted',
      },
    ]);
  });

  it('collects normalized removed or ignored Desktop paths from diff and ignored inputs', () => {
    const diffEntries = parseGitNameStatusZ(nameStatusZ([
      'D',
      './packages/desktop/src/main.ts',
      'R100',
      'packages/desktop/src/api/desktop-bridge.ts',
      'packages/cli/src/desktop-bridge.ts',
      'M',
      'packages/desktop/src/unchanged-scope.ts',
      'D',
      'packages/cli/src/commands/review.ts',
    ]));
    const ignoredEntries = parseGitIgnoredStatusZ(nameStatusZ([
      '!! .\\packages\\desktop\\dist\\',
      '!! desktop-ux-audit-artifacts/',
      '?? packages/desktop/src/new-view.ts',
      '!! packages/cli/dist/',
    ]));

    expect(collectRemovedOrIgnoredDesktopScopedPaths(diffEntries, ignoredEntries)).toEqual([
      {
        path: 'desktop-ux-audit-artifacts/',
        status: '!!',
        changeType: 'ignored',
        source: 'ignore',
      },
      {
        path: 'packages/desktop/dist/',
        status: '!!',
        changeType: 'ignored',
        source: 'ignore',
      },
      {
        path: 'packages/desktop/src/api/desktop-bridge.ts',
        status: 'R100',
        changeType: 'renamed',
        source: 'diff',
      },
      {
        path: 'packages/desktop/src/main.ts',
        status: 'D',
        changeType: 'deleted',
        source: 'diff',
      },
    ]);
  });

  it('captures deleted provider-matrix files from git name-status output', () => {
    const entries = parseGitNameStatusZ(nameStatusZ([
      'D',
      'packages/shared/src/providers/env-vars.ts',
      'D',
      'packages/shared/src/data/models-dev-snapshot.json',
      'D',
      'packages/core/src/l1/provider-registry.ts',
      'D',
      'src/tests/l1-provider-registry.test.ts',
      'M',
      'packages/shared/src/data/model-rankings.json',
      'D',
      'packages/cli/src/commands/review.ts',
    ]));
    const audit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'D',
      'packages/shared/src/providers/env-vars.ts',
      'D',
      'packages/shared/src/data/models-dev-snapshot.json',
      'D',
      'packages/core/src/l1/provider-registry.ts',
      'D',
      'src/tests/l1-provider-registry.test.ts',
      'M',
      'packages/shared/src/data/model-rankings.json',
      'D',
      'packages/cli/src/commands/review.ts',
    ]));

    const expectedDeletedProviderMatrixPaths = [
      {
        path: 'packages/shared/src/providers/env-vars.ts',
        status: 'D',
        changeType: 'deleted',
      },
      {
        path: 'packages/shared/src/data/models-dev-snapshot.json',
        status: 'D',
        changeType: 'deleted',
      },
      {
        path: 'packages/core/src/l1/provider-registry.ts',
        status: 'D',
        changeType: 'deleted',
      },
      {
        path: 'src/tests/l1-provider-registry.test.ts',
        status: 'D',
        changeType: 'deleted',
      },
    ];

    expect(isProviderMatrixPath('./packages/shared/src/providers/env-vars.ts')).toBe(true);
    expect(isProviderMatrixPath('packages/cli/src/commands/review.ts')).toBe(false);
    expect(discoverDeletedProviderMatrixPaths(entries)).toEqual(expectedDeletedProviderMatrixPaths);
    expect(audit.deletedProviderMatrixPaths).toEqual(expectedDeletedProviderMatrixPaths);
    expect(audit.providerMatrixDeletedPaths).toEqual(expectedDeletedProviderMatrixPaths);
    expect(audit.hasProviderMatrixDeletion).toBe(true);
  });

  it('collects normalized removed or ignored provider-matrix paths from diff and ignored inputs', () => {
    const diffEntries = parseGitNameStatusZ(nameStatusZ([
      'D',
      './packages/shared/src/providers/env-vars.ts',
      'R100',
      'packages/shared/src/data/models-dev-snapshot.json',
      'docs/for-agents/models-dev-snapshot.json',
      'M',
      'packages/core/src/l1/provider-registry.ts',
      'D',
      'packages/cli/src/commands/review.ts',
    ]));
    const ignoredEntries = parseGitIgnoredStatusZ(nameStatusZ([
      '!! .\\packages\\shared\\src\\providers\\generated\\',
      '!! packages/shared/src/data/model-rankings.json',
      '!! src/tests/l1-provider-registry.test.ts',
      '?? packages/shared/src/providers/new-provider.ts',
      '!! packages/cli/dist/',
    ]));
    const expectedIgnoredProviderMatrixPaths = [
      {
        path: 'packages/shared/src/providers/generated/',
        status: '!!',
        changeType: 'ignored',
      },
      {
        path: 'packages/shared/src/data/model-rankings.json',
        status: '!!',
        changeType: 'ignored',
      },
      {
        path: 'src/tests/l1-provider-registry.test.ts',
        status: '!!',
        changeType: 'ignored',
      },
    ];
    const expectedRemovedOrIgnoredProviderMatrixPaths = [
      {
        path: 'packages/shared/src/data/model-rankings.json',
        status: '!!',
        changeType: 'ignored',
        source: 'ignore',
      },
      {
        path: 'packages/shared/src/data/models-dev-snapshot.json',
        status: 'R100',
        changeType: 'renamed',
        source: 'diff',
      },
      {
        path: 'packages/shared/src/providers/env-vars.ts',
        status: 'D',
        changeType: 'deleted',
        source: 'diff',
      },
      {
        path: 'packages/shared/src/providers/generated/',
        status: '!!',
        changeType: 'ignored',
        source: 'ignore',
      },
      {
        path: 'src/tests/l1-provider-registry.test.ts',
        status: '!!',
        changeType: 'ignored',
        source: 'ignore',
      },
    ];
    const audit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'D',
      './packages/shared/src/providers/env-vars.ts',
      'R100',
      'packages/shared/src/data/models-dev-snapshot.json',
      'docs/for-agents/models-dev-snapshot.json',
      'M',
      'packages/core/src/l1/provider-registry.ts',
      'D',
      'packages/cli/src/commands/review.ts',
    ]), {
      ignoredStatusOutput: nameStatusZ([
        '!! .\\packages\\shared\\src\\providers\\generated\\',
        '!! packages/shared/src/data/model-rankings.json',
        '!! src/tests/l1-provider-registry.test.ts',
        '?? packages/shared/src/providers/new-provider.ts',
        '!! packages/cli/dist/',
      ]),
    });

    expect(discoverIgnoredProviderMatrixPaths(ignoredEntries)).toEqual(expectedIgnoredProviderMatrixPaths);
    expect(collectRemovedOrIgnoredProviderMatrixPaths(diffEntries, ignoredEntries)).toEqual(
      expectedRemovedOrIgnoredProviderMatrixPaths,
    );
    expect(audit.ignoredProviderMatrixPaths).toEqual(expectedIgnoredProviderMatrixPaths);
    expect(audit.removedOrIgnoredProviderMatrixPaths).toEqual(expectedRemovedOrIgnoredProviderMatrixPaths);
    expect(audit.removedOrIgnoredProviderMatrixPathCount).toBe(5);
    expect(audit.hasProviderMatrixRemovalOrIgnored).toBe(true);

    const parsedArtifact = buildStableScopeAuditArtifact(audit);

    expect(parsedArtifact.removedOrIgnoredProviderMatrixPaths).toEqual(expectedRemovedOrIgnoredProviderMatrixPaths);
    expect(parsedArtifact.removedOrIgnoredProviderMatrixPathCount).toBe(5);
    expect(parsedArtifact.hasProviderMatrixRemovalOrIgnored).toBe(true);
  });

  it('renders unrelated provider-matrix collector outputs into artifact exclusion sections', () => {
    const audit = buildStableScopeAuditFromNameStatus(nameStatusZ([
      'D',
      'packages/desktop/src/main.ts',
      'R100',
      'scripts/desktop-release-gate-runner.mjs',
      'scripts/release-gate-runner.mjs',
      'D',
      './packages/shared/src/providers/env-vars.ts',
      'R100',
      'packages/shared/src/data/models-dev-snapshot.json',
      'docs/for-agents/models-dev-snapshot.json',
      'D',
      'packages/cli/src/commands/review.ts',
    ]), {
      ignoredStatusOutput: nameStatusZ([
        '!! packages/desktop/dist/',
        '!! desktop-ux-audit-artifacts/',
        '!! packages/shared/src/providers/generated/',
        '!! packages/shared/src/data/model-rankings.json',
      ]),
    });
    const expectedProviderMatrixPaths = [
      'packages/shared/src/data/model-rankings.json',
      'packages/shared/src/data/models-dev-snapshot.json',
      'packages/shared/src/providers/env-vars.ts',
      'packages/shared/src/providers/generated/',
    ];
    const artifact = buildStableScopeAuditArtifact(audit);
    const renderedArtifact = JSON.parse(formatStableScopeAuditArtifact(artifact));
    const directSections = buildStableScopeAuditExclusionSections(audit);
    const sectionsById = new Map(
      renderedArtifact.exclusionSections.map((section: { id: string }) => [section.id, section]),
    );
    const providerMatrixSection = sectionsById.get('unrelated_provider_matrix') as {
      sourceField: string;
      entryCount: number;
      entries: Array<{ path: string }>;
    };

    expect(renderedArtifact.exclusionSections).toEqual(directSections);
    expect([...sectionsById.keys()]).toEqual(['unrelated_provider_matrix']);
    expect(renderedArtifact.removedOrIgnoredDesktopScopedPaths.map((entry: { path: string }) => entry.path)).toEqual([
      'desktop-ux-audit-artifacts/',
      'packages/desktop/dist/',
      'packages/desktop/src/main.ts',
      'scripts/desktop-release-gate-runner.mjs',
    ]);
    expect(providerMatrixSection.sourceField).toBe('removedOrIgnoredProviderMatrixPaths');
    expect(providerMatrixSection.entryCount).toBe(expectedProviderMatrixPaths.length);
    expect(providerMatrixSection.entries.map((entry) => entry.path)).toEqual(expectedProviderMatrixPaths);

    const allSectionPaths = renderedArtifact.exclusionSections.flatMap(
      (section: { entries: Array<{ path: string }> }) => section.entries.map((entry) => entry.path),
    );

    for (const expectedPath of expectedProviderMatrixPaths) {
      expect(allSectionPaths.filter((pathEntry: string) => pathEntry === expectedPath)).toHaveLength(1);
    }
  });

  it('checks rename source and target paths for Desktop scope', () => {
    const entries = parseGitNameStatusZ(nameStatusZ([
      'R100',
      'packages/desktop/src/api/desktop-bridge.ts',
      'packages/cli/src/desktop-bridge.ts',
      'R092',
      'packages/github/src/action.ts',
      'packages/desktop/src/action-status.ts',
    ]));

    expect(discoverDesktopScopedDiffPaths(entries)).toEqual([
      {
        path: 'packages/desktop/src/api/desktop-bridge.ts',
        status: 'R100',
        changeType: 'renamed',
      },
      {
        path: 'packages/desktop/src/action-status.ts',
        status: 'R092',
        changeType: 'renamed',
      },
    ]);
  });

  it('detects Desktop-scoped paths excluded by git ignore rules', async () => {
    const repoDir = await mkdtemp(path.join(tmpdir(), 'codeagora-stable-scope-audit-'));

    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      await mkdir(path.join(repoDir, 'packages', 'desktop', 'dist'), { recursive: true });
      await writeFile(path.join(repoDir, '.gitignore'), 'packages/desktop/dist/\n', 'utf-8');
      await writeFile(path.join(repoDir, 'packages', 'desktop', 'dist', 'index.html'), '<main></main>\n', 'utf-8');

      const ignoredStatus = readGitIgnoredStatus({
        cwd: repoDir,
        pathspecs: ['packages/desktop'],
      });
      const audit = buildStableScopeAuditFromNameStatus('', {
        ignoredStatusOutput: ignoredStatus,
      });

      expect(audit.ignoredDesktopScopedPaths).toEqual([
        {
          path: 'packages/desktop/dist/',
          status: '!!',
          changeType: 'ignored',
        },
      ]);
      expect(audit.desktopScopedPaths).toEqual(audit.ignoredDesktopScopedPaths);
      expect(audit.hasDesktopScope).toBe(true);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('parses ignored Desktop paths separately from untracked status entries', () => {
    const ignoredEntries = parseGitIgnoredStatusZ(nameStatusZ([
      '?? packages/desktop/src/new-view.ts',
      '!! packages/desktop/dist/',
      '!! src/tests/desktop-layout.test.ts',
    ]));

    expect(discoverIgnoredDesktopScopedPaths(ignoredEntries)).toEqual([
      {
        path: 'packages/desktop/dist/',
        status: '!!',
        changeType: 'ignored',
      },
      {
        path: 'src/tests/desktop-layout.test.ts',
        status: '!!',
        changeType: 'ignored',
      },
    ]);
  });

  it('does not classify CLI, MCP, GitHub, or shared support paths as Desktop-scoped', () => {
    expect(isDesktopScopedPath('packages/cli/src/index.ts')).toBe(false);
    expect(isDesktopScopedPath('packages/mcp/src/index.ts')).toBe(false);
    expect(isDesktopScopedPath('packages/github/src/action.ts')).toBe(false);
    expect(isDesktopScopedPath('packages/shared/src/contracts/stable.ts')).toBe(false);
  });
});
