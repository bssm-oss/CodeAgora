#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { recordGateCommandEvidence } from './evidence-recorder.mjs';
import { deterministicLocalReleaseGates } from './release-gates.mjs';

export class ReleaseGateCommandError extends Error {
  constructor(failedResults, results) {
    const failedNames = failedResults.map((result) => `${result.name} (${result.exitCode})`).join(', ');
    super(`Release gate command failed: ${failedNames}`);
    this.name = 'ReleaseGateCommandError';
    this.failedResults = failedResults;
    this.results = results;
  }
}

export function parseCommandSteps(command) {
  return command.split(/\s+&&\s+/).map((rawStep) => {
    const parts = rawStep.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      throw new Error(`Invalid empty release gate command step: ${command}`);
    }
    return {
      raw: rawStep.trim(),
      file: parts[0],
      args: parts.slice(1),
    };
  });
}

export function spawnProcess({ file, args, cwd, env }) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      resolve({
        stdout,
        stderr: stderr ? `${stderr}\n${error.message}` : error.message,
        exitCode: 127,
        signal: null,
      });
    });
    child.on('close', (code, signal) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        signal,
      });
    });
  });
}

function normalizeProcessResult(result) {
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1,
    signal: result.signal ?? null,
  };
}

export async function runReleaseGateCommand(gate, options = {}) {
  const runProcess = options.runProcess ?? spawnProcess;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const startedAt = new Date().toISOString();
  const steps = [];

  for (const step of parseCommandSteps(gate.command)) {
    const processResult = normalizeProcessResult(
      await runProcess({
        gate,
        command: step.raw,
        file: step.file,
        args: step.args,
        cwd,
        env,
      }),
    );
    const stepResult = {
      command: step.raw,
      file: step.file,
      args: step.args,
      ...processResult,
    };
    steps.push(stepResult);

    if (stepResult.exitCode !== 0) {
      break;
    }
  }

  const exitCode = steps.find((step) => step.exitCode !== 0)?.exitCode ?? 0;

  const result = {
    name: gate.name,
    command: gate.command,
    filename: gate.filename,
    stdout: steps.map((step) => step.stdout).join(''),
    stderr: steps.map((step) => step.stderr).join(''),
    exitCode,
    signal: steps.find((step) => step.signal)?.signal ?? null,
    passed: exitCode === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
  };

  if (options.recordEvidence) {
    const recorded = recordGateCommandEvidence(result, {
      cwd,
      evidenceDir: options.evidenceDir,
      ledgerPath: options.ledgerPath,
    });
    result.logPath = recorded.entry.logPath;
    result.evidenceEntry = recorded.entry;
  }

  return result;
}

export async function runReleaseGateCommands(options = {}) {
  const gates = options.gates ?? deterministicLocalReleaseGates();
  const results = [];

  for (const gate of gates) {
    results.push(await runReleaseGateCommand(gate, options));
  }

  const failedResults = results.filter((result) => result.exitCode !== 0);
  if (failedResults.length > 0 && options.failOnNonzero !== false) {
    throw new ReleaseGateCommandError(failedResults, results);
  }

  return results;
}

function printResult(result) {
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${result.name}: ${result.command}`);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

async function main() {
  const results = await runReleaseGateCommands({ recordEvidence: true });
  for (const result of results) {
    printResult(result);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    if (error instanceof ReleaseGateCommandError) {
      for (const result of error.results) {
        printResult(result);
      }
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
