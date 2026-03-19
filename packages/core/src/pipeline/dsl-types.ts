/**
 * Pipeline DSL Types
 * Type definitions for the declarative pipeline definition DSL
 */

export type StageType = 'parallel-reviewers' | 'discussion' | 'head-verdict' | 'custom';

export interface StageDefinition {
  name: string;
  type: StageType;
  config?: Record<string, unknown>;
  onError?: 'skip' | 'retry' | 'abort';
  retries?: number;
  skipIf?: string; // condition expression
}

export interface PipelineDefinition {
  name: string;
  version: string;
  stages: StageDefinition[];
}
