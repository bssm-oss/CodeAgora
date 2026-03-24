/**
 * L1 Backend Executor
 * Executes backend CLI commands without shell interpretation (spawn, not exec).
 */

import { spawn } from 'child_process';
import type { Backend } from '../types/config.js';
import { gracefulKill } from '@codeagora/shared/utils/process-kill.js';

// ============================================================================
// Backend Executor
// ============================================================================

export interface BackendInput {
  backend: Backend;
  model: string;
  provider?: string;
  prompt: string;
  timeout: number;
  signal?: AbortSignal;
  temperature?: number;
}

/** Command definition: binary + args, no shell. */
interface CliCommand {
  bin: string;
  args: string[];
  /** When true, prompt is piped via stdin; when false, prompt is embedded in args. */
  useStdin: boolean;
}

/**
 * Execute backend CLI command.
 * API backends call AI SDK directly. CLI backends use spawn() with stdin pipe
 * to avoid shell interpretation entirely.
 */
export async function executeBackend(input: BackendInput): Promise<string> {
  const { backend, prompt, timeout } = input;

  // API backend: direct AI SDK call (no CLI subprocess)
  if (backend === 'api') {
    const { executeViaAISDK } = await import('./api-backend.js');
    return executeViaAISDK(input);
  }

  // CLI backends: pipe prompt via stdin to child process (no shell)
  const cmd = buildCommand(input);
  const timeoutMs = timeout * 1000;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd.bin, cmd.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true, // Required for process-group kill via gracefulKill
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    // Manual timeout with SIGTERM → SIGKILL escalation (#91)
    const timer = setTimeout(() => {
      killed = true;
      if (child.pid) {
        gracefulKill(child.pid, 5000).catch(() => {});
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Backend execution failed: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`Backend timed out after ${timeout}s (SIGKILL escalation)`));
        return;
      }
      if (code !== 0 && !stdout) {
        reject(new Error(`Backend error (exit ${code}): ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });

    // Write prompt to stdin and close (some backends embed prompt in args instead)
    if (cmd.useStdin) {
      child.stdin.write(prompt);
    }
    child.stdin.end();
  });
}

// ============================================================================
// Argument Validation
// ============================================================================

const SAFE_ARG = /^[a-zA-Z0-9./:@_-]+$/;

function validateArg(arg: string, name: string): string {
  if (!SAFE_ARG.test(arg)) {
    throw new Error(`Invalid ${name}: contains unsafe characters — "${arg}"`);
  }
  return arg;
}

// ============================================================================
// Command Builders (return binary + args, no shell)
// ============================================================================

function buildCommand(input: BackendInput): CliCommand {
  const { backend, model, provider } = input;

  switch (backend) {
    case 'opencode': {
      if (!provider) throw new Error('OpenCode backend requires provider parameter');
      return {
        bin: 'opencode',
        args: ['run', '-m', `${validateArg(provider, 'provider')}/${validateArg(model, 'model')}`],
        useStdin: true,
      };
    }
    case 'codex':
      return {
        bin: 'codex',
        args: ['exec', '-m', validateArg(model, 'model'), '-'],
        useStdin: true,
      };
    case 'gemini':
      return {
        bin: 'gemini',
        args: ['-m', validateArg(model, 'model')],
        useStdin: true,
      };
    case 'claude':
      return {
        bin: 'claude',
        args: ['--non-interactive', '--model', validateArg(model, 'model')],
        useStdin: true,
      };
    case 'copilot':
      return {
        bin: 'copilot',
        args: ['-p', input.prompt, '-s', '--allow-all', '--model', validateArg(model, 'model')],
        useStdin: false,
      };
    case 'aider':
      return {
        bin: 'aider',
        args: ['--message', input.prompt, '--yes-always', '--no-auto-commits'],
        useStdin: false,
      };
    case 'goose':
      return {
        bin: 'goose',
        args: ['run', '-t', input.prompt, '--no-session'],
        useStdin: false,
      };
    case 'cline':
      return {
        bin: 'cline',
        args: ['-y', input.prompt],
        useStdin: false,
      };
    case 'qwen-code':
      return {
        bin: 'qwen',
        args: ['-p', input.prompt],
        useStdin: false,
      };
    case 'vibe':
      return {
        bin: 'vibe',
        args: ['--prompt', input.prompt],
        useStdin: false,
      };
    case 'kiro':
      return {
        bin: 'kiro-cli',
        args: ['chat', '--no-interactive', '--trust-all-tools', input.prompt],
        useStdin: false,
      };
    case 'cursor':
      return {
        bin: 'agent',
        args: ['-p', input.prompt],
        useStdin: false,
      };
    default:
      throw new Error(`Unsupported CLI backend: ${backend}`);
  }
}

// Keep sanitizeShellArg export for backward compatibility
export const sanitizeShellArg = validateArg;
