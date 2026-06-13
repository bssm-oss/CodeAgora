import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REDACTION_PATH_SAFETY_EVIDENCE_SCHEMA_VERSION,
  REDACTION_PATH_SAFETY_TEST_COMMAND,
  buildRedactionPathSafetyEvidence,
  runRedactionPathSafetyEvidence,
} from '../../scripts/redaction-path-safety-evidence.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-redaction-path-safety-evidence-'));
}

describe('redaction and path-safety evidence', () => {
  it('writes rc evidence after focused redaction and path-safety tests pass', async () => {
    const dir = makeTmpDir();
    try {
      const output = path.join(dir, 'evidence', 'redaction-path-safety-evidence.json');
      const calls: Array<{ command: string; file: string; args: string[] }> = [];

      const result = await runRedactionPathSafetyEvidence({
        cwd: process.cwd(),
        output,
        runProcess: async ({ command, file, args }) => {
          calls.push({ command, file, args });
          return {
            stdout: 'focused redaction and path-safety tests passed\n',
            stderr: '',
            exitCode: 0,
          };
        },
      });

      expect(calls).toEqual([{
        command: REDACTION_PATH_SAFETY_TEST_COMMAND.raw,
        file: REDACTION_PATH_SAFETY_TEST_COMMAND.file,
        args: REDACTION_PATH_SAFETY_TEST_COMMAND.args,
      }]);
      expect(result.evidence).toMatchObject({
        schemaVersion: REDACTION_PATH_SAFETY_EVIDENCE_SCHEMA_VERSION,
        redactionStatus: 'safe-to-publish',
        releaseTier: 'rc',
        outputPath: path.relative(process.cwd(), output),
        testCommand: REDACTION_PATH_SAFETY_TEST_COMMAND.raw,
        tests: {
          skipped: false,
          exitCode: 0,
          passed: true,
        },
        checks: {
          assignmentAndBearerTokenRedaction: true,
          providerKeyUrlRedaction: true,
          persistedSessionArtifactRedaction: true,
          githubAndMcpOutwardResponseRedaction: true,
          traversalSegmentsRejected: true,
          encodedAndSeparatorTraversalRejected: true,
          repositoryRootBoundaryEnforced: true,
          symlinkEscapesRejected: true,
          configPathBoundedToRepository: true,
          githubActionDiffAndSarifPathsBounded: true,
        },
      });
      expect(result.evidence.sourceEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          area: 'secret-redaction',
          source: 'packages/shared/src/utils/redaction.ts',
          tests: expect.arrayContaining(['src/tests/redaction-boundaries.test.ts']),
        }),
        expect.objectContaining({
          area: 'path-validation',
          source: 'packages/shared/src/utils/path-validation.ts',
          tests: expect.arrayContaining([
            'src/tests/utils-path-validation.test.ts',
            'src/tests/config-path-security.test.ts',
          ]),
        }),
      ]));
      expect(JSON.parse(fs.readFileSync(output, 'utf-8'))).toEqual(result.evidence);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts captured focused test excerpts before writing safe-to-publish evidence', () => {
    const output = path.join(process.cwd(), '.sisyphus', 'evidence', 'redaction-path-safety-evidence.json');
    const evidence = buildRedactionPathSafetyEvidence({
      outputPath: output,
      testResult: {
        stdout: 'OPENAI_API_KEY=sk-test-secret\nAuthorization: Bearer test-secret\n',
        stderr: 'GITHUB_TOKEN=ghp_testsecret\n',
        exitCode: 1,
        signal: null,
      },
    });

    expect(evidence.tests).toMatchObject({
      skipped: false,
      exitCode: 1,
      passed: false,
    });
    expect(evidence.tests.stdoutExcerpt).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(evidence.tests.stdoutExcerpt).toContain('Authorization: Bearer [REDACTED]');
    expect(evidence.tests.stderrExcerpt).toContain('GITHUB_TOKEN=[REDACTED]');
    expect(evidence.tests.stdoutExcerpt).not.toContain('sk-test-secret');
    expect(evidence.tests.stdoutExcerpt).not.toContain('test-secret');
    expect(evidence.tests.stderrExcerpt).not.toContain('ghp_testsecret');
    expect(Object.values(evidence.checks).every((value) => value === false)).toBe(true);
  });
});
