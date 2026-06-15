import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_SECURITY_EVIDENCE_SCHEMA_VERSION,
  DESKTOP_SECURITY_TEST_COMMANDS,
  buildDesktopSecurityEvidence,
  parseDesktopSecurityEvidenceArgs,
  runDesktopSecurityEvidence,
} from '../../scripts/desktop-security-evidence.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-security-evidence-'));
}

describe('desktop security evidence', () => {
  it('writes rc desktop security evidence after focused tests pass', async () => {
    const dir = makeTmpDir();
    try {
      const output = path.join(dir, 'evidence', 'desktop-security-evidence.json');
      const calls: Array<{ command: string; file: string; args: string[] }> = [];

      const result = await runDesktopSecurityEvidence({
        cwd: process.cwd(),
        output,
        runProcess: async ({ command, file, args }) => {
          calls.push({ command, file, args });
          return {
            stdout: `focused desktop security command passed: ${command}\n`,
            stderr: '',
            exitCode: 0,
          };
        },
      });

      expect(calls).toEqual(DESKTOP_SECURITY_TEST_COMMANDS.map((command) => ({
        command: command.raw,
        file: command.file,
        args: command.args,
      })));
      expect(result.evidence).toMatchObject({
        schemaVersion: DESKTOP_SECURITY_EVIDENCE_SCHEMA_VERSION,
        evidenceMode: 'real',
        redactionStatus: 'safe-to-publish',
        releaseTier: 'rc',
        outputPath: path.relative(process.cwd(), output),
        testCommands: DESKTOP_SECURITY_TEST_COMMANDS.map((command) => command.raw),
        tests: {
          skipped: false,
          passed: true,
        },
        checks: {
          minimalMainWindowCapability: true,
          disallowedNativePermissionScopesAbsent: true,
          frontendRustCommandContractAligned: true,
          webdriverAutomationDebugOnly: true,
          webdriverReleaseBuildDisabled: true,
          webdriverLoopbackOnly: true,
          externalLinksUseApprovedNativeCommand: true,
          unsafeExternalLinkSchemesRejected: true,
          browserFallbackDoesNotOpenLinks: true,
          workspacePathBoundariesEnforced: true,
          desktopExportsRedactSecrets: true,
          symlinkEscapesRejected: true,
          untrustedWorkspaceMutationsBlocked: true,
        },
      });
      expect(result.evidence.tests.results).toHaveLength(DESKTOP_SECURITY_TEST_COMMANDS.length);
      expect(result.evidence.sourceEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          area: 'tauri-capabilities',
          tests: expect.arrayContaining(['src/tests/desktop-tauri-capabilities.test.ts']),
        }),
        expect.objectContaining({
          area: 'workspace-file-boundary',
          tests: expect.arrayContaining([
            'packages/desktop/src-tauri/src/main.rs desktop_file_access_boundary tests',
          ]),
        }),
      ]));
      expect(JSON.parse(fs.readFileSync(output, 'utf-8'))).toEqual(result.evidence);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts captured desktop test excerpts before writing safe-to-publish evidence', () => {
    const output = path.join(process.cwd(), '.sisyphus', 'evidence', 'desktop-security-evidence.json');
    const evidence = buildDesktopSecurityEvidence({
      outputPath: output,
      testResults: [
        {
          name: 'desktop-security-vitest',
          command: DESKTOP_SECURITY_TEST_COMMANDS[0].raw,
          skipped: false,
          exitCode: 1,
          signal: null,
          passed: false,
          stdoutExcerpt: 'OPENROUTER_API_KEY=sk-or-v1-desktopsecret123456789\n',
          stderrExcerpt: 'Authorization: Bearer ghp_desktopsecret123456789\n',
        },
      ],
    });

    expect(evidence.tests).toMatchObject({
      skipped: false,
      passed: false,
    });
    expect(evidence.tests.results[0].stdoutExcerpt).toContain('OPENROUTER_API_KEY=[REDACTED]');
    expect(evidence.tests.results[0].stderrExcerpt).toContain('Authorization: Bearer [REDACTED]');
    expect(evidence.tests.results[0].stdoutExcerpt).not.toContain('sk-or-v1-desktopsecret123456789');
    expect(evidence.tests.results[0].stderrExcerpt).not.toContain('ghp_desktopsecret123456789');
    expect(Object.values(evidence.checks).every((value) => value === false)).toBe(true);
  });

  it('rejects desktop security evidence flags without values', () => {
    expect(() => parseDesktopSecurityEvidenceArgs(['--output'])).toThrow('Missing value for --output');
    expect(() => parseDesktopSecurityEvidenceArgs(['--evidence-dir', '--skip-tests'])).toThrow(
      'Missing value for --evidence-dir',
    );
  });

  it('parses desktop security evidence output and evidence directory flags', () => {
    expect(parseDesktopSecurityEvidenceArgs([
      '--evidence-dir',
      '.tmp/evidence',
      '--output=desktop-security.json',
      '--skip-tests',
    ])).toEqual({
      evidenceDir: '.tmp/evidence',
      output: 'desktop-security.json',
      skipTests: true,
      release: false,
    });
  });

  it('rejects skipped tests in release mode', () => {
    expect(() => parseDesktopSecurityEvidenceArgs(['--release', '--skip-tests'])).toThrow(
      'Release desktop security evidence requires real focused tests',
    );
  });
});
