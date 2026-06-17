#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STABLE_SCOPE_AUDIT_SCHEMA_VERSION = 'codeagora.stable-scope-audit.v1';
export const STABLE_SCOPE_ALLOWED_CATEGORIES = Object.freeze([
  'cli',
  'mcp',
  'github_actions',
  'desktop',
  'vercel_production_support',
  'shared_support',
  'test_evidence_support',
]);

const STABLE_SCOPE_CATEGORY_SURFACES = Object.freeze({
  cli: 'cli',
  mcp: 'mcp',
  github_actions: 'github-actions',
  desktop: 'desktop',
  vercel_production_support: 'vercel-production',
  shared_support: 'shared-support',
  test_evidence_support: 'tests-evidence',
});

const DESKTOP_PATH_PATTERNS = [
  /^packages\/desktop(?:\/|$)/,
  /^src\/tests\/desktop-[^/]+\.test\.tsx?$/,
  /^scripts\/desktop-[^/]+\.(?:mjs|cjs|js|ts)$/,
  /^scripts\/.*-desktop-[^/]+\.(?:mjs|cjs|js|ts)$/,
  /^desktop-ux(?:-|\/|$)/,
  /^codeagora-desktop-[^/]+$/,
];

const DESKTOP_STATUS_PATHS = [
  'packages/desktop',
  'src/tests/desktop-*',
  'scripts/desktop-*',
  'scripts/*-desktop-*',
  'desktop-ux*',
  'codeagora-desktop-*',
];

const PROVIDER_MATRIX_PATH_PATTERNS = [
  /^packages\/shared\/src\/providers(?:\/|$)/,
  /^packages\/shared\/src\/data\/model-rankings\.json$/,
  /^packages\/shared\/src\/data\/models-dev(?:-[^/]+)?\.(?:ts|json)$/,
  /^packages\/core\/src\/l0\/model-(?:registry|selector)\.ts$/,
  /^packages\/core\/src\/l1\/provider-registry\.ts$/,
  /^scripts\/update-models-snapshot\.ts$/,
  /^src\/tests\/(?:l0-model-(?:registry|selector)|l1-provider-registry|models-dev|providers(?:-[^/]+)?)\.test\.ts$/,
  /^packages\/shared\/src\/tests\/providers-env-vars\.test\.ts$/,
];

const PROVIDER_MATRIX_STATUS_PATHS = [
  'packages/shared/src/providers',
  'packages/shared/src/data',
  'packages/core/src/l0',
  'packages/core/src/l1/provider-registry.ts',
  'src/tests',
  'packages/shared/src/tests',
];

const CLI_PATH_PATTERNS = [
  /^packages\/cli(?:\/|$)/,
  /^src\/tests\/cli-[^/]+\.test\.tsx?$/,
];

const MCP_PATH_PATTERNS = [
  /^packages\/mcp(?:\/|$)/,
  /^src\/tests\/mcp-[^/]+\.test\.tsx?$/,
  /^src\/tests\/sprint6-mcp\.test\.tsx?$/,
];

const GITHUB_ACTION_PATH_PATTERNS = [
  /^action\.yml$/,
  /^dist\/action\.js$/,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^packages\/github(?:\/|$)/,
  /^src\/tests\/github-[^/]+\.test\.tsx?$/,
  /^src\/tests\/github-actions-[^/]+\.test\.tsx?$/,
  /^src\/tests\/github-action-[^/]+\.test\.tsx?$/,
  /^packages\/shared\/src\/data\/github-actions-template\.ya?ml$/,
  /^docs\/for-users\/.*GITHUB.*\.md$/,
  /^docs\/for-users\/5_GITHUB_INTEGRATION\.md$/,
  /^docs\/archived\/live-github-action-pr-smoke\.md$/,
];

const VERCEL_PRODUCTION_PATH_PATTERNS = [
  /^packages\/site(?:\/|$)/,
  /^src\/tests\/site-[^/]+\.test\.tsx?$/,
  /^vercel\.json$/,
  /^\.vercelignore$/,
];

const TEST_EVIDENCE_PATH_PATTERNS = [
  /^src\/tests\/[^/]+\.test\.tsx?$/,
  /^packages\/[^/]+\/src\/tests\/[^/]+\.test\.tsx?$/,
  /^scripts\/beta-smoke\.mjs$/,
  /^scripts\/(?:release|evidence|security|redaction|github|cli|stable)[^/]*\.(?:mjs|cjs|js|ts)$/,
  /^docs\/archived\/(?:RELEASE|live-|rc|release-|.*evidence).*\.md$/,
  /^docs\/for-agents\/rc-evidence(?:\/|$)/,
];

const SHARED_SUPPORT_PATH_PATTERNS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^ROADMAP\.md$/,
  /^SECURITY\.md$/,
  /^CONTRIBUTING\.md$/,
  /^tsconfig(?:\.base)?\.json$/,
  /^vitest\.config\.ts$/,
  /^eslint\.config\.js$/,
  /^packages\/shared(?:\/|$)/,
  /^packages\/core(?:\/|$)/,
  /^scripts\/postinstall\.cjs$/,
  /^scripts\/AGENTS\.md$/,
  /^docs\/for-users(?:\/|$)/,
  /^docs\/for-agents(?:\/|$)/,
  /^docs\/archived(?:\/|$)/,
];

function normalizeRepoPath(filePath) {
  return String(filePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

export function isDesktopScopedPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return DESKTOP_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isProviderMatrixPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return PROVIDER_MATRIX_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function matchesAnyPattern(filePath, patterns) {
  const normalized = normalizeRepoPath(filePath);
  return patterns.some((pattern) => pattern.test(normalized));
}

function keepClassification(category, reason) {
  return {
    decision: 'keep',
    category,
    surface: STABLE_SCOPE_CATEGORY_SURFACES[category],
    reason,
  };
}

export function classifyStableScopePath(filePath) {
  const normalized = normalizeRepoPath(filePath);

  if (isDesktopScopedPath(normalized)) {
    return keepClassification('desktop', 'Desktop release surface.');
  }

  if (matchesAnyPattern(normalized, CLI_PATH_PATTERNS)) {
    return keepClassification('cli', 'CLI release surface.');
  }

  if (matchesAnyPattern(normalized, MCP_PATH_PATTERNS)) {
    return keepClassification('mcp', 'MCP release surface.');
  }

  if (matchesAnyPattern(normalized, GITHUB_ACTION_PATH_PATTERNS)) {
    return keepClassification('github_actions', 'GitHub Actions release surface.');
  }

  if (matchesAnyPattern(normalized, VERCEL_PRODUCTION_PATH_PATTERNS)) {
    return keepClassification(
      'vercel_production_support',
      'Vercel production landing evidence support for stable readiness.',
    );
  }

  if (matchesAnyPattern(normalized, TEST_EVIDENCE_PATH_PATTERNS)) {
    return keepClassification(
      'test_evidence_support',
      'Deterministic test, smoke, or evidence support for stable gates.',
    );
  }

  if (isProviderMatrixPath(normalized)) {
    return keepClassification(
      'shared_support',
      'Provider configuration support shared by the in-scope release surfaces.',
    );
  }

  if (matchesAnyPattern(normalized, SHARED_SUPPORT_PATH_PATTERNS)) {
    return keepClassification('shared_support', 'Shared support required by CLI, MCP, GitHub Actions, or Desktop.');
  }

  return {
    decision: 'review',
    category: null,
    surface: 'unclassified',
    reason: 'Path needs explicit scope decision before it can remain in the stable candidate.',
  };
}

function pathRoleForEntry(entry, index) {
  if (entry.oldPath || entry.newPath) {
    return index === 0 ? 'oldPath' : 'newPath';
  }
  return 'path';
}

export function buildChangedPathAuditEntries(changes) {
  const seen = new Map();
  const entries = [];
  const duplicateChangedPaths = [];

  changes.forEach((change, changeIndex) => {
    change.paths.forEach((filePath, pathIndex) => {
      const path = normalizeRepoPath(filePath);
      const existingIndex = seen.get(path);
      if (existingIndex !== undefined) {
        duplicateChangedPaths.push({
          path,
          firstAuditIndex: existingIndex,
          duplicateChangeIndex: changeIndex,
          status: change.status,
          changeType: change.changeType,
        });
        return;
      }

      seen.set(path, entries.length);
      const classification = classifyStableScopePath(path);
      entries.push({
        path,
        status: change.status,
        changeType: change.changeType,
        pathRole: pathRoleForEntry(change, pathIndex),
        decision: classification.decision,
        category: classification.category,
        surface: classification.surface,
        reason: classification.reason,
      });
    });
  });

  return {
    entries,
    duplicateChangedPaths,
  };
}

export function parseGitNameStatusZ(output) {
  const fields = String(output ?? '').split('\0').filter((field) => field.length > 0);
  const entries = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) {
      continue;
    }

    if (/^[RC]\d*/.test(status)) {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) {
        throw new Error(`Malformed git name-status entry for ${status}: expected old and new paths`);
      }
      entries.push({
        status,
        changeType: status.startsWith('R') ? 'renamed' : 'copied',
        paths: [normalizeRepoPath(oldPath), normalizeRepoPath(newPath)],
        oldPath: normalizeRepoPath(oldPath),
        newPath: normalizeRepoPath(newPath),
      });
      continue;
    }

    const filePath = fields[index++];
    if (!filePath) {
      throw new Error(`Malformed git name-status entry for ${status}: expected path`);
    }
    entries.push({
      status,
      changeType: status === 'D' ? 'deleted' : status === 'A' ? 'added' : 'modified',
      paths: [normalizeRepoPath(filePath)],
      path: normalizeRepoPath(filePath),
    });
  }

  return entries;
}

export function parseGitIgnoredStatusZ(output) {
  const fields = String(output ?? '').split('\0').filter((field) => field.length > 0);
  const entries = [];

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const status = field.slice(0, 2);

    if (/^[RC]/.test(status)) {
      index++;
      continue;
    }

    if (status !== '!!') {
      continue;
    }

    const filePath = field.slice(3);
    if (!filePath) {
      throw new Error('Malformed git ignored status entry: expected path');
    }

    entries.push({
      status,
      changeType: 'ignored',
      paths: [normalizeRepoPath(filePath)],
      path: normalizeRepoPath(filePath),
    });
  }

  return entries;
}

export function discoverDesktopScopedDiffPaths(entries) {
  return entries.flatMap((entry) =>
    entry.paths
      .filter(isDesktopScopedPath)
      .map((filePath) => ({
        path: filePath,
        status: entry.status,
        changeType: entry.changeType,
      })),
  );
}

export function discoverIgnoredDesktopScopedPaths(entries) {
  return entries.flatMap((entry) =>
    entry.paths
      .filter(isDesktopScopedPath)
      .map((filePath) => ({
        path: filePath,
        status: entry.status,
        changeType: entry.changeType,
      })),
  );
}

function compareRemovedOrIgnoredScopeEntries(left, right) {
  return (
    compareNullableStrings(left?.path, right?.path) ||
    compareNullableStrings(left?.source, right?.source) ||
    compareNullableStrings(left?.status, right?.status) ||
    compareNullableStrings(left?.changeType, right?.changeType)
  );
}

function addRemovedOrIgnoredScopeEntry(entries, seen, filePath, sourceEntry, source) {
  const path = normalizeRepoPath(filePath);
  const key = `${source}\0${sourceEntry.status}\0${sourceEntry.changeType}\0${path}`;
  if (!path || seen.has(key)) {
    return;
  }

  seen.add(key);
  entries.push({
    path,
    status: sourceEntry.status,
    changeType: sourceEntry.changeType,
    source,
  });
}

function isRemovedByDiffPath(entry, pathIndex) {
  return entry.changeType === 'deleted' || (entry.changeType === 'renamed' && pathIndex === 0);
}

export function collectRemovedOrIgnoredDesktopScopedPaths(changes, ignoredEntries) {
  const entries = [];
  const seen = new Set();

  for (const change of changes ?? []) {
    change.paths.forEach((filePath, index) => {
      if (!isRemovedByDiffPath(change, index) || !isDesktopScopedPath(filePath)) {
        return;
      }

      addRemovedOrIgnoredScopeEntry(entries, seen, filePath, change, 'diff');
    });
  }

  for (const ignoredEntry of ignoredEntries ?? []) {
    if (ignoredEntry.changeType !== 'ignored') {
      continue;
    }

    ignoredEntry.paths.forEach((filePath) => {
      if (!isDesktopScopedPath(filePath)) {
        return;
      }

      addRemovedOrIgnoredScopeEntry(entries, seen, filePath, ignoredEntry, 'ignore');
    });
  }

  return entries.sort(compareRemovedOrIgnoredScopeEntries);
}

export function discoverIgnoredProviderMatrixPaths(entries) {
  return entries.flatMap((entry) =>
    entry.paths
      .filter(isProviderMatrixPath)
      .map((filePath) => ({
        path: filePath,
        status: entry.status,
        changeType: entry.changeType,
      })),
  );
}

export function collectRemovedOrIgnoredProviderMatrixPaths(changes, ignoredEntries) {
  const entries = [];
  const seen = new Set();

  for (const change of changes ?? []) {
    change.paths.forEach((filePath, index) => {
      if (!isRemovedByDiffPath(change, index) || !isProviderMatrixPath(filePath)) {
        return;
      }

      addRemovedOrIgnoredScopeEntry(entries, seen, filePath, change, 'diff');
    });
  }

  for (const ignoredEntry of ignoredEntries ?? []) {
    if (ignoredEntry.changeType !== 'ignored') {
      continue;
    }

    ignoredEntry.paths.forEach((filePath) => {
      if (!isProviderMatrixPath(filePath)) {
        return;
      }

      addRemovedOrIgnoredScopeEntry(entries, seen, filePath, ignoredEntry, 'ignore');
    });
  }

  return entries.sort(compareRemovedOrIgnoredScopeEntries);
}

export function discoverDeletedProviderMatrixPaths(entries) {
  return entries.flatMap((entry) => {
    if (entry.changeType !== 'deleted') {
      return [];
    }

    return entry.paths
      .filter(isProviderMatrixPath)
      .map((filePath) => ({
        path: filePath,
        status: entry.status,
        changeType: entry.changeType,
      }));
  });
}

export function buildStableScopeAuditFromNameStatus(nameStatusOutput, options = {}) {
  const changes = parseGitNameStatusZ(nameStatusOutput);
  const ignored = parseGitIgnoredStatusZ(options.ignoredStatusOutput ?? '');
  const {
    entries: changedPathAuditEntries,
    duplicateChangedPaths,
  } = buildChangedPathAuditEntries(changes);
  const keptChangedPathAuditEntries = changedPathAuditEntries.filter((entry) => entry.decision === 'keep');
  const excludedChangedPathAuditEntries = changedPathAuditEntries.filter((entry) => entry.decision === 'exclude');
  const unclassifiedChangedPathAuditEntries = changedPathAuditEntries.filter((entry) => entry.decision === 'review');
  const changedDesktopScopedPaths = discoverDesktopScopedDiffPaths(changes);
  const ignoredDesktopScopedPaths = discoverIgnoredDesktopScopedPaths(ignored);
  const removedOrIgnoredDesktopScopedPaths = collectRemovedOrIgnoredDesktopScopedPaths(changes, ignored);
  const ignoredProviderMatrixPaths = discoverIgnoredProviderMatrixPaths(ignored);
  const removedOrIgnoredProviderMatrixPaths = collectRemovedOrIgnoredProviderMatrixPaths(changes, ignored);
  const deletedProviderMatrixPaths = discoverDeletedProviderMatrixPaths(changes);
  const desktopScopedPaths = [
    ...changedDesktopScopedPaths,
    ...ignoredDesktopScopedPaths,
  ];

  return {
    schemaVersion: STABLE_SCOPE_AUDIT_SCHEMA_VERSION,
    changes,
    ignored,
    changedPathAuditEntries,
    keptChangedPathAuditEntries,
    excludedChangedPathAuditEntries,
    unclassifiedChangedPathAuditEntries,
    changedPathCount: changedPathAuditEntries.length,
    keptChangedPathCount: keptChangedPathAuditEntries.length,
    excludedChangedPathCount: excludedChangedPathAuditEntries.length,
    unclassifiedChangedPathCount: unclassifiedChangedPathAuditEntries.length,
    duplicateChangedPaths,
    hasDuplicateChangedPaths: duplicateChangedPaths.length > 0,
    changedDesktopScopedPaths,
    ignoredDesktopScopedPaths,
    removedOrIgnoredDesktopScopedPaths,
    removedOrIgnoredDesktopScopedPathCount: removedOrIgnoredDesktopScopedPaths.length,
    desktopScopedPaths,
    hasDesktopScope: desktopScopedPaths.length > 0,
    ignoredProviderMatrixPaths,
    removedOrIgnoredProviderMatrixPaths,
    removedOrIgnoredProviderMatrixPathCount: removedOrIgnoredProviderMatrixPaths.length,
    hasProviderMatrixRemovalOrIgnored: removedOrIgnoredProviderMatrixPaths.length > 0,
    deletedProviderMatrixPaths,
    providerMatrixDeletedPaths: deletedProviderMatrixPaths,
    hasProviderMatrixDeletion: deletedProviderMatrixPaths.length > 0,
  };
}

function getArrayField(value, fieldName, errors) {
  const fieldValue = value?.[fieldName];
  if (Array.isArray(fieldValue)) {
    return fieldValue;
  }

  errors.push({
    code: 'missing_or_invalid_array',
    field: fieldName,
    message: `Stable scope audit artifact must contain an array field named "${fieldName}".`,
  });
  return [];
}

function auditEntryPath(entry) {
  return normalizeRepoPath(entry?.path);
}

function compareNullableStrings(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function compareAuditEntries(left, right) {
  return (
    compareNullableStrings(left?.path, right?.path) ||
    compareNullableStrings(left?.category, right?.category) ||
    compareNullableStrings(left?.status, right?.status) ||
    compareNullableStrings(left?.changeType, right?.changeType) ||
    compareNullableStrings(left?.pathRole, right?.pathRole)
  );
}

function compareDuplicateChangedPaths(left, right) {
  return (
    compareNullableStrings(left?.path, right?.path) ||
    compareNullableStrings(left?.status, right?.status) ||
    compareNullableStrings(left?.changeType, right?.changeType) ||
    Number(left?.firstAuditIndex ?? 0) - Number(right?.firstAuditIndex ?? 0) ||
    Number(left?.duplicateChangeIndex ?? 0) - Number(right?.duplicateChangeIndex ?? 0)
  );
}

function normalizeRemovedOrIgnoredScopeEntries(entries) {
  return [...(entries ?? [])]
    .map((entry) => ({
      path: auditEntryPath(entry),
      status: entry.status,
      changeType: entry.changeType,
      source: entry.source,
    }))
    .sort(compareRemovedOrIgnoredScopeEntries);
}

function buildExclusionSection(id, title, sourceField, entries) {
  return {
    id,
    title,
    sourceField,
    entries,
    entryCount: entries.length,
  };
}

export function buildStableScopeAuditExclusionSections(audit) {
  return [
    buildExclusionSection(
      'unrelated_provider_matrix',
      'Unrelated provider-matrix exclusions',
      'removedOrIgnoredProviderMatrixPaths',
      normalizeRemovedOrIgnoredScopeEntries(audit.removedOrIgnoredProviderMatrixPaths),
    ),
  ];
}

function collectDuplicateEntryPaths(entries, fieldName, errors) {
  const seen = new Map();

  entries.forEach((entry, index) => {
    const entryPath = auditEntryPath(entry);
    if (!entryPath) {
      return;
    }

    const firstIndex = seen.get(entryPath);
    if (firstIndex !== undefined) {
      errors.push({
        code: 'duplicate_path',
        field: `${fieldName}[${index}].path`,
        path: entryPath,
        firstIndex,
        duplicateIndex: index,
        message: `Stable scope audit artifact contains duplicate path "${entryPath}".`,
      });
      return;
    }

    seen.set(entryPath, index);
  });
}

function collectUnknownCategories(entries, fieldName, errors) {
  const allowedCategories = new Set(STABLE_SCOPE_ALLOWED_CATEGORIES);

  entries.forEach((entry, index) => {
    const category = entry?.category;
    if (category === null || category === undefined) {
      return;
    }

    if (!allowedCategories.has(category)) {
      const entryPath = auditEntryPath(entry);
      errors.push({
        code: 'unknown_category',
        field: `${fieldName}[${index}].category`,
        path: entryPath,
        category,
        message: `Stable scope audit artifact contains unknown category "${category}" for path "${entryPath}".`,
      });
    }
  });
}

function collectReportedDuplicateChangedPaths(audit, errors) {
  const duplicateChangedPaths = Array.isArray(audit?.duplicateChangedPaths) ? audit.duplicateChangedPaths : [];

  duplicateChangedPaths.forEach((duplicate, index) => {
    const duplicatePath = auditEntryPath(duplicate);
    errors.push({
      code: 'duplicate_changed_path',
      field: `duplicateChangedPaths[${index}].path`,
      path: duplicatePath,
      message: `Stable scope audit artifact reports duplicate changed path "${duplicatePath}".`,
    });
  });
}

export function validateStableScopeAuditArtifact(audit, options = {}) {
  const errors = [];
  const changedPathAuditEntries = getArrayField(audit, 'changedPathAuditEntries', errors);
  const keptChangedPathAuditEntries = getArrayField(audit, 'keptChangedPathAuditEntries', errors);
  const changedKeptPathSet = new Set(
    changedPathAuditEntries
      .filter((entry) => entry?.decision === 'keep')
      .map(auditEntryPath)
      .filter(Boolean),
  );
  const keptChangedPathSet = new Set(
    (options.keptChangedPaths ?? [...changedKeptPathSet])
      .map(normalizeRepoPath)
      .filter(Boolean),
  );

  collectUnknownCategories(changedPathAuditEntries, 'changedPathAuditEntries', errors);
  collectUnknownCategories(keptChangedPathAuditEntries, 'keptChangedPathAuditEntries', errors);
  collectDuplicateEntryPaths(changedPathAuditEntries, 'changedPathAuditEntries', errors);
  collectDuplicateEntryPaths(keptChangedPathAuditEntries, 'keptChangedPathAuditEntries', errors);
  collectReportedDuplicateChangedPaths(audit, errors);

  keptChangedPathAuditEntries.forEach((entry, index) => {
    const entryPath = auditEntryPath(entry);
    if (!entryPath || keptChangedPathSet.has(entryPath)) {
      return;
    }

    errors.push({
      code: 'path_outside_kept_changed_path_set',
      field: `keptChangedPathAuditEntries[${index}].path`,
      path: entryPath,
      message: `Stable scope audit artifact contains kept path "${entryPath}" outside the kept changed-path set.`,
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertStableScopeAuditArtifactValid(audit, options = {}) {
  const result = validateStableScopeAuditArtifact(audit, options);
  if (!result.valid) {
    const error = new Error(result.errors.map((entry) => entry.message).join('\n'));
    error.validationErrors = result.errors;
    throw error;
  }
  return audit;
}

export function buildStableScopeAuditArtifact(audit, options = {}) {
  assertStableScopeAuditArtifactValid(audit, options);

  const validatedEntries = audit.keptChangedPathAuditEntries.map((entry, index) => {
    const path = auditEntryPath(entry);
    const category = entry?.category;

    if (!path) {
      throw new Error(`Stable scope audit artifact entry at index ${index} is missing required path.`);
    }

    if (!STABLE_SCOPE_ALLOWED_CATEGORIES.includes(category)) {
      throw new Error(`Stable scope audit artifact entry "${path}" is missing a required stable category.`);
    }

    return {
      path,
      category,
      status: entry.status,
      changeType: entry.changeType,
      pathRole: entry.pathRole,
      surface: entry.surface,
      reason: entry.reason,
    };
  }).sort(compareAuditEntries);
  const duplicateChangedPaths = [...(audit.duplicateChangedPaths ?? [])]
    .map((entry) => ({
      path: auditEntryPath(entry),
      firstAuditIndex: entry.firstAuditIndex,
      duplicateChangeIndex: entry.duplicateChangeIndex,
      status: entry.status,
      changeType: entry.changeType,
    }))
    .sort(compareDuplicateChangedPaths);
  const removedOrIgnoredDesktopScopedPaths = normalizeRemovedOrIgnoredScopeEntries(
    audit.removedOrIgnoredDesktopScopedPaths,
  );
  const removedOrIgnoredProviderMatrixPaths = normalizeRemovedOrIgnoredScopeEntries(
    audit.removedOrIgnoredProviderMatrixPaths,
  );
  const exclusionSections = buildStableScopeAuditExclusionSections({
    removedOrIgnoredDesktopScopedPaths,
    removedOrIgnoredProviderMatrixPaths,
  });

  return {
    schemaVersion: audit.schemaVersion ?? STABLE_SCOPE_AUDIT_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? audit.generatedAt ?? null,
    stableReleaseSurfaces: ['cli', 'mcp', 'github_actions', 'desktop'],
    productionEvidenceSurfaces: ['vercel_production'],
    excludedReleaseSurfaces: [],
    allowedCategories: [...STABLE_SCOPE_ALLOWED_CATEGORIES],
    validatedEntries,
    validatedEntryCount: validatedEntries.length,
    changedPathCount: audit.changedPathCount ?? audit.changedPathAuditEntries.length,
    keptChangedPathCount: audit.keptChangedPathCount ?? validatedEntries.length,
    excludedChangedPathCount: audit.excludedChangedPathCount ?? audit.excludedChangedPathAuditEntries?.length ?? 0,
    unclassifiedChangedPathCount: audit.unclassifiedChangedPathCount ?? audit.unclassifiedChangedPathAuditEntries?.length ?? 0,
    hasDesktopScope: Boolean(audit.hasDesktopScope),
    exclusionSections,
    removedOrIgnoredDesktopScopedPaths,
    removedOrIgnoredDesktopScopedPathCount: audit.removedOrIgnoredDesktopScopedPathCount ?? audit.removedOrIgnoredDesktopScopedPaths?.length ?? 0,
    removedOrIgnoredProviderMatrixPaths,
    removedOrIgnoredProviderMatrixPathCount: audit.removedOrIgnoredProviderMatrixPathCount ?? audit.removedOrIgnoredProviderMatrixPaths?.length ?? 0,
    hasProviderMatrixRemovalOrIgnored: Boolean(audit.hasProviderMatrixRemovalOrIgnored),
    hasProviderMatrixDeletion: Boolean(audit.hasProviderMatrixDeletion),
    duplicateChangedPaths,
  };
}

export function formatStableScopeAuditArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function writeStableScopeAuditArtifact(audit, artifactPath, options = {}) {
  const outputPath = String(artifactPath ?? '');
  if (!outputPath) {
    throw new Error('Stable scope audit artifact writer requires an output path.');
  }

  const artifact = buildStableScopeAuditArtifact(audit, options);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, formatStableScopeAuditArtifact(artifact), 'utf-8');

  return artifact;
}

export function readGitNameStatus(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const ref = options.ref ?? 'HEAD';
  const args = [
    'diff',
    '--name-status',
    '--find-renames',
    '-z',
    ...(ref ? [ref] : []),
  ];

  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function readGitIgnoredStatus(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const pathspecs = options.pathspecs ?? [
    ...DESKTOP_STATUS_PATHS,
    ...PROVIDER_MATRIX_STATUS_PATHS,
  ];
  const args = [
    'status',
    '--porcelain=v1',
    '--ignored=matching',
    '--untracked-files=all',
    '-z',
    '--',
    ...pathspecs,
  ];

  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    ref: 'HEAD',
    validateArtifact: null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--cwd') {
      options.cwd = argv[++index];
    } else if (arg?.startsWith('--cwd=')) {
      options.cwd = arg.slice('--cwd='.length);
    } else if (arg === '--ref') {
      options.ref = argv[++index];
    } else if (arg?.startsWith('--ref=')) {
      options.ref = arg.slice('--ref='.length);
    } else if (arg === '--validate-artifact') {
      options.validateArtifact = argv[++index];
    } else if (arg?.startsWith('--validate-artifact=')) {
      options.validateArtifact = arg.slice('--validate-artifact='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.validateArtifact) {
    const audit = JSON.parse(readFileSync(options.validateArtifact, 'utf-8'));
    const validation = validateStableScopeAuditArtifact(audit);
    if (!validation.valid) {
      console.error(validation.errors.map((entry) => entry.message).join('\n'));
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify({
      valid: true,
      schemaVersion: audit.schemaVersion ?? null,
      keptChangedPathCount: audit.keptChangedPathCount ?? audit.keptChangedPathAuditEntries?.length ?? 0,
    }, null, 2));
    return;
  }

  const nameStatus = readGitNameStatus(options);
  const ignoredStatus = readGitIgnoredStatus(options);
  const audit = buildStableScopeAuditFromNameStatus(nameStatus, {
    ignoredStatusOutput: ignoredStatus,
  });
  const validation = validateStableScopeAuditArtifact(audit);
  console.log(JSON.stringify(audit, null, 2));
  if (audit.unclassifiedChangedPathCount > 0 || !validation.valid) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
