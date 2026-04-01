/**
 * Suggestion Verifier (#413)
 * Verifies that code suggestions in CRITICAL+ findings compile correctly.
 * Failed suggestions receive a confidence penalty and a warning badge.
 */

import type { EvidenceDocument } from '../types/core.js';
import { access } from 'fs/promises';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface VerificationResult {
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
}

// ============================================================================
// Code Extraction
// ============================================================================

/**
 * Extract the first code block from a suggestion string.
 * Matches ```lang\n...\n``` patterns.
 */
export function extractCodeBlock(suggestion: string): string | null {
  const match = /```[\w]*\n([\s\S]*?)```/.exec(suggestion);
  return match?.[1]?.trim() ?? null;
}

// ============================================================================
// Verification Logic
// ============================================================================

/**
 * Verify a single code suggestion using TypeScript's transpileModule API.
 * This catches syntax errors and obvious type issues without requiring
 * full project context.
 */
async function verifySingle(code: string, hasTypeScript: boolean): Promise<VerificationResult> {
  if (!hasTypeScript) {
    return { status: 'skipped', error: 'typescript not available' };
  }

  try {
    // Dynamic import to avoid hard dependency
    const ts = await import('typescript');

    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        strict: true,
        noEmit: true,
        // Allow imports without resolution — we only check syntax/basic types
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        // Suppress import-related errors since we lack project context
        noResolve: true,
      },
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics ?? []).filter(
      d => d.category === ts.DiagnosticCategory.Error,
    );

    if (errors.length > 0) {
      const messages = errors
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
        .join('; ');
      return { status: 'failed', error: messages };
    }

    return { status: 'passed' };
  } catch {
    // transpileModule threw — likely a syntax error
    return { status: 'failed', error: 'Transpilation failed' };
  }
}

/**
 * Check if TypeScript is available as a dependency.
 */
async function isTypeScriptAvailable(): Promise<boolean> {
  try {
    await import('typescript');
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Verify code suggestions in CRITICAL+ evidence documents.
 *
 * - Filters to only CRITICAL and HARSHLY_CRITICAL findings with code blocks
 * - Checks if tsconfig.json exists in the repo (skip all if not)
 * - Attempts to compile each suggestion via TypeScript's transpileModule
 * - Updates `doc.suggestionVerified` and applies confidence penalty on failure
 *
 * This function mutates the evidence documents in-place.
 */
export async function verifySuggestions(
  repoPath: string,
  evidenceDocs: EvidenceDocument[],
): Promise<void> {
  // 1. Filter to CRITICAL+ with code suggestion blocks
  const candidates = evidenceDocs.filter(doc =>
    (doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL') &&
    doc.suggestion && /```[\w]*\n/.test(doc.suggestion),
  );

  if (candidates.length === 0) return;

  // 2. Check if tsconfig.json exists — skip if not a TS project
  const tsconfigPath = path.join(repoPath, 'tsconfig.json');
  const hasTsConfig = await access(tsconfigPath).then(() => true).catch(() => false);

  if (!hasTsConfig) {
    for (const doc of candidates) {
      doc.suggestionVerified = 'skipped';
    }
    return;
  }

  // 3. Check TypeScript availability
  const hasTS = await isTypeScriptAvailable();

  // 4. Verify each candidate
  for (const doc of candidates) {
    const code = extractCodeBlock(doc.suggestion);

    if (!code) {
      doc.suggestionVerified = 'skipped';
      continue;
    }

    const result = await verifySingle(code, hasTS);
    doc.suggestionVerified = result.status;

    // Apply confidence penalty on failure
    if (result.status === 'failed') {
      doc.confidence = Math.round((doc.confidence ?? 50) * 0.5);
    }
  }
}
