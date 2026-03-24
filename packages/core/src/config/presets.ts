/**
 * Shared Preset Builder
 * Generates complete Config objects from provider/model selections.
 * Used by both CLI init wizard and TUI PresetsTab.
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
  discussion: boolean;
}

export const STATIC_PRESETS: PresetConfig[] = [
  {
    id: 'quick',
    name: 'Quick Setup',
    nameKo: '빠른 설정',
    description: '3 reviewers, no discussion — fast and cheap',
    descriptionKo: '리뷰어 3개, 토론 없음 — 빠르고 저렴',
    reviewerCount: 3,
    providers: ['groq'],
    models: { groq: 'llama-3.3-70b-versatile' },
    discussion: false,
  },
  {
    id: 'thorough',
    name: 'Thorough',
    nameKo: '심층 리뷰',
    description: '5 reviewers + discussion + devil\'s advocate',
    descriptionKo: '리뷰어 5개 + 토론 + 악마의 변호인',
    reviewerCount: 5,
    providers: ['groq'],
    models: { groq: 'llama-3.3-70b-versatile' },
    discussion: true,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    nameKo: '최소 설정',
    description: '1 reviewer + 1 supporter — lowest cost',
    descriptionKo: '리뷰어 1개 + 서포터 1개 — 최저 비용',
    reviewerCount: 1,
    providers: ['groq'],
    models: { groq: 'llama-3.3-70b-versatile' },
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
  const primaryModel = preset.models[primaryProvider] ?? 'llama-3.3-70b-versatile';

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
    const model = preset.models[prov] ?? primaryModel;
    return agent(`r${i + 1}`, prov, model);
  });

  // Pick a different provider for DA if available
  const daProvider = preset.providers.length > 1 ? preset.providers[1]! : primaryProvider;
  const daModel = preset.models[daProvider] ?? primaryModel;

  return {
    mode,
    language,
    reviewers,
    supporters: {
      pool: [agent('s1', primaryProvider, primaryModel)],
      pickCount: 1,
      pickStrategy: 'random' as const,
      devilsAdvocate: agent('da', daProvider, daModel),
      personaPool: modePreset.personaPool,
      personaAssignment: 'random' as const,
    },
    moderator: {
      model: primaryModel,
      backend: 'api' as const,
      provider: primaryProvider,
      timeout: 120,
    },
    head: {
      model: primaryModel,
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
