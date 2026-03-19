/**
 * Init Command
 * Initialize CodeAgora in a project directory.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as p from '@clack/prompts';
import { generateMinimalTemplate } from '@codeagora/core/config/templates.js';
import { getModePreset } from '@codeagora/core/config/mode-presets.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { stringify as yamlStringify } from 'yaml';
import type { ReviewMode, Language } from '@codeagora/core/types/config.js';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Types
// ============================================================================

export interface InitOptions {
  format: 'json' | 'yaml';
  force: boolean;
  baseDir: string;
  ci?: boolean;
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

interface AgentEntry { id: string; label?: string; model: string; backend: string; provider: string; enabled: boolean; timeout: number }

export interface GeneratedConfig {
  reviewers: AgentEntry[];
  supporters: { pool: AgentEntry[]; pickCount: number; pickStrategy: string; devilsAdvocate: AgentEntry; personaPool: string[]; personaAssignment: string };
  moderator: { model: string; backend: string; provider: string };
  discussion: { maxRounds: number; registrationThreshold: Record<string, number | null>; codeSnippetRange: number };
  errorHandling: { maxRetries: number; forfeitThreshold: number };
  [key: string]: unknown;
}

export class UserCancelledError extends Error {
  constructor() { super('Setup cancelled by user.'); this.name = 'UserCancelledError'; }
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
// buildCustomConfig
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
      maxRounds: discussion ? preset.maxRounds : 0,
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
  groq: 'llama-3.3-70b-versatile',
  google: 'gemini-2.0-flash',
  mistral: 'mistral-large-latest',
  openrouter: 'meta-llama/llama-3.3-70b-instruct',
  'nvidia-nim': 'meta/llama-3.1-70b-instruct',
  cerebras: 'llama3.1-70b',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  xai: 'grok-beta',
};

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

  // Read template from src/data/github-actions-template.yml
  // Walk up from the compiled output location to find the data file.
  const templatePath = path.resolve(_dirname, '../../../../packages/shared/src/data/github-actions-template.yml');
  const templateContent = await fs.readFile(templatePath, 'utf-8');

  await fs.mkdir(workflowDir, { recursive: true });
  await fs.writeFile(workflowPath, templateContent, 'utf-8');
  return true;
}

// ============================================================================
// Public API
// ============================================================================

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { format, force, baseDir, ci } = options;
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  // Ensure .ca/ directory exists
  const caDir = path.join(baseDir, '.ca');
  await fs.mkdir(caDir, { recursive: true });

  // Config file
  const configFileName = format === 'yaml' ? 'config.yaml' : 'config.json';
  const configPath = path.join(caDir, configFileName);
  const configContent = generateMinimalTemplate(format);
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
  const { force, baseDir } = options;
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  p.intro('CodeAgora Setup');

  // Step 1: Config format
  const formatSelection = await p.select({
    message: 'Config format?',
    options: [
      { value: 'json', label: 'JSON' },
      { value: 'yaml', label: 'YAML' },
    ],
  });
  if (p.isCancel(formatSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const format = formatSelection as 'json' | 'yaml';

  // Step 2: Provider selection — detect available API keys
  const providerOptions = Object.entries(PROVIDER_ENV_VARS).map(([name, envVar]) => ({
    value: name,
    label: `${name}${process.env[envVar] ? ' \u2713 (key detected)' : ''}`,
  }));
  const providerSelection = await p.select({
    message: 'Which provider?',
    options: providerOptions,
  });
  if (p.isCancel(providerSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const provider = providerSelection as string;

  // Step 3: Reviewer count
  const countSelection = await p.select({
    message: 'How many reviewers?',
    options: [
      { value: '1', label: '1 (minimal)' },
      { value: '3', label: '3 (recommended)' },
      { value: '5', label: '5 (thorough)' },
    ],
    initialValue: '3',
  });
  if (p.isCancel(countSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const reviewerCount = parseInt(countSelection as string, 10);

  // Step 4: Model name
  const defaultModel = PROVIDER_DEFAULT_MODELS[provider] ?? 'llama-3.3-70b-versatile';
  const modelSelection = await p.text({
    message: 'Model name?',
    placeholder: defaultModel,
    defaultValue: defaultModel,
  });
  if (p.isCancel(modelSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const model = (modelSelection as string) || defaultModel;

  // Step 5: Enable discussion
  const discussionSelection = await p.confirm({
    message: 'Enable L2 discussion (multi-agent debate)?',
    initialValue: true,
  });
  if (p.isCancel(discussionSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const discussion = discussionSelection as boolean;

  // Step 6: Review mode
  const modeSelection = await p.select({
    message: 'Review mode?',
    options: [
      { value: 'pragmatic', label: 'Pragmatic (balanced, fewer false positives)' },
      { value: 'strict', label: 'Strict (security-focused, lower thresholds)' },
    ],
    initialValue: 'pragmatic',
  });
  if (p.isCancel(modeSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const mode = modeSelection as ReviewMode;

  // Step 7: Language
  const languageSelection = await p.select({
    message: 'Review language?',
    options: [
      { value: 'en', label: 'English' },
      { value: 'ko', label: '한국어' },
    ],
    initialValue: 'en',
  });
  if (p.isCancel(languageSelection)) {
    p.cancel('Setup cancelled.');
    throw new UserCancelledError();
  }
  const language = languageSelection as Language;

  // Build config from selections
  const configData = buildCustomConfig({ provider, model, reviewerCount, discussion, mode, language });

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

  p.outro('Config created!');

  return { created, skipped, warnings };
}
