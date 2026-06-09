/**
 * Shared Preset Builder
 * Generates complete Config objects from provider/model selections.
 * Used by CLI init wizard and downstream adapters.
 */

import type { Config } from '../types/config.js';
import { getModePreset } from './mode-presets.js';

// ============================================================================
// Preset Definitions
// ============================================================================

export interface PresetConfig {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  reviewerCount: number;
  providers: string[];
  /** Provider → model mapping. First provider's model is used for supporters/moderator/head */
  models: Record<string, string>;
  /** Optional role-specific model lineup for one-provider multi-model presets. */
  reviewerModels?: string[];
  supporterModels?: string[];
  devilsAdvocateModel?: string;
  moderatorModel?: string;
  headModel?: string;
  discussion: boolean;
}

const OPENROUTER_QUALITY_REVIEWERS = [
  'xiaomi/mimo-v2.5',
  'nvidia/nemotron-3-super-120b-a12b',
  'tencent/hy3-preview',
  'deepseek/deepseek-v4-flash',
  'meta-llama/llama-4-scout',
];

const OPENROUTER_QUALITY_SUPPORTERS = [
  'z-ai/glm-5.1',
  'minimax/minimax-m3',
];

const OPENROUTER_QUALITY_DA = 'x-ai/grok-4.3';
const OPENROUTER_QUALITY_MODERATOR = 'openai/gpt-5.3-codex';
const OPENROUTER_QUALITY_HEAD = 'qwen/qwen3.7-max';

export const STATIC_PRESETS: PresetConfig[] = [
  {
    id: 'quick',
    name: 'Quick Setup',
    nameKo: '빠른 설정',
    description: '3 reviewers, no discussion — fast and cheap',
    descriptionKo: '리뷰어 3개, 토론 없음 — 빠르고 저렴',
    reviewerCount: 3,
    providers: ['openrouter'],
    models: { openrouter: OPENROUTER_QUALITY_REVIEWERS[0]! },
    reviewerModels: OPENROUTER_QUALITY_REVIEWERS.slice(0, 3),
    supporterModels: OPENROUTER_QUALITY_SUPPORTERS.slice(0, 1),
    devilsAdvocateModel: OPENROUTER_QUALITY_DA,
    moderatorModel: OPENROUTER_QUALITY_MODERATOR,
    headModel: OPENROUTER_QUALITY_HEAD,
    discussion: false,
  },
  {
    id: 'thorough',
    name: 'Thorough',
    nameKo: '심층 리뷰',
    description: '5 reviewers + discussion + devil\'s advocate',
    descriptionKo: '리뷰어 5개 + 토론 + 악마의 변호인',
    reviewerCount: 5,
    providers: ['openrouter'],
    models: { openrouter: OPENROUTER_QUALITY_REVIEWERS[0]! },
    reviewerModels: OPENROUTER_QUALITY_REVIEWERS,
    supporterModels: OPENROUTER_QUALITY_SUPPORTERS,
    devilsAdvocateModel: OPENROUTER_QUALITY_DA,
    moderatorModel: OPENROUTER_QUALITY_MODERATOR,
    headModel: OPENROUTER_QUALITY_HEAD,
    discussion: true,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    nameKo: '최소 설정',
    description: '1 reviewer + 1 supporter — lowest cost',
    descriptionKo: '리뷰어 1개 + 서포터 1개 — 최저 비용',
    reviewerCount: 1,
    providers: ['openrouter'],
    models: { openrouter: OPENROUTER_QUALITY_REVIEWERS[0]! },
    reviewerModels: OPENROUTER_QUALITY_REVIEWERS.slice(0, 1),
    supporterModels: OPENROUTER_QUALITY_SUPPORTERS.slice(0, 1),
    devilsAdvocateModel: OPENROUTER_QUALITY_DA,
    moderatorModel: OPENROUTER_QUALITY_MODERATOR,
    headModel: OPENROUTER_QUALITY_HEAD,
    discussion: false,
  },
];

// ============================================================================
// Config Builder
// ============================================================================

export interface BuildPresetOptions {
  preset: PresetConfig;
  mode?: 'strict' | 'pragmatic';
  language?: 'en' | 'ko';
}

/**
 * Build a complete Config from a preset definition.
 * Produces a config that passes zod validation with all required fields.
 */
export function buildPresetConfig(options: BuildPresetOptions): Config {
  const { preset, mode = 'pragmatic', language = 'en' } = options;
  const modePreset = getModePreset(mode);

  // Use first provider's model as the "primary" for shared roles
  const primaryProvider = preset.providers[0]!;
  const primaryModel = preset.models[primaryProvider] ?? 'xiaomi/mimo-v2.5';

  const agent = (id: string, provider: string, model: string) => ({
    id,
    model,
    backend: 'api' as const,
    provider,
    enabled: true,
    timeout: 120,
  });

  // Distribute reviewers across providers round-robin
  const reviewers = Array.from({ length: preset.reviewerCount }, (_, i) => {
    const provIdx = i % preset.providers.length;
    const prov = preset.providers[provIdx]!;
    const model = preset.reviewerModels?.[i] ?? preset.models[prov] ?? primaryModel;
    return agent(`r${i + 1}`, prov, model);
  });

  // Pick a different provider for DA if available
  const daProvider = preset.providers.length > 1 ? preset.providers[1]! : primaryProvider;
  const daModel = preset.devilsAdvocateModel ?? preset.models[daProvider] ?? primaryModel;
  const supporterModels = preset.supporterModels && preset.supporterModels.length > 0
    ? preset.supporterModels
    : [primaryModel];

  return {
    mode,
    language,
    reviewers,
    supporters: {
      pool: supporterModels.map((model, i) => agent(`s${i + 1}`, primaryProvider, model)),
      pickCount: Math.min(supporterModels.length, preset.discussion ? 2 : 1),
      pickStrategy: 'random' as const,
      devilsAdvocate: agent('da', daProvider, daModel),
      personaPool: modePreset.personaPool,
      personaAssignment: 'random' as const,
    },
    moderator: {
      model: preset.moderatorModel ?? primaryModel,
      backend: 'api' as const,
      provider: primaryProvider,
      timeout: 120,
    },
    head: {
      model: preset.headModel ?? primaryModel,
      backend: 'api' as const,
      provider: primaryProvider,
      timeout: 120,
      enabled: true,
    },
    discussion: {
      maxRounds: preset.discussion ? modePreset.maxRounds : 1,
      registrationThreshold: modePreset.registrationThreshold,
      codeSnippetRange: 10,
      objectionTimeout: 60,
      maxObjectionRounds: 1,
    },
    errorHandling: {
      maxRetries: 2,
      forfeitThreshold: 0.7,
    },
  } as Config;
}
