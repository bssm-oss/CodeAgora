export type ActionPresetLanguage = 'en' | 'ko';

export interface ActionPresetOptions {
  language?: ActionPresetLanguage;
}

export interface WorkflowTemplateOptions extends ActionPresetOptions {
  actionRef?: string;
  localAction?: boolean;
}

export const CODEAGORA_ACTION_REF = 'bssm-oss/CodeAgora@v0.1.2';
export const CODEAGORA_WORKFLOW_MAX_DIFF_LINES = 10000;

export const ACTION_CHEAP_PRESET = {
  provider: 'openrouter',
  reviewers: [
    { id: 'r-qwen235', model: 'qwen/qwen3-235b-a22b-2507', persona: 'builtin:logic' },
    { id: 'r-deepseek', model: 'deepseek/deepseek-v4-flash', persona: 'builtin:api-contract' },
    { id: 'r-qwen9', model: 'qwen/qwen3.5-9b', persona: 'builtin:general' },
    { id: 'r-glm-flash', model: 'z-ai/glm-4.7-flash', persona: 'builtin:security' },
    { id: 'r-gpt-oss', model: 'openai/gpt-oss-120b', persona: 'builtin:logic' },
  ],
  supporter: { id: 's-glm', model: 'z-ai/glm-5.1' },
  devilsAdvocate: { id: 'da-kimi', model: 'moonshotai/kimi-k2.5' },
  moderator: { model: 'z-ai/glm-5.1', enabled: false },
  head: { model: 'z-ai/glm-5.1' },
  maxRounds: 1,
  timeout: 180,
} as const;

function languageFor(options?: ActionPresetOptions): ActionPresetLanguage {
  return options?.language === 'ko' ? 'ko' : 'en';
}

function apiAgent(id: string, model: string, extra?: Record<string, unknown>) {
  return {
    id,
    model,
    backend: 'api',
    provider: ACTION_CHEAP_PRESET.provider,
    enabled: true,
    timeout: ACTION_CHEAP_PRESET.timeout,
    ...extra,
  };
}

export function buildActionPresetConfig(options: ActionPresetOptions = {}) {
  return {
    mode: 'pragmatic',
    language: languageFor(options),
    reviewers: ACTION_CHEAP_PRESET.reviewers.map((reviewer) => apiAgent(reviewer.id, reviewer.model, {
      persona: reviewer.persona,
    })),
    supporters: {
      pool: [
        apiAgent(ACTION_CHEAP_PRESET.supporter.id, ACTION_CHEAP_PRESET.supporter.model),
      ],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: apiAgent(
        ACTION_CHEAP_PRESET.devilsAdvocate.id,
        ACTION_CHEAP_PRESET.devilsAdvocate.model,
      ),
      personaPool: ['builtin:security', 'builtin:logic', 'builtin:api-contract', 'builtin:general'],
      personaAssignment: 'random',
    },
    moderator: {
      model: ACTION_CHEAP_PRESET.moderator.model,
      backend: 'api',
      provider: ACTION_CHEAP_PRESET.provider,
      enabled: ACTION_CHEAP_PRESET.moderator.enabled,
      timeout: ACTION_CHEAP_PRESET.timeout,
    },
    discussion: {
      enabled: true,
      maxRounds: ACTION_CHEAP_PRESET.maxRounds,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 2,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
    },
    head: {
      backend: 'api',
      model: ACTION_CHEAP_PRESET.head.model,
      provider: ACTION_CHEAP_PRESET.provider,
      enabled: true,
      timeout: ACTION_CHEAP_PRESET.timeout,
    },
    errorHandling: {
      maxRetries: 1,
      forfeitThreshold: 0.7,
    },
  };
}

export function renderActionPresetConfigJson(options: ActionPresetOptions = {}): string {
  return `${JSON.stringify(buildActionPresetConfig(options), null, 2)}\n`;
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text.trimEnd().split('\n').map((line) => `${prefix}${line}`).join('\n');
}

export function renderCodeAgoraWorkflowTemplate(options: WorkflowTemplateOptions = {}): string {
  const actionRef = options.localAction ? './' : options.actionRef ?? CODEAGORA_ACTION_REF;
  const configJson = indent(renderActionPresetConfigJson({ language: languageFor(options) }), 10);

  return `name: CodeAgora Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  checks: write
  security-events: write

jobs:
  review:
    if: >-
      github.event.pull_request.draft == false &&
      !contains(github.event.pull_request.labels.*.name, 'review:skip')
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Check fork PR secrets
        id: fork-check
        if: github.event.pull_request.head.repo.full_name != github.repository
        run: |
          echo "::warning::Fork PR detected - secrets are unavailable. Skipping review."
          echo "skip=true" >> "$GITHUB_OUTPUT"

      - name: Check API key
        id: key-check
        if: steps.fork-check.outputs.skip != 'true'
        run: |
          if [ -n "\${{ secrets.OPENROUTER_API_KEY }}" ]; then
            echo "provider=openrouter" >> "$GITHUB_OUTPUT"
          else
            echo "::warning::OPENROUTER_API_KEY is not configured. Add it to enable CodeAgora review."
            echo "skip=true" >> "$GITHUB_OUTPUT"
          fi

      - uses: actions/checkout@v6
        if: steps.fork-check.outputs.skip != 'true' && steps.key-check.outputs.skip != 'true'
        with:
          fetch-depth: 0

      - name: Generate CI config
        if: steps.fork-check.outputs.skip != 'true' && steps.key-check.outputs.skip != 'true'
        run: |
          mkdir -p .ca
          cat > .ca/config.json << 'CONF'
${configJson}
          CONF

      - name: CodeAgora Review
        if: steps.fork-check.outputs.skip != 'true' && steps.key-check.outputs.skip != 'true'
        uses: ${actionRef}
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          fail-on-reject: 'true'
          max-diff-lines: '${CODEAGORA_WORKFLOW_MAX_DIFF_LINES}'
          reporter-mode: check-run
          upload-sarif: 'true'
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          CODEAGORA_APP_ID: \${{ secrets.CODEAGORA_APP_ID }}
          CODEAGORA_APP_PRIVATE_KEY: \${{ secrets.CODEAGORA_APP_PRIVATE_KEY }}
`;
}
