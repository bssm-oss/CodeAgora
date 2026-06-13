import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GITHUB_SECURITY_EVIDENCE_SCHEMA_VERSION,
  GITHUB_SECURITY_TEST_COMMAND,
  buildGithubSecurityEvidence,
  runGithubSecurityEvidence,
} from '../../scripts/github-security-evidence.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-github-security-evidence-'));
}

describe('GitHub security evidence', () => {
  it('writes rc token-handling and fork-safety evidence after focused tests pass', async () => {
    const dir = makeTmpDir();
    try {
      const output = path.join(dir, 'evidence', 'github-security-evidence.json');
      const calls: Array<{ command: string; file: string; args: string[] }> = [];

      const result = await runGithubSecurityEvidence({
        cwd: process.cwd(),
        output,
        runProcess: async ({ command, file, args }) => {
          calls.push({ command, file, args });
          return {
            stdout: 'focused GitHub security tests passed\n',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      expect(calls).toEqual([{
        command: GITHUB_SECURITY_TEST_COMMAND.raw,
        file: GITHUB_SECURITY_TEST_COMMAND.file,
        args: GITHUB_SECURITY_TEST_COMMAND.args,
      }]);
      expect(result.evidence).toMatchObject({
        schemaVersion: GITHUB_SECURITY_EVIDENCE_SCHEMA_VERSION,
        redactionStatus: 'safe-to-publish',
        releaseTier: 'rc',
        outputPath: path.relative(process.cwd(), output),
        testCommand: GITHUB_SECURITY_TEST_COMMAND.raw,
        tests: {
          skipped: false,
          exitCode: 0,
          passed: true,
        },
        checks: {
          githubTokenNotProviderCredential: true,
          missingGitHubTokenBlocksPosting: true,
          leastPrivilegePermissionsValidated: true,
          excessivePermissionsRejected: true,
          privilegedOperationsRequireTrustedTokenContext: true,
          forkPrHardStopsBeforeProviderCredentials: true,
          forkPrSuppressesProviderBackedReview: true,
          pullRequestEvidenceKeepsForkAndShaMetadata: true,
        },
      });
      expect(result.evidence.sourceEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          area: 'token-handling',
          tests: expect.arrayContaining([
            'detects only retained provider credentials, not GITHUB_TOKEN',
          ]),
        }),
        expect.objectContaining({
          area: 'fork-safety',
          tests: expect.arrayContaining([
            'skips fork PRs as untrusted before checking provider credentials',
          ]),
        }),
      ]));
      expect(JSON.parse(fs.readFileSync(output, 'utf-8'))).toEqual(result.evidence);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records failed focused test status in the artifact', () => {
    const output = path.join(process.cwd(), '.sisyphus', 'evidence', 'github-security-evidence.json');
    const evidence = buildGithubSecurityEvidence({
      outputPath: output,
      testResult: {
        stdout: '',
        stderr: 'expected failure\n',
        exitCode: 1,
        signal: null,
      },
    });

    expect(evidence.tests).toMatchObject({
      skipped: false,
      exitCode: 1,
      passed: false,
      stderrExcerpt: 'expected failure\n',
    });
    expect(Object.values(evidence.checks).every((value) => value === false)).toBe(true);
  });
});
