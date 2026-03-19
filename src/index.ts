/**
 * CodeAgora V3 - Main Entry Point
 * Re-exports from monorepo packages for backward compatibility.
 */

export { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
export { SessionManager } from '@codeagora/core/session/manager.js';
export { loadConfig } from '@codeagora/core/config/loader.js';

export type { PipelineInput, PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
export type { Config } from '@codeagora/core/types/config.js';
export type { SessionMetadata, HeadVerdict, ModeratorReport } from '@codeagora/core/types/core.js';
