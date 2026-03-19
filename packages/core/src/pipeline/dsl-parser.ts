/**
 * Pipeline DSL Parser
 * YAML ↔ PipelineDefinition conversion with validation
 *
 * @experimental DSL is not yet wired into the orchestrator. The pipeline
 * currently uses a hardcoded L1 → L2 → L3 flow. DSL integration is planned.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { PipelineDefinition, StageDefinition, StageType } from './dsl-types.js';

export interface ParseResult {
  success: boolean;
  definition?: PipelineDefinition;
  errors: string[];
}

const VALID_STAGE_TYPES: StageType[] = [
  'parallel-reviewers',
  'discussion',
  'head-verdict',
  'custom',
];

const VALID_ERROR_ACTIONS = ['skip', 'retry', 'abort'];

/**
 * Parse a YAML string into a PipelineDefinition with full validation.
 *
 * @experimental DSL is not yet wired into the orchestrator. The pipeline
 * currently uses a hardcoded L1 → L2 → L3 flow. DSL integration is planned.
 */
export function parsePipelineDsl(yamlContent: string): ParseResult {
  const errors: string[] = [];

  // Parse YAML
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (e) {
    return {
      success: false,
      errors: [`YAML parse error: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      success: false,
      errors: ['Pipeline definition must be a YAML object'],
    };
  }

  const obj = raw as Record<string, unknown>;

  // Validate required top-level fields
  if (!obj['name'] || typeof obj['name'] !== 'string') {
    errors.push('Missing required field: name');
  }

  if (!obj['version'] || typeof obj['version'] !== 'string') {
    errors.push('Missing required field: version');
  }

  if (!Array.isArray(obj['stages'])) {
    errors.push('Missing required field: stages (must be an array)');
  } else if (obj['stages'].length === 0) {
    errors.push('stages must not be empty');
  }

  // Return early if top-level structure is broken
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const stages = obj['stages'] as unknown[];
  const seenNames = new Set<string>();
  const validatedStages: StageDefinition[] = [];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
      errors.push(`Stage[${i}]: must be an object`);
      continue;
    }

    const s = stage as Record<string, unknown>;
    const stageErrors: string[] = [];

    // name
    if (!s['name'] || typeof s['name'] !== 'string') {
      stageErrors.push(`Stage[${i}]: missing required field 'name'`);
    } else if (seenNames.has(s['name'] as string)) {
      stageErrors.push(`Duplicate stage name: '${s['name']}'`);
    } else {
      seenNames.add(s['name'] as string);
    }

    // type
    if (!s['type'] || typeof s['type'] !== 'string') {
      stageErrors.push(`Stage[${i}]: missing required field 'type'`);
    } else if (!VALID_STAGE_TYPES.includes(s['type'] as StageType)) {
      stageErrors.push(
        `Stage[${i}]: invalid type '${s['type']}'. Must be one of: ${VALID_STAGE_TYPES.join(', ')}`
      );
    }

    // onError (optional)
    if (s['onError'] !== undefined) {
      if (!VALID_ERROR_ACTIONS.includes(s['onError'] as string)) {
        stageErrors.push(
          `Stage[${i}]: invalid onError '${s['onError']}'. Must be one of: ${VALID_ERROR_ACTIONS.join(', ')}`
        );
      }
    }

    // retries (optional, must be positive integer)
    if (s['retries'] !== undefined) {
      const r = s['retries'];
      if (typeof r !== 'number' || !Number.isInteger(r) || r < 1) {
        stageErrors.push(`Stage[${i}]: retries must be a positive integer`);
      }
    }

    // config (optional, must be object if present)
    if (s['config'] !== undefined) {
      if (typeof s['config'] !== 'object' || Array.isArray(s['config']) || s['config'] === null) {
        stageErrors.push(`Stage[${i}]: config must be an object`);
      }
    }

    // skipIf (optional, must be string if present)
    if (s['skipIf'] !== undefined && typeof s['skipIf'] !== 'string') {
      stageErrors.push(`Stage[${i}]: skipIf must be a string`);
    }

    errors.push(...stageErrors);

    if (stageErrors.length === 0) {
      validatedStages.push({
        name: s['name'] as string,
        type: s['type'] as StageType,
        ...(s['config'] !== undefined && { config: s['config'] as Record<string, unknown> }),
        ...(s['onError'] !== undefined && { onError: s['onError'] as 'skip' | 'retry' | 'abort' }),
        ...(s['retries'] !== undefined && { retries: s['retries'] as number }),
        ...(s['skipIf'] !== undefined && { skipIf: s['skipIf'] as string }),
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    definition: {
      name: obj['name'] as string,
      version: obj['version'] as string,
      stages: validatedStages,
    },
    errors: [],
  };
}

/**
 * Serialize a PipelineDefinition back to a YAML string.
 */
export function serializePipelineDsl(definition: PipelineDefinition): string {
  return stringifyYaml(definition);
}

/**
 * Default pipeline definition matching the current L1 → L2 → L3 flow.
 */
export function getDefaultPipelineDefinition(): PipelineDefinition {
  return {
    name: 'default',
    version: '1.0',
    stages: [
      { name: 'review', type: 'parallel-reviewers' },
      { name: 'moderate', type: 'discussion' },
      { name: 'verdict', type: 'head-verdict' },
    ],
  };
}
