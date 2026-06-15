/**
 * Init Command
 * Initialize CodeAgora in a project directory.
 */

import fs from 'fs/promises';
import path from 'path';
import * as p from '@clack/prompts';
import { generateMinimalTemplate } from '@codeagora/core/config/templates.js';
import { getModePreset } from '@codeagora/core/config/mode-presets.js';
import { PROVIDER_ENV_VARS, getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';
import { getProviderTier, getCliBackendTier, TIER_LABELS } from '@codeagora/shared/providers/tiers.js';
import { loadModelsCatalog, getTopModels, getProviderStats } from '@codeagora/shared/data/models-dev.js';
import type { ModelsCatalog, ModelEntry } from '@codeagora/shared/data/models-dev.js';
import { detectEnvironment } from '@codeagora/shared/utils/env-detect.js';
import type { EnvironmentReport, ApiProviderStatus } from '@codeagora/shared/utils/env-detect.js';
import { detectCliBackends } from '@codeagora/shared/utils/cli-detect.js';
import type { DetectedCli } from '@codeagora/shared/utils/cli-detect.js';
import {
  ACTION_CHEAP_PRESET,
  buildActionPresetConfig,
  renderCodeAgoraWorkflowTemplate,
} from '@codeagora/shared/action-preset.js';
import { stringify as yamlStringify } from 'yaml';
import { t, detectLocale } from '@codeagora/shared/i18n/index.js';
import type { ReviewMode, Language, Backend } from '@codeagora/core/types/config.js';

// ============================================================================
// Types
// ============================================================================

export interface InitOptions {
  format: 'json' | 'yaml';
  force: boolean;
  baseDir: string;
  ci?: boolean;
  preset?: string;
}

export interface InitResult {
  created: string[];
  skipped: string[];
  warnings: string[];
}

export interface CustomConfigParams {
  provider: string;
  model: string;
  reviewerCount: number;
  discussion: boolean;
  mode?: ReviewMode;
  language?: Language;
}

interface AgentEntry { id: string; label?: string; model: string; backend: string; provider?: string; enabled: boolean; timeout: number }

export interface GeneratedConfig {
  reviewers: AgentEntry[];
  supporters: { pool: AgentEntry[]; pickCount: number; pickStrategy: string; devilsAdvocate: AgentEntry; personaPool: string[]; personaAssignment: string };
  moderator: { model: string; backend: string; provider?: string; enabled?: boolean };
  discussion: { enabled: boolean; maxRounds: number; registrationThreshold: Record<string, number | null>; codeSnippetRange: number };
  errorHandling: { maxRetries: number; forfeitThreshold: number };
  [key: string]: unknown;
}

export class UserCancelledError extends Error {
  constructor() { super('Setup cancelled by user.'); this.name = 'UserCancelledError'; }
}

// ============================================================================
// Multi-provider types (#173 Phase 3)
// ============================================================================

export interface ProviderModelSelection {
  provider: string;
  model: string;
  backend: 'api' | 'cli';
  runtimeProvider?: string;
  contextWindow?: number;
  isFree?: boolean;
}

export interface MultiProviderConfigParams {
  selections: ProviderModelSelection[];
  reviewerCount: number;
  discussion: boolean;
  mode?: ReviewMode;
  language?: Language;
  maxRounds?: number;
  supporterSelection?: ProviderModelSelection;
  devilsAdvocateSelection?: ProviderModelSelection;
  moderatorSelection?: ProviderModelSelection;
  moderatorEnabled?: boolean;
  headSelection?: ProviderModelSelection;
}

export interface DynamicPreset {
  id: string;
  label: string;
  labelKo: string;
  providers: string[];
  models: Record<string, string>;
  runtimeProviders?: Record<string, string>;
  reviewerModels?: string[];
  reviewerCount: number;
  discussion: boolean;
  maxRounds?: number;
  backend: 'api' | 'cli';
  roleSelections?: {
    supporter?: ProviderModelSelection;
    devilsAdvocate?: ProviderModelSelection;
    moderator?: ProviderModelSelection;
    moderatorEnabled?: boolean;
    head?: ProviderModelSelection;
  };
}

const PRESET_ALIASES: Record<string, string> = {
  budget: 'quick',
  fast: 'quick',
  balanced: 'free',
  standard: 'free',
  premium: 'thorough',
  deep: 'thorough',
  local: 'cli',
  'local-cli': 'cli',
  action: 'action',
  gha: 'action',
  'github-action': 'action',
};

export const PRESET_ALIAS_ENTRIES = Object.entries(PRESET_ALIASES).map(
  ([alias, target]) => ({ alias, target })
);

export function resolvePresetAlias(rawPreset?: string): string | undefined {
  if (!rawPreset) {
    return undefined;
  }
  const preset = rawPreset.trim().toLowerCase();
  if (!preset) return undefined;
  return PRESET_ALIASES[preset] ?? preset;
}

// ============================================================================
// Helpers
// ============================================================================

export function generateReviewIgnore(): string {
  return [
    'node_modules/',
    'dist/',
    '.git/',
    '*.lock',
    'package-lock.json',
  ].join('\n') + '\n';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFile(
  filePath: string,
  content: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  const exists = await fileExists(filePath);
  if (exists && !force) {
    skipped.push(filePath);
    return;
  }
  await fs.writeFile(filePath, content, 'utf-8');
  created.push(filePath);
}

// ============================================================================
// Default personas
// ============================================================================

const DEFAULT_PERSONAS: Record<string, string> = {
  'strict.md': `You are a strict code reviewer. You prioritize correctness, security, and reliability above all else.

Your review style:
- Flag any potential security vulnerability, no matter how minor
- Reject code that lacks proper input validation or error handling
- Insist on parameterized queries, proper authentication, and authorization checks
- Consider edge cases and failure modes that other reviewers might overlook
- Do not accept "good enough" — demand production-quality code
- If in doubt, flag the issue rather than letting it pass
`,
  'pragmatic.md': `You are a pragmatic code reviewer. You balance code quality with practical concerns like deadlines and complexity.

Your review style:
- Focus on issues that have real impact — skip cosmetic nitpicks
- Distinguish between "must fix before merge" and "nice to have later"
- Consider the context: is this a hotfix, a prototype, or a production feature?
- Suggest the simplest fix that addresses the core problem
- Acknowledge when existing code is "good enough" for the current use case
- Push back on over-engineering or unnecessary complexity
`,
  'security-focused.md': `You are a security-focused code reviewer. You think like an attacker and evaluate code from an adversarial perspective.

Your review style:
- Identify OWASP Top 10 vulnerabilities: injection, XSS, CSRF, SSRF, path traversal
- Check for hardcoded secrets, weak cryptography, and insecure defaults
- Evaluate authentication and authorization flows for bypass opportunities
- Look for information leakage: error messages, stack traces, debug logs
- Assess data handling: PII exposure, logging sensitive data, insecure storage
- Consider the blast radius: what's the worst-case scenario if this code is exploited?
- Suggest specific remediation steps, not just "fix this"
`,
};

async function writePersonas(
  baseDir: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  const personaDir = path.join(baseDir, '.ca', 'personas');
  await fs.mkdir(personaDir, { recursive: true });

  for (const [filename, content] of Object.entries(DEFAULT_PERSONAS)) {
    const filePath = path.join(personaDir, filename);
    await writeFile(filePath, content, force, created, skipped);
  }
}

// ============================================================================
// buildCustomConfig (original single-provider — kept for backward compat)
// ============================================================================

/**
 * Build a config object from user selections (wizard or programmatic).
 */
export function buildCustomConfig(params: CustomConfigParams): GeneratedConfig {
  const { provider, model, reviewerCount, discussion, mode = 'pragmatic', language = 'en' } = params;

  if (reviewerCount < 1 || reviewerCount > 10) {
    throw new Error(`reviewerCount must be between 1 and 10, got ${reviewerCount}`);
  }

  const agentBase = { model, backend: 'api', provider, enabled: true, timeout: 120 };
  const preset = getModePreset(mode);

  const reviewers = Array.from({ length: reviewerCount }, (_, i) => ({
    id: `r${i + 1}`,
    label: `${provider} ${model} Reviewer ${i + 1}`,
    ...agentBase,
  }));

  return {
    mode,
    language,
    reviewers,
    supporters: {
      pool: [
        { id: 's1', ...agentBase },
      ],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 'da',
        ...agentBase,
      },
      personaPool: preset.personaPool,
      personaAssignment: 'random',
    },
    moderator: {
      model,
      backend: 'api',
      provider,
    },
    head: {
      backend: 'api',
      model,
      provider,
      enabled: true,
    },
    discussion: {
      enabled: discussion !== false,
      maxRounds: preset.maxRounds,
      registrationThreshold: preset.registrationThreshold,
      codeSnippetRange: 10,
    },
    errorHandling: {
      maxRetries: 2,
      forfeitThreshold: 0.7,
    },
  };
}

// ============================================================================
// buildMultiProviderConfig (#173 Phase 3-4)
// ============================================================================

/**
 * Build a config object distributing reviewers across multiple providers/models.
 * - Reviewers: distributed evenly across selections
 * - Supporters: use different providers than reviewers (diversity)
 * - Moderator/Head: strongest model (highest context window from selections)
 */
export function buildMultiProviderConfig(params: MultiProviderConfigParams): GeneratedConfig {
  const {
    selections,
    reviewerCount,
    discussion,
    mode = 'pragmatic',
    language = 'en',
    maxRounds,
    supporterSelection,
    devilsAdvocateSelection,
    moderatorSelection,
    moderatorEnabled,
    headSelection,
  } = params;

  if (reviewerCount < 1 || reviewerCount > 10) {
    throw new Error(`reviewerCount must be between 1 and 10, got ${reviewerCount}`);
  }
  if (selections.length === 0) {
    throw new Error('At least one provider/model selection is required');
  }

  const preset = getModePreset(mode);
  const selectionBackend = (sel: ProviderModelSelection): Backend => (
    sel.backend === 'cli' ? sel.provider as Backend : 'api'
  );
  const selectionProvider = (sel: ProviderModelSelection): string | undefined => (
    sel.backend === 'cli'
      ? sel.runtimeProvider
      : sel.provider
  );
  const agentFromSelection = (id: string, sel: ProviderModelSelection, label?: string): AgentEntry => ({
    id,
    ...(label ? { label } : {}),
    model: sel.model,
    backend: selectionBackend(sel),
    provider: selectionProvider(sel),
    enabled: true,
    timeout: 120,
  } as AgentEntry);

  // Distribute reviewers across providers evenly
  const reviewers: AgentEntry[] = [];
  for (let i = 0; i < reviewerCount; i++) {
    const sel = selections[i % selections.length]!;
    reviewers.push(agentFromSelection(`r${i + 1}`, sel, `${sel.provider} ${sel.model} Reviewer ${i + 1}`));
  }

  // Supporters: prefer a different provider than the first reviewer for diversity
  const supporterSel = supporterSelection ?? (selections.length > 1 ? selections[1]! : selections[0]!);
  const devilsSel = devilsAdvocateSelection ?? supporterSel;

  // Moderator/Head: strongest model (highest context window, then first in list)
  const strongest = [...selections].sort((a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0))[0]!;
  const moderatorSel = moderatorSelection ?? strongest;
  const headSel = headSelection ?? moderatorSel;

  return {
    mode,
    language,
    reviewers,
    supporters: {
      pool: [agentFromSelection('s1', supporterSel)],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: agentFromSelection('da', devilsSel),
      personaPool: preset.personaPool,
      personaAssignment: 'random',
    },
    moderator: {
      model: moderatorSel.model,
      backend: selectionBackend(moderatorSel),
      provider: selectionProvider(moderatorSel),
      enabled: moderatorEnabled ?? true,
    },
    head: {
      backend: selectionBackend(headSel),
      model: headSel.model,
      provider: selectionProvider(headSel),
      enabled: true,
    },
    discussion: {
      enabled: discussion !== false,
      maxRounds: maxRounds ?? preset.maxRounds,
      registrationThreshold: preset.registrationThreshold,
      codeSnippetRange: 10,
    },
    errorHandling: {
      maxRetries: 2,
      forfeitThreshold: 0.7,
    },
  };
}

// ============================================================================
// Default model per provider
// ============================================================================

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.3-codex',
  openrouter: 'xiaomi/mimo-v2.5',
  'opencode-go': 'deepseek-v4-flash',
  'opencode-zen': 'gpt-5.4-mini',
  groq: 'llama-3.3-70b-versatile',
};

const OPENROUTER_FAST_REVIEWERS = [
  'google/gemini-2.5-flash',
  'deepseek/deepseek-v4-flash',
  'z-ai/glm-4.7-flash',
  'qwen/qwen3-coder-flash',
];

const OPENROUTER_STARTER_REVIEWERS = [
  'qwen/qwen3-coder-flash',
  'qwen/qwen3-next-80b-a3b-instruct',
];

const CLI_BACKEND_DEFAULT_MODELS: Record<string, string> = {
  antigravity: 'default',
  claude: 'haiku',
  codex: 'gpt-5.4-mini',
  cursor: 'default',
  gemini: 'gemini-2.5-pro',
  opencode: 'deepseek-v4-flash',
  pi: 'default',
};

const LOCAL_CLI_SUPPORTER_MODEL = 'gpt-5.3-codex-spark';
const LOCAL_CLI_HEAD_MODEL = 'gpt-5.5';
const LOCAL_CLI_DEVILS_ADVOCATE_MODEL = 'kimi-k2.7-code';

const CLI_BACKEND_RUNTIME_PROVIDERS: Record<string, string> = {
  opencode: 'opencode-go',
};

const CLI_PRESET_ORDER = [
  'codex',
  'claude',
  'opencode',
  'cursor',
  'antigravity',
  'gemini',
  'pi',
];

const CLI_PRESET_EXCLUDED_BACKENDS = new Set(['copilot']);

// ============================================================================
// Static fallback presets (used when catalog/detection unavailable)
// ============================================================================

const FALLBACK_PRESETS: DynamicPreset[] = [
  {
    id: 'action',
    label: 'GitHub Action review (OpenRouter cheap)',
    labelKo: 'GitHub Action \uB9AC\uBDF0 (OpenRouter \uC800\uBE44\uC6A9)',
    providers: ['openrouter'],
    models: { openrouter: ACTION_CHEAP_PRESET.reviewers[0]!.model },
    reviewerModels: ACTION_CHEAP_PRESET.reviewers.map((reviewer) => reviewer.model),
    reviewerCount: ACTION_CHEAP_PRESET.reviewers.length,
    discussion: true,
    maxRounds: ACTION_CHEAP_PRESET.maxRounds,
    backend: 'api',
    roleSelections: {
      supporter: { provider: 'openrouter', model: ACTION_CHEAP_PRESET.supporter.model, backend: 'api' },
      devilsAdvocate: { provider: 'openrouter', model: ACTION_CHEAP_PRESET.devilsAdvocate.model, backend: 'api' },
      moderator: { provider: 'openrouter', model: ACTION_CHEAP_PRESET.moderator.model, backend: 'api' },
      moderatorEnabled: false,
      head: { provider: 'openrouter', model: ACTION_CHEAP_PRESET.head.model, backend: 'api' },
    },
  },
  {
    id: 'quick',
    label: 'Quick review (OpenRouter)',
    labelKo: '\uBE60\uB978 \uB9AC\uBDF0 (OpenRouter)',
    providers: ['openrouter'],
    models: { openrouter: OPENROUTER_FAST_REVIEWERS[0]! },
    reviewerModels: OPENROUTER_FAST_REVIEWERS,
    reviewerCount: OPENROUTER_FAST_REVIEWERS.length,
    discussion: false,
    backend: 'api',
  },
  {
    id: 'thorough',
    label: 'Thorough review (OpenRouter)',
    labelKo: '\uC2EC\uCE35 \uB9AC\uBDF0 (OpenRouter)',
    providers: ['openrouter'],
    models: { openrouter: 'xiaomi/mimo-v2.5' },
    reviewerCount: 3,
    discussion: true,
    backend: 'api',
  },
  {
    id: 'free',
    label: 'Starter review (OpenRouter)',
    labelKo: '\uC2A4\uD0C0\uD130 \uB9AC\uBDF0 (OpenRouter)',
    providers: ['openrouter'],
    models: { openrouter: 'qwen/qwen3-coder-30b-a3b-instruct' },
    reviewerCount: 2,
    discussion: false,
    backend: 'api',
  },
];

// ============================================================================
// Dynamic Preset Generation (#173 Phase 3-3)
// ============================================================================

/**
 * FREE_PROVIDERS — providers known to offer free models.
 */
const FREE_PROVIDERS = new Set<string>();

/**
 * Generate presets dynamically based on detected environment and catalog.
 * Falls back to groq-based presets when nothing is detected.
 */
export function generatePresets(
  env: EnvironmentReport,
  catalog: ModelsCatalog | null,
  cliBackends?: DetectedCli[],
): DynamicPreset[] {
  const detectedApiProviders = env.apiProviders.filter((p: ApiProviderStatus) => p.available).map((p: ApiProviderStatus) => p.provider);
  const detected = detectedApiProviders.includes('openrouter') ? ['openrouter'] : detectedApiProviders;
  const presets: DynamicPreset[] = [];

  // If nothing detected at all, return fallback presets
  if (detected.length === 0 && (!cliBackends || cliBackends.filter((c) => c.available).length === 0)) {
    return FALLBACK_PRESETS;
  }

  // Helper: get best model for a provider from catalog or fallback
  function bestModel(provider: string): string {
    if (catalog) {
      const top = getTopModels(catalog, provider, 1);
      if (top.length > 0 && top[0]!.id) {
        // Extract model name from id (strip provider prefix)
        const id = top[0]!.id;
        const slash = id.indexOf('/');
        return slash > 0 ? id.slice(slash + 1) : id;
      }
    }
    return PROVIDER_DEFAULT_MODELS[provider] ?? 'xiaomi/mimo-v2.5';
  }

  presets.push(FALLBACK_PRESETS.find((preset) => preset.id === 'action')!);

  // 1. "Quick review" — fastest available provider, no discussion
  if (detected.length > 0) {
    const fastest = detected[0]!;
    const openrouterFast = fastest === 'openrouter';
    presets.push({
      id: 'quick',
      label: `Quick review (${fastest})`,
      labelKo: `\uBE60\uB978 \uB9AC\uBDF0 (${fastest})`,
      providers: [fastest],
      models: { [fastest]: openrouterFast ? OPENROUTER_FAST_REVIEWERS[0]! : bestModel(fastest) },
      reviewerModels: openrouterFast ? OPENROUTER_FAST_REVIEWERS : undefined,
      reviewerCount: openrouterFast ? OPENROUTER_FAST_REVIEWERS.length : 1,
      discussion: false,
      backend: 'api',
    });
  }

  // 2. "Free review" — only if free-tier providers detected
  const freeDetected = detected.filter((p: string) => FREE_PROVIDERS.has(p));
  if (freeDetected.length > 0) {
    const freeModels: Record<string, string> = {};
    for (const prov of freeDetected) {
      freeModels[prov] = bestModel(prov);
    }
    presets.push({
      id: 'free',
      label: `Free review (${freeDetected.join(' + ')})`,
      labelKo: `\uBB34\uB8CC \uB9AC\uBDF0 (${freeDetected.join(' + ')})`,
      providers: freeDetected,
      models: freeModels,
      reviewerCount: Math.min(freeDetected.length * 2, 5),
      discussion: false,
      backend: 'api',
    });
  } else if (detected.includes('openrouter')) {
    presets.push({
      id: 'free',
      label: 'Starter review (OpenRouter)',
      labelKo: '\uC2A4\uD0C0\uD130 \uB9AC\uBDF0 (OpenRouter)',
      providers: ['openrouter'],
      models: { openrouter: OPENROUTER_STARTER_REVIEWERS[0]! },
      reviewerModels: OPENROUTER_STARTER_REVIEWERS,
      reviewerCount: OPENROUTER_STARTER_REVIEWERS.length,
      discussion: false,
      backend: 'api',
    });
  }

  // 3. "Thorough review" — multi-provider if 2+ detected, 3-5 reviewers, discussion on
  if (detected.length >= 2) {
    const thorough = detected.slice(0, 4); // cap at 4 providers
    const thoroughModels: Record<string, string> = {};
    for (const prov of thorough) {
      thoroughModels[prov] = bestModel(prov);
    }
    presets.push({
      id: 'thorough',
      label: `Thorough review (${thorough.join(', ')})`,
      labelKo: `\uC2EC\uCE35 \uB9AC\uBDF0 (${thorough.join(', ')})`,
      providers: thorough,
      models: thoroughModels,
      reviewerCount: Math.min(thorough.length + 2, 5),
      discussion: true,
      backend: 'api',
    });
  } else if (detected.length === 1) {
    const prov = detected[0]!;
    presets.push({
      id: 'thorough',
      label: `Thorough review (${prov})`,
      labelKo: `\uC2EC\uCE35 \uB9AC\uBDF0 (${prov})`,
      providers: [prov],
      models: { [prov]: bestModel(prov) },
      reviewerCount: 3,
      discussion: true,
      backend: 'api',
    });
  }

  // 4. "CLI review" — if CLI backends detected
  const availableCli = [...(cliBackends?.filter((c) => c.available && !CLI_PRESET_EXCLUDED_BACKENDS.has(c.backend)) ?? [])].sort((a, b) => {
    const aIndex = CLI_PRESET_ORDER.indexOf(a.backend);
    const bIndex = CLI_PRESET_ORDER.indexOf(b.backend);
    const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return aRank - bRank || a.backend.localeCompare(b.backend);
  });
  if (availableCli.length > 0) {
    const selectedCli = availableCli.slice(0, 6);
    const hasCliBackend = (backend: string) => selectedCli.some((cli) => cli.backend === backend);
    const roleSelections: DynamicPreset['roleSelections'] = {};
    if (hasCliBackend('codex')) {
      roleSelections.supporter = {
        provider: 'codex',
        model: LOCAL_CLI_SUPPORTER_MODEL,
        backend: 'cli',
      };
      roleSelections.moderator = {
        provider: 'codex',
        model: LOCAL_CLI_HEAD_MODEL,
        backend: 'cli',
      };
      roleSelections.head = {
        provider: 'codex',
        model: LOCAL_CLI_HEAD_MODEL,
        backend: 'cli',
      };
    }
    if (hasCliBackend('opencode')) {
      roleSelections.devilsAdvocate = {
        provider: 'opencode',
        model: LOCAL_CLI_DEVILS_ADVOCATE_MODEL,
        backend: 'cli',
        runtimeProvider: CLI_BACKEND_RUNTIME_PROVIDERS.opencode,
      };
    }
    const models: Record<string, string> = {};
    const runtimeProviders: Record<string, string> = {};
    for (const cli of selectedCli) {
      models[cli.backend] = CLI_BACKEND_DEFAULT_MODELS[cli.backend] ?? 'auto';
      const runtimeProvider = CLI_BACKEND_RUNTIME_PROVIDERS[cli.backend];
      if (runtimeProvider) {
        runtimeProviders[cli.backend] = runtimeProvider;
      }
    }
    presets.push({
      id: 'cli',
      label: `Local CLI ensemble (${selectedCli.map((c) => c.backend).join(', ')})`,
      labelKo: `\uB85C\uCEEC CLI \uC559\uC0C1\uBE14 (${selectedCli.map((c) => c.backend).join(', ')})`,
      providers: selectedCli.map((c) => c.backend),
      models,
      runtimeProviders,
      reviewerCount: selectedCli.length,
      discussion: true,
      backend: 'cli',
      ...(Object.keys(roleSelections).length > 0 ? { roleSelections } : {}),
    });
  }

  // If we somehow have no presets (edge case), return fallback
  return presets.length > 0 ? presets : FALLBACK_PRESETS;
}

// ============================================================================
// Provider option formatting for multiselect (#173 Phase 3-1)
// ============================================================================

function formatProviderOption(
  name: string,
  envVar: string,
  catalog: ModelsCatalog | null,
): { value: string; label: string; hint?: string } {
  const detected = !!process.env[envVar];
  const tier = getProviderTier(name);
  const tierTag = `[${TIER_LABELS[tier].label}]`;
  let label = `${name} ${tierTag}`;
  if (detected) {
    label += '  \u2713 key detected';
  }

  let hint: string | undefined;
  if (catalog) {
    const stats = getProviderStats(catalog, name);
    if (stats.total > 0) {
      const parts: string[] = [`${stats.total} models`];
      if (stats.free > 0) parts.push(`${stats.free} free`);
      hint = parts.join(', ');
    }
  }

  return { value: name, label, hint };
}

// ============================================================================
// Model recommendation formatting (#173 Phase 3-2)
// ============================================================================

function formatModelOption(model: ModelEntry): { value: string; label: string } {
  // Extract display model name from id
  const id = model.id;
  const slash = id.indexOf('/');
  const displayName = slash > 0 ? id.slice(slash + 1) : id;

  const tags: string[] = [];
  const hasCost = model.cost && (model.cost.input > 0 || model.cost.output > 0);
  if (hasCost) tags.push('PAID');
  else tags.push('FREE');
  if (model.limit?.context) tags.push(`ctx=${Math.round(model.limit.context / 1000)}k`);
  if (model.reasoning) tags.push('reasoning');

  const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
  return { value: displayName, label: `${model.name || displayName}${tagStr}` };
}

/**
 * Search + select helper: optional text filter → filtered select/multiselect.
 * If options are <= 10, skip search and show directly.
 */
async function searchAndSelect<T extends string>(
  options: Array<{ value: T; label: string; hint?: string }>,
  message: string,
  multi: boolean,
  ko: boolean,
): Promise<T | T[]> {
  let filtered = options;

  // Only offer search when list is long
  if (options.length > 10) {
    const searchQuery = await p.text({
      message: ko ? `${message} (검색어 입력, 빈 칸이면 전체 표시)` : `${message} (type to search, enter for all)`,
      placeholder: ko ? '검색...' : 'search...',
      defaultValue: '',
    });
    if (p.isCancel(searchQuery)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const query = (searchQuery as string).toLowerCase().trim();
    if (query) {
      filtered = options.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query));
      if (filtered.length === 0) {
        p.log.warn(ko ? '\uAC80\uC0C9 \uACB0\uACFC \uC5C6\uC74C. \uC804\uCCB4 \uBAA9\uB85D \uD45C\uC2DC.' : 'No matches. Showing all.');
        filtered = options;
      }
    }
  }

  if (multi) {
    const result = await p.multiselect({ message, options: filtered as any, required: true });
    if (p.isCancel(result)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    return result as T[];
  } else {
    const result = await p.select({ message, options: filtered as any });
    if (p.isCancel(result)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    return result as T;
  }
}

/**
 * Get localized text for the wizard based on current locale.
 */
function isKorean(): boolean {
  return detectLocale() === 'ko';
}

// ============================================================================
// GitHub Actions workflow
// ============================================================================

/**
 * Write the GitHub Actions workflow template to {baseDir}/.github/workflows/codeagora-review.yml.
 * Creates .github/workflows/ if it does not exist.
 * Skips writing (returns false) when the file already exists and force is false.
 * Returns true when the file was written.
 */
export async function writeGitHubWorkflow(
  baseDir: string,
  force = false
): Promise<boolean> {
  const workflowDir = path.join(baseDir, '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'codeagora-review.yml');

  const exists = await fileExists(workflowPath);
  if (exists && !force) {
    return false;
  }

  await fs.mkdir(workflowDir, { recursive: true });
  await fs.writeFile(workflowPath, renderCodeAgoraWorkflowTemplate(), 'utf-8');
  return true;
}

function selectionsFromPreset(selected: DynamicPreset): ProviderModelSelection[] {
  if (selected.reviewerModels?.length) {
    return selected.reviewerModels.map((model) => ({
      provider: selected.providers[0]!,
      model,
      backend: selected.backend,
      runtimeProvider: selected.runtimeProviders?.[selected.providers[0]!],
    }));
  }

  return selected.providers.map((provider) => ({
    provider,
    model: selected.models[provider] ?? PROVIDER_DEFAULT_MODELS[provider] ?? 'xiaomi/mimo-v2.5',
    backend: selected.backend,
    runtimeProvider: selected.runtimeProviders?.[provider],
  }));
}

export async function buildPresetConfig(preset: string): Promise<GeneratedConfig> {
  const canonicalPreset = resolvePresetAlias(preset);
  if (!canonicalPreset) {
    throw new Error('Preset must be specified.');
  }
  if (canonicalPreset === 'action') {
    return buildActionPresetConfig({ language: 'en' }) as GeneratedConfig;
  }

  const [env, catalog, cliBackends] = await Promise.all([
    Promise.resolve(detectEnvironment()),
    loadModelsCatalog().catch(() => null),
    detectCliBackends().catch(() => [] as DetectedCli[]),
  ]);

  const dynamicPresets = generatePresets(env, catalog, cliBackends);
  const selected = dynamicPresets.find((p) => p.id === canonicalPreset);
  if (!selected) {
    const available = dynamicPresets.map((p) => p.id).join(', ');
    throw new Error(
      `Unknown preset "${preset}". Available presets: ${available || 'quick, free, thorough'}`
    );
  }

  const selections = selectionsFromPreset(selected);

  if (selections.length === 0) {
    throw new Error(`Preset "${preset}" has no providers.`);
  }

  const primaryProvider = selections[0]!.provider;
  const primaryModel = selections[0]!.model;

  if (selections.length === 1 && selected.backend === 'api') {
    return buildCustomConfig({
      provider: primaryProvider,
      model: primaryModel,
      reviewerCount: selected.reviewerCount,
      discussion: selected.discussion,
      language: 'en',
      mode: 'pragmatic',
    });
  }

  return buildMultiProviderConfig({
    selections,
    reviewerCount: selected.reviewerCount,
    discussion: selected.discussion,
    language: 'en',
    mode: 'pragmatic',
    maxRounds: selected.maxRounds,
    supporterSelection: selected.roleSelections?.supporter,
    devilsAdvocateSelection: selected.roleSelections?.devilsAdvocate,
    moderatorSelection: selected.roleSelections?.moderator,
    moderatorEnabled: selected.roleSelections?.moderatorEnabled,
    headSelection: selected.roleSelections?.head,
  });
}

// ============================================================================
// Public API
// ============================================================================

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { format, force, baseDir, ci, preset } = options;
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  // Ensure .ca/ directory exists
  const caDir = path.join(baseDir, '.ca');
  await fs.mkdir(caDir, { recursive: true });

  // Config file
  const configFileName = format === 'yaml' ? 'config.yaml' : 'config.json';
  const configPath = path.join(caDir, configFileName);
  const configContent = preset
    ? JSON.stringify(await buildPresetConfig(preset), null, 2)
    : generateMinimalTemplate(format);
  await writeFile(configPath, configContent, force, created, skipped);

  // Personas
  await writePersonas(baseDir, force, created, skipped);

  // .reviewignore
  const reviewIgnorePath = path.join(baseDir, '.reviewignore');
  const reviewIgnoreContent = generateReviewIgnore();
  await writeFile(reviewIgnorePath, reviewIgnoreContent, force, created, skipped);

  // GitHub Actions workflow
  if (ci) {
    const workflowPath = path.join(baseDir, '.github', 'workflows', 'codeagora-review.yml');
    const written = await writeGitHubWorkflow(baseDir, force);
    if (written) {
      created.push(workflowPath);
    } else {
      skipped.push(workflowPath);
    }
  }

  return { created, skipped, warnings };
}

export async function runInitInteractive(options: InitOptions): Promise<InitResult> {
  let { force } = options;
  const { baseDir } = options;
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const ko = isKorean();

  p.intro(t('cli.init.welcome'));

  // Check if config already exists — ask to overwrite
  if (!force) {
    const configJsonPath = path.join(baseDir, '.ca', 'config.json');
    const configYamlPath = path.join(baseDir, '.ca', 'config.yaml');
    const existingConfig = await fs.access(configJsonPath).then(() => configJsonPath).catch(() =>
      fs.access(configYamlPath).then(() => configYamlPath).catch(() => null)
    );
    if (existingConfig) {
      const overwrite = await p.confirm({
        message: ko
          ? `\uC124\uC815 \uD30C\uC77C\uC774 \uC774\uBBF8 \uC788\uC2B5\uB2C8\uB2E4 (${path.basename(existingConfig)}). \uB36E\uC5B4\uC4F0\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`
          : `Config already exists (${path.basename(existingConfig)}). Overwrite?`,
      });
      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
        throw new UserCancelledError();
      }
      // Set force to true so writeFile won't skip
      force = true;
    }
  }

  // Detect environment, catalog, and CLI backends in parallel
  const [env, catalog, cliBackends] = await Promise.all([
    Promise.resolve(detectEnvironment()),
    loadModelsCatalog(),
    detectCliBackends().catch(() => [] as DetectedCli[]),
  ]);

  // Free provider recommendation: show if no API keys are detected
  if (env.apiProviders.filter((p) => p.available).length === 0) {
    p.note(t('cli.init.noKeys'));
  }

  // Generate dynamic presets based on detected environment
  const dynamicPresets = generatePresets(env, catalog, cliBackends);

  // Step 1: Preset or custom
  const setupMode = await p.select({
    message: ko ? '\uC124\uC815 \uBC29\uBC95\uC744 \uC120\uD0DD\uD558\uC138\uC694' : 'How would you like to set up?',
    options: [
      ...dynamicPresets.map((preset) => ({
        value: preset.id,
        label: ko ? preset.labelKo : preset.label,
      })),
      { value: 'custom', label: ko ? '\uC9C1\uC811 \uC124\uC815' : 'Custom setup' },
    ],
  });
  if (p.isCancel(setupMode)) {
    p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
    throw new UserCancelledError();
  }

  let configData: GeneratedConfig;
  let format: 'json' | 'yaml';
  let primaryProvider: string;
  let primaryModel: string;
  let selectedLanguage: Language = ko ? 'ko' : 'en';

  const selectedPreset = dynamicPresets.find((pr) => pr.id === setupMode);
  if (selectedPreset) {
    // Use preset defaults — build selections from preset
    const selections = selectionsFromPreset(selectedPreset);

    format = options.format === 'yaml' ? 'yaml' : 'json';
    primaryProvider = selections[0]!.provider;
    primaryModel = selections[0]!.model;

    // Language selection
    const languageSelection = await p.select({
      message: ko ? '\uB9AC\uBDF0 \uC5B8\uC5B4?' : 'Review language?',
      options: [
        { value: 'en', label: 'English' },
        { value: 'ko', label: '\uD55C\uAD6D\uC5B4' },
      ],
      initialValue: ko ? 'ko' : 'en',
    });
    if (p.isCancel(languageSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const language = languageSelection as Language;
    selectedLanguage = language;

    if (selections.length === 1 && selectedPreset.backend === 'api') {
      configData = buildCustomConfig({
        provider: primaryProvider,
        model: primaryModel,
        reviewerCount: selectedPreset.reviewerCount,
        discussion: selectedPreset.discussion,
        language,
      });
    } else {
      configData = buildMultiProviderConfig({
        selections,
        reviewerCount: selectedPreset.reviewerCount,
        discussion: selectedPreset.discussion,
        language,
        maxRounds: selectedPreset.maxRounds,
        supporterSelection: selectedPreset.roleSelections?.supporter,
        devilsAdvocateSelection: selectedPreset.roleSelections?.devilsAdvocate,
        moderatorSelection: selectedPreset.roleSelections?.moderator,
        moderatorEnabled: selectedPreset.roleSelections?.moderatorEnabled,
        headSelection: selectedPreset.roleSelections?.head,
      });
    }
  } else {
    // Custom setup: full wizard

    // Config format
    const formatSelection = await p.select({
      message: ko ? '\uC124\uC815 \uD30C\uC77C \uD615\uC2DD?' : 'Config format?',
      options: [
        { value: 'json', label: 'JSON' },
        { value: 'yaml', label: 'YAML' },
      ],
    });
    if (p.isCancel(formatSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    format = formatSelection as 'json' | 'yaml';

    // Provider multiselect — detect available API keys + CLI backends, include catalog stats
    // Sort by tier (Tier 1 first) for better UX
    const providerEntries = Object.entries(PROVIDER_ENV_VARS)
      .sort((a, b) => getProviderTier(a[0]) - getProviderTier(b[0]));
    const providerOptions = providerEntries.map(([name, envVar]) =>
      formatProviderOption(name, envVar, catalog),
    );

    // Add detected CLI backends as selectable options (sorted by tier)
    const availableCliTools = [...cliBackends.filter((c) => c.available)]
      .sort((a, b) => getCliBackendTier(a.backend) - getCliBackendTier(b.backend));
    for (const cli of availableCliTools) {
      const cliTier = getCliBackendTier(cli.backend);
      providerOptions.push({
        value: `cli:${cli.backend}`,
        label: `${cli.backend} [${TIER_LABELS[cliTier].label}]  \u2713 CLI detected`,
        hint: `backend: ${cli.bin}`,
      });
    }

    // Default selections: providers with detected API keys
    const defaultProviders = env.apiProviders.filter((p) => p.available).map((p) => p.provider);

    const providerSelection = await p.multiselect({
      message: ko ? '\uC0AC\uC6A9\uD560 \uD504\uB85C\uBC14\uC774\uB354\uB97C \uC120\uD0DD\uD558\uC138\uC694' : 'Select providers (space to toggle, enter to confirm)',
      options: providerOptions,
      initialValues: defaultProviders,
      required: true,
    });
    if (p.isCancel(providerSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const selectedProviders = providerSelection as string[];

    // CLI backend → models.dev provider mapping
    const CLI_TO_PROVIDER: Record<string, string> = {
      antigravity: 'openrouter',
      claude: 'anthropic',
      codex: 'openai',
      copilot: 'openai',
      gemini: 'openrouter',
      cursor: 'openai',
      opencode: 'openrouter',
      pi: 'openrouter',
    };

    // Per-provider model selection (multiple models per provider for diversity)
    const selections: ProviderModelSelection[] = [];
    for (const prov of selectedProviders) {
      // Handle CLI backend selections (e.g. "cli:claude")
      if (prov.startsWith('cli:')) {
        const backend = prov.slice(4);
        const mappedProvider = CLI_TO_PROVIDER[backend];

        // Try to show model list from the mapped provider
        if (catalog && mappedProvider) {
          const topModels = getTopModels(catalog, mappedProvider, 20);
          if (topModels.length > 0) {
            const modelOptions = topModels.map((m) => formatModelOption(m));
            const msg = ko ? `${backend} CLI \uBAA8\uB378 \uC120\uD0DD` : `Model for ${backend} CLI`;
            const modelSelection = await searchAndSelect(modelOptions, msg, false, ko) as string;
            selections.push({
              provider: backend,
              model: modelSelection,
              backend: 'cli',
              runtimeProvider: CLI_BACKEND_RUNTIME_PROVIDERS[backend],
            });
            continue;
          }
        }

        // No mapped provider — show all available models across all providers
        if (catalog) {
          const allModels: { model: ModelEntry; providerName: string }[] = [];
          for (const caId of Object.keys(PROVIDER_ENV_VARS)) {
            for (const m of getTopModels(catalog, caId, 5)) {
              allModels.push({ model: m, providerName: caId });
            }
          }
          if (allModels.length > 0) {
            const modelOptions = allModels.map(({ model: m, providerName }) => {
              const opt = formatModelOption(m);
              return { value: opt.value, label: `${providerName}/${opt.label}` };
            });
            const msg = ko ? `${backend} CLI \uBAA8\uB378 \uC120\uD0DD` : `Model for ${backend} CLI`;
            const modelSelection = await searchAndSelect(modelOptions, msg, false, ko) as string;
            selections.push({
              provider: backend,
              model: modelSelection,
              backend: 'cli',
              runtimeProvider: CLI_BACKEND_RUNTIME_PROVIDERS[backend],
            });
            continue;
          }
        }

        // Final fallback: text input
        const cliModelInput = await p.text({
          message: ko ? `${backend} CLI \uBAA8\uB378 \uC774\uB984?` : `Model for ${backend} CLI?`,
          placeholder: 'model-name',
        });
        if (p.isCancel(cliModelInput)) {
          p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
          throw new UserCancelledError();
        }
        selections.push({
          provider: backend,
          model: (cliModelInput as string) || CLI_BACKEND_DEFAULT_MODELS[backend] || backend,
          backend: 'cli',
          runtimeProvider: CLI_BACKEND_RUNTIME_PROVIDERS[backend],
        });
        continue;
      }

      if (catalog) {
        const topModels = getTopModels(catalog, prov, 20);
        if (topModels.length > 0) {
          // Show model list with search — allow multiselect for diverse reviewers
          const modelOptions = topModels.map((m) => formatModelOption(m));
          const msg = ko ? `${prov} \uBAA8\uB378 \uC120\uD0DD (\uC5EC\uB7EC \uAC1C \uAC00\uB2A5)` : `Models for ${prov} (select multiple)`;
          const selectedModels = await searchAndSelect(modelOptions, msg, true, ko) as string[];

          for (const selectedModel of selectedModels) {
            const entry = topModels.find((m) => {
              const id = m.id;
              const slash = id.indexOf('/');
              return (slash > 0 ? id.slice(slash + 1) : id) === selectedModel;
            });
            selections.push({
              provider: prov,
              model: selectedModel,
              backend: 'api',
              contextWindow: entry?.limit?.context,
              isFree: entry?.cost ? (entry.cost.input === 0 && entry.cost.output === 0) : undefined,
            });
          }
          continue;
        }
      }

      // Fallback: text input with default model
      const defaultModel = PROVIDER_DEFAULT_MODELS[prov] ?? 'xiaomi/mimo-v2.5';
      const modelInput = await p.text({
        message: ko ? `${prov} \uBAA8\uB378 \uC774\uB984?` : `Model for ${prov}?`,
        placeholder: defaultModel,
        defaultValue: defaultModel,
      });
      if (p.isCancel(modelInput)) {
        p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
        throw new UserCancelledError();
      }
      const inputModel = (modelInput as string) || defaultModel;
      selections.push({ provider: prov, model: inputModel, backend: 'api' });
    }

    primaryProvider = selections[0]!.provider;
    primaryModel = selections[0]!.model;

    // Reviewer count
    const countSelection = await p.select({
      message: ko ? '\uB9AC\uBDF0\uC5B4 \uC218?' : 'How many reviewers?',
      options: [
        { value: '1', label: ko ? '1 (\uCD5C\uC18C)' : '1 (minimal)' },
        { value: '3', label: ko ? '3 (\uAD8C\uC7A5)' : '3 (recommended)' },
        { value: '5', label: ko ? '5 (\uC2EC\uCE35)' : '5 (thorough)' },
      ],
      initialValue: '3',
    });
    if (p.isCancel(countSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const reviewerCount = parseInt(countSelection as string, 10);

    // Enable discussion
    const discussionSelection = await p.confirm({
      message: ko ? 'L2 \uD1A0\uB860 (\uBA40\uD2F0 \uC5D0\uC774\uC804\uD2B8 \uB514\uBCA0\uC774\uD2B8) \uD65C\uC131\uD654?' : 'Enable L2 discussion (multi-agent debate)?',
      initialValue: true,
    });
    if (p.isCancel(discussionSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const discussion = discussionSelection as boolean;

    // Review mode
    const modeSelection = await p.select({
      message: ko ? '\uB9AC\uBDF0 \uBAA8\uB4DC?' : 'Review mode?',
      options: [
        { value: 'pragmatic', label: ko ? 'Pragmatic (\uADE0\uD615\uC801, \uC624\uD0D0 \uAC10\uC18C)' : 'Pragmatic (balanced, fewer false positives)' },
        { value: 'strict', label: ko ? 'Strict (\uBCF4\uC548 \uC911\uC2EC, \uB0AE\uC740 \uC784\uACC4\uAC12)' : 'Strict (security-focused, lower thresholds)' },
      ],
      initialValue: 'pragmatic',
    });
    if (p.isCancel(modeSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const mode = modeSelection as ReviewMode;

    // Language
    const languageSelection = await p.select({
      message: ko ? '\uB9AC\uBDF0 \uC5B8\uC5B4?' : 'Review language?',
      options: [
        { value: 'en', label: 'English' },
        { value: 'ko', label: '\uD55C\uAD6D\uC5B4' },
      ],
      initialValue: ko ? 'ko' : 'en',
    });
    if (p.isCancel(languageSelection)) {
      p.cancel(ko ? '\uC124\uC815\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.' : 'Setup cancelled.');
      throw new UserCancelledError();
    }
    const language = languageSelection as Language;
    selectedLanguage = language;

    // Build config from selections
    if (selections.length === 1) {
      configData = buildCustomConfig({
        provider: primaryProvider,
        model: primaryModel,
        reviewerCount,
        discussion,
        mode,
        language,
      });
    } else {
      configData = buildMultiProviderConfig({
        selections,
        reviewerCount,
        discussion,
        mode,
        language,
      });
    }
  }

  // Warn if the primary provider's API key is missing
  const primaryEnvVar = getProviderEnvVar(primaryProvider);
  if (primaryEnvVar && !process.env[primaryEnvVar]) {
    p.note(
      `${primaryEnvVar} is not set. Reviews will fail until you set it:\n\n` +
      `  export ${primaryEnvVar}=your_key_here\n\n` +
      (FREE_PROVIDERS.has(primaryProvider)
        ? `${primaryProvider} offers a free tier — sign up at the provider's website to get a key.`
        : `Get an API key from your ${primaryProvider} account dashboard.`),
      'Missing API Key',
    );
  }

  // Ensure .ca/ directory exists
  const caDir = path.join(baseDir, '.ca');
  await fs.mkdir(caDir, { recursive: true });

  // Config file
  const configFileName = format === 'yaml' ? 'config.yaml' : 'config.json';
  const configPath = path.join(caDir, configFileName);
  const configContent = format === 'yaml'
    ? yamlStringify(configData, { lineWidth: 120 })
    : JSON.stringify(configData, null, 2);
  await writeFile(configPath, configContent, force, created, skipped);

  // Personas
  await writePersonas(baseDir, force, created, skipped);

  // .reviewignore
  const reviewIgnorePath = path.join(baseDir, '.reviewignore');
  const reviewIgnoreContent = generateReviewIgnore();
  await writeFile(reviewIgnorePath, reviewIgnoreContent, force, created, skipped);

  // Provider health check: ping one model from each configured provider
  const envVar = getProviderEnvVar(primaryProvider);
  if (envVar && process.env[envVar]) {
    const spinner = p.spinner();
    spinner.start(t('cli.init.healthCheck'));
    try {
      const { getModel } = await import('@codeagora/core/l1/provider-registry.js');
      const { generateText } = await import('ai');
      const languageModel = getModel(primaryProvider, primaryModel);
      await generateText({ model: languageModel, prompt: 'Say OK', abortSignal: AbortSignal.timeout(10_000) });
      spinner.stop(`${primaryProvider}/${primaryModel} \u2713`);
    } catch {
      spinner.stop(`${primaryProvider}/${primaryModel} \u2717 (could not connect)`);
      warnings.push(`Provider ${primaryProvider} health check failed. Verify your API key.`);
    }
  }

  // GitHub Actions setup
  const setupCI = await p.confirm({
    message: ko
      ? 'GitHub Actions 워크플로우를 생성하시겠습니까? (PR 자동 리뷰)'
      : 'Set up GitHub Actions workflow? (auto-review on PRs)',
    initialValue: true,
  });

  if (!p.isCancel(setupCI) && setupCI) {
    const workflowDir = path.join(baseDir, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });

    const workflowContent = renderCodeAgoraWorkflowTemplate({ language: selectedLanguage });

    const workflowPath = path.join(workflowDir, 'codeagora-review.yml');
    await writeFile(workflowPath, workflowContent, force, created, skipped);

    // Show secrets setup instructions
    const secretNames = [getProviderEnvVar('openrouter')];
    const secretsList = secretNames.map((s) => `  • ${s}`).join('\n');
    p.note(
      ko
        ? `워크플로우가 생성되었습니다.\n\n레포 Settings → Secrets → Actions에 다음 시크릿을 추가하세요:\n${secretsList}`
        : `Workflow created.\n\nAdd these secrets in your repo Settings → Secrets → Actions:\n${secretsList}`,
      ko ? '🔑 시크릿 설정 필요' : '🔑 Secrets required',
    );
  }

  p.outro(t('cli.init.created', { path: configPath }));

  return { created, skipped, warnings };
}
