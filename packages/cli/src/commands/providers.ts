/**
 * Providers Command
 * List supported providers and API key status.
 * Optionally enriched with models.dev catalog data and CLI backend detection.
 */

import { getSupportedProviders } from '@codeagora/core/l1/provider-registry.js';
import { getProviderEnvVar } from './doctor.js';
import { statusColor, bold, dim } from '../utils/colors.js';
import { getProviderStats, type ModelsCatalog } from '@codeagora/shared/data/models-dev.js';
import type { DetectedCli } from '@codeagora/shared/utils/cli-detect.js';

// ============================================================================
// Types
// ============================================================================

export interface ProviderInfo {
  name: string;
  apiKeyEnvVar: string;
  apiKeySet: boolean;
  modelCount?: number;
  freeModelCount?: number;
}

// ============================================================================
// Public API
// ============================================================================

export function listProviders(catalog?: ModelsCatalog): ProviderInfo[] {
  return getSupportedProviders().map((name) => {
    const apiKeyEnvVar = getProviderEnvVar(name);
    const info: ProviderInfo = {
      name,
      apiKeyEnvVar,
      apiKeySet: Boolean(process.env[apiKeyEnvVar]),
    };

    if (catalog) {
      const stats = getProviderStats(catalog, name);
      if (stats) {
        info.modelCount = stats.total;
        info.freeModelCount = stats.free;
      }
    }

    return info;
  });
}

export function formatProviderList(providers: ProviderInfo[], cliBackends?: DetectedCli[]): string {
  const COL_PROVIDER = 14;
  const COL_KEY = 22;
  const COL_MODELS = 8;
  const COL_FREE = 6;

  const hasCatalog = providers.some((p) => p.modelCount !== undefined);

  // Build header
  let header = 'Provider'.padEnd(COL_PROVIDER) + 'API Key'.padEnd(COL_KEY);
  if (hasCatalog) {
    header += 'Models'.padEnd(COL_MODELS) + 'Free'.padEnd(COL_FREE);
  }
  header += 'Status';

  const dividerLen = COL_PROVIDER + COL_KEY + 10 + (hasCatalog ? COL_MODELS + COL_FREE : 0);
  const divider = '\u2500'.repeat(dividerLen);

  const rows = providers.map((p) => {
    const paddedName = p.name.padEnd(COL_PROVIDER);
    const keyText = `${p.apiKeySet ? '\u2713' : '\u2717'} ${p.apiKeyEnvVar}`.padEnd(COL_KEY);
    const keyDisplay = p.apiKeySet ? statusColor.pass(keyText) : statusColor.fail(keyText);
    const status = p.apiKeySet ? 'available' : 'no key';

    let modelCols = '';
    if (hasCatalog) {
      const modelStr = (p.modelCount !== undefined ? String(p.modelCount) : '-').padEnd(COL_MODELS);
      const freeStr = (p.freeModelCount !== undefined ? String(p.freeModelCount) : '-').padEnd(COL_FREE);
      modelCols = modelStr + freeStr;
    }

    return bold(paddedName) + keyDisplay + modelCols + status;
  });

  const sections = [header, divider, ...rows];

  // CLI backends section
  if (cliBackends && cliBackends.length > 0) {
    sections.push('');
    sections.push(formatCliBackends(cliBackends));
  }

  return sections.join('\n');
}

// ============================================================================
// CLI Backends Formatter
// ============================================================================

export function formatCliBackends(backends: DetectedCli[]): string {
  const COL_NAME = 16;
  const COL_BINARY = 16;

  const header =
    'CLI Backends'.padEnd(COL_NAME) +
    'Binary'.padEnd(COL_BINARY) +
    'Status';
  const divider = '\u2500'.repeat(COL_NAME + COL_BINARY + 14);

  const rows = backends.map((b) => {
    const nameCol = b.backend.padEnd(COL_NAME);
    const binaryCol = b.bin.padEnd(COL_BINARY);
    const statusIcon = b.available ? '\u2713' : '\u2717';
    const statusText = b.available ? 'available' : 'not found';
    const statusDisplay = b.available
      ? statusColor.pass(`${statusIcon} ${statusText}`)
      : statusColor.fail(`${statusIcon} ${statusText}`);
    return dim(nameCol) + dim(binaryCol) + statusDisplay;
  });

  return [header, divider, ...rows].join('\n');
}
