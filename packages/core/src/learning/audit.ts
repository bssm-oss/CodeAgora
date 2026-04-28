import fs from 'fs/promises';
import path from 'path';
import type { ActualFinding } from '@codeagora/shared/utils/golden-bug-scorer.js';
import type { DismissedPattern } from './store.js';

export interface LearningAuditMatch {
  pattern: string;
  action: 'downgrade' | 'suppress';
  dismissCount: number;
  active: boolean;
  findingTitle: string;
  severity: string;
  filePath: string;
}

export interface LearningAuditReport {
  schemaVersion: 'codeagora.learning.audit.v1';
  generatedAt: string;
  threshold: number;
  sourcePath: string;
  totalPatterns: number;
  activePatterns: number;
  totalFindings: number;
  matchedFindings: number;
  activeMatches: number;
  suppressCandidates: number;
  downgradeCandidates: number;
  matches: LearningAuditMatch[];
}

export interface LearningAuditOptions {
  sourcePath: string;
  patterns: DismissedPattern[];
  threshold?: number;
  generatedAt?: string;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

function isFindingArray(value: unknown): value is ActualFinding[] {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item === 'object' &&
    typeof (item as Record<string, unknown>)['issueTitle'] === 'string'
  );
}

async function loadFindingsFromPath(sourcePath: string): Promise<ActualFinding[]> {
  const stat = await fs.stat(sourcePath);
  if (stat.isFile()) {
    const parsed = await readJson(sourcePath);
    return isFindingArray(parsed) ? parsed : [];
  }

  const findings: ActualFinding[] = [];
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const parsed = await readJson(path.join(sourcePath, entry.name));
    if (isFindingArray(parsed)) findings.push(...parsed);
  }
  return findings;
}

export async function auditLearnedPatterns(
  options: LearningAuditOptions,
): Promise<LearningAuditReport> {
  const threshold = options.threshold ?? 3;
  const sourcePath = path.resolve(options.sourcePath);
  const findings = await loadFindingsFromPath(sourcePath);
  const matches: LearningAuditMatch[] = [];

  for (const pattern of options.patterns) {
    const needle = pattern.pattern.toLowerCase();
    const active = pattern.dismissCount >= threshold;
    for (const finding of findings) {
      if (!finding.issueTitle.toLowerCase().includes(needle)) continue;
      matches.push({
        pattern: pattern.pattern,
        action: pattern.action,
        dismissCount: pattern.dismissCount,
        active,
        findingTitle: finding.issueTitle,
        severity: finding.severity,
        filePath: finding.filePath,
      });
    }
  }

  const activeMatches = matches.filter((m) => m.active);
  return {
    schemaVersion: 'codeagora.learning.audit.v1',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    threshold,
    sourcePath,
    totalPatterns: options.patterns.length,
    activePatterns: options.patterns.filter((p) => p.dismissCount >= threshold).length,
    totalFindings: findings.length,
    matchedFindings: matches.length,
    activeMatches: activeMatches.length,
    suppressCandidates: activeMatches.filter((m) => m.action === 'suppress').length,
    downgradeCandidates: activeMatches.filter((m) => m.action === 'downgrade').length,
    matches,
  };
}

export function formatLearningAuditText(report: LearningAuditReport): string {
  const lines: string[] = [];
  lines.push('Learning Audit');
  lines.push('--------------');
  lines.push(`Source: ${report.sourcePath}`);
  lines.push(`Patterns: ${report.totalPatterns} (${report.activePatterns} active at threshold ${report.threshold})`);
  lines.push(`Findings scanned: ${report.totalFindings}`);
  lines.push(`Matches: ${report.matchedFindings} (${report.activeMatches} active)`);
  lines.push(`Suppress candidates: ${report.suppressCandidates}`);
  lines.push(`Downgrade candidates: ${report.downgradeCandidates}`);
  if (report.matches.length > 0) {
    lines.push('');
    lines.push('Matched findings:');
    for (const match of report.matches.slice(0, 20)) {
      const state = match.active ? 'active' : 'inactive';
      lines.push(`  - ${match.pattern} -> ${match.findingTitle} (${match.action}, ${state})`);
    }
    if (report.matches.length > 20) {
      lines.push(`  ... and ${report.matches.length - 20} more`);
    }
  }
  return lines.join('\n');
}
