import type {
  SessionSummary,
  SessionDetail,
  RepoInfo,
  ProviderStatus,
  LiveDoctorStatus,
  McpStatus,
  GitHubActionStatus,
  EvidenceStatus,
  DesktopCommandContract,
} from './desktop-bridge.types.js';

/** Stub session data used when running outside Tauri context. */
export function fallbackSessions(): SessionSummary[] {
  return [
    {
      id: '2026-04-27/001',
      date: '2026-04-27',
      sessionId: '001',
      status: 'completed',
      decision: 'REJECT',
      publicDecision: 'ACCEPT',
      reasoning: 'Two high-confidence findings need changes before merge.',
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 2, SUGGESTION: 1 },
      topIssues: [
        {
          severity: 'CRITICAL',
          filePath: 'packages/core/src/pipeline/orchestrator.ts',
          lineRange: [156, 180],
          title: 'Pipeline error path skips result persistence',
          confidence: 91,
        },
      ],
      updatedAt: '2026-04-27T09:30:00.000Z',
    },
    {
      id: '2026-04-26/003',
      date: '2026-04-26',
      sessionId: '003',
      status: 'completed',
      decision: 'ACCEPT',
      publicDecision: 'ACCEPT',
      reasoning: 'No blocking issues found across reviewers.',
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 2 },
      topIssues: [],
      updatedAt: '2026-04-26T18:12:00.000Z',
    },
  ];
}

export function fallbackSessionDetail(id: string, sessions: SessionSummary[]): SessionDetail {
  const session = sessions.find((item) => item.id === id) ?? sessions[0]!;
  const publicDecision = session.publicDecision ?? session.decision ?? 'NEEDS_HUMAN';
  return {
    ...session,
    decisionBrief: {
      decision: publicDecision,
      reviewedScope: {
        files: session.topIssues?.map((issue) => issue.filePath) ?? [],
        areas: ['browser preview'],
        contracts: ['desktop public decision contract'],
        checks: ['fallback evidence normalization'],
        uncertainty: 'Browser preview data is deterministic and cannot prove live provider behavior.',
      },
      completedChecks: ['fallback evidence normalization'],
      evidenceCards: [],
      requiredActions: session.publicDecision === 'ACCEPT' ? [] : ['Review promoted evidence before acting.'],
      followUpCount: session.publicDecision === 'ACCEPT' ? 1 : 0,
      auditCount: session.publicDecision === 'ACCEPT' ? 1 : 0,
      demotedCount: session.publicDecision === 'ACCEPT' && session.decision !== 'ACCEPT' ? 1 : 0,
    },
    evidenceCount: session.topIssues?.length ?? 0,
    discussionsCount: 1,
    markdown: [
      `# Review ${session.id}`,
      '',
      `Decision: ${publicDecision}`,
      '',
      session.reasoning ?? 'No reasoning available.',
    ].join('\n'),
  };
}

export function fallbackSessionExport(id: string, format: string, detail: SessionDetail): { format: string; fileName: string; content: string } {
  const content =
    format === 'json'
      ? JSON.stringify(detail, null, 2)
      : format === 'sarif'
        ? JSON.stringify({ version: '2.1.0', runs: [{ results: detail.findings ?? [] }] }, null, 2)
        : detail.markdown ?? `# Review ${id}`;
  const ext = format === 'markdown' ? 'md' : format;
  return {
    format,
    fileName: `codeagora-session-${id.replace('/', '-')}.${ext}`,
    content,
  };
}

export function fallbackConfig(raw?: string): { raw: string; path: string } {
  return {
    path: '.ca/config.json',
    raw: raw ?? window.localStorage.getItem('codeagora.desktop.config') ?? '{\n  "language": "en",\n  "reviewers": []\n}',
  };
}

export function fallbackConfigValidation(raw: string): { valid: boolean; errors: string[]; warnings: string[] } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return {
      valid: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      errors: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? [] : ['Config must be an object.'],
      warnings: [],
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}

export function fallbackProviderStatus(): ProviderStatus[] {
  return [
    { name: 'openai', kind: 'api', envVar: 'OPENAI_API_KEY', configured: false },
    { name: 'anthropic', kind: 'api', envVar: 'ANTHROPIC_API_KEY', configured: false },
    { name: 'codex', kind: 'cli', binary: 'codex', configured: false },
  ];
}

export function fallbackLiveDoctorStatus(): LiveDoctorStatus {
  return {
    command: 'agora doctor --live --json',
    checks: [],
    summary: { pass: 0, fail: 0, warn: 0 },
    liveChecks: [],
  };
}

export function fallbackMcpStatus(): McpStatus {
  return {
    command: 'codeagora-mcp',
    tools: ['review_quick', 'review_full', 'review_pr', 'dry_run', 'explain_session', 'leaderboard', 'stats', 'config_get', 'config_set'],
    clientSnippet: JSON.stringify({ mcpServers: { codeagora: { command: 'codeagora-mcp', args: [] } } }, null, 2),
  };
}

export function fallbackGitHubActionStatus(): GitHubActionStatus {
  return {
    workflowCount: 0,
    codeagoraWorkflowCount: 0,
    workflows: [],
    recommendedSnippet: 'name: CodeAgora Review',
  };
}

export function fallbackEvidenceStatus(): EvidenceStatus {
  return {
    hasReleaseEvidence: false,
    hasBenchmarkReport: false,
    hasEvidenceManifest: false,
  };
}

export function fallbackRepoInfo(): RepoInfo {
  return {
    path: window.location.pathname.includes('/packages/desktop/') ? 'browser preview' : window.location.pathname,
    gitRoot: undefined,
    isGitRepo: false,
    branch: 'preview',
    headSha: undefined,
    dirtyFileCount: 0,
    hasConfig: true,
    configPath: '.ca/config.json',
    reviewIgnorePath: undefined,
    reviewRulesPath: undefined,
    sessionsRoot: '.ca/sessions',
    sessionCount: fallbackSessions().length,
    trusted: false,
    trustReason: 'Browser preview uses fallback data and cannot execute local reviews.',
  };
}

export function fallbackCommandContract(): DesktopCommandContract[] {
  return [
    {
      name: 'get_repo_info',
      classification: 'read-only',
      readsProject: true,
      mutatesProject: false,
      spawnsProcess: false,
      notes: 'Browser preview fallback.',
    },
    {
      name: 'run_review',
      classification: 'process-execution',
      readsProject: true,
      mutatesProject: true,
      spawnsProcess: true,
      notes: 'Disabled in browser preview.',
    },
  ];
}
