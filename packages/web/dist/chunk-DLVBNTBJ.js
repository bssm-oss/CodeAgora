// ../core/src/l1/backend.ts
import { spawn } from "child_process";

// ../shared/src/utils/process-kill.ts
async function gracefulKill(pid, timeoutMs = 5e3) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid PID: ${pid}. PID must be a positive integer.`);
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (isEsrch(error)) return;
    throw error;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await sleep(50);
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (isEsrch(error)) return;
    throw error;
  }
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function isEsrch(error) {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ../core/src/l1/backend.ts
async function executeBackend(input) {
  const { backend, prompt, timeout } = input;
  if (backend === "api") {
    const { executeViaAISDK } = await import("./api-backend-WE3W7SB2.js");
    return executeViaAISDK(input);
  }
  const cmd = buildCommand(input);
  const timeoutMs = timeout * 1e3;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd.bin, cmd.args, {
      stdio: ["pipe", "pipe", "pipe"],
      detached: true
      // Required for process-group kill via gracefulKill
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    const timer = setTimeout(() => {
      killed = true;
      if (child.pid) {
        gracefulKill(child.pid, 5e3).catch(() => {
        });
      }
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Backend execution failed: ${err.message}`));
    });
    child.on("close", (code) => {
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
    if (cmd.useStdin) {
      child.stdin.write(prompt);
    }
    child.stdin.end();
  });
}
var SAFE_ARG = /^[a-zA-Z0-9./:@_-]+$/;
function validateArg(arg, name) {
  if (!SAFE_ARG.test(arg)) {
    throw new Error(`Invalid ${name}: contains unsafe characters \u2014 "${arg}"`);
  }
  return arg;
}
function buildCommand(input) {
  const { backend, model, provider } = input;
  switch (backend) {
    case "opencode": {
      if (!provider) throw new Error("OpenCode backend requires provider parameter");
      return {
        bin: "opencode",
        args: ["run", "-m", `${validateArg(provider, "provider")}/${validateArg(model, "model")}`],
        useStdin: true
      };
    }
    case "codex":
      return {
        bin: "codex",
        args: ["exec", "-m", validateArg(model, "model"), "-"],
        useStdin: true
      };
    case "gemini":
      return {
        bin: "gemini",
        args: ["-m", validateArg(model, "model")],
        useStdin: true
      };
    case "claude":
      return {
        bin: "claude",
        args: ["--non-interactive", "--model", validateArg(model, "model")],
        useStdin: true
      };
    case "copilot":
      return {
        bin: "copilot",
        args: ["-s", "--allow-all", "--model", validateArg(model, "model")],
        useStdin: true
      };
    case "aider":
      return {
        bin: "aider",
        args: ["--yes-always", "--no-auto-commits"],
        useStdin: true
      };
    case "goose":
      return {
        bin: "goose",
        args: ["run", "--no-session"],
        useStdin: true
      };
    case "cline":
      return {
        bin: "cline",
        args: ["-y"],
        useStdin: true
      };
    case "qwen-code":
      return {
        bin: "qwen",
        args: [],
        useStdin: true
      };
    case "vibe":
      return {
        bin: "vibe",
        args: [],
        useStdin: true
      };
    case "kiro":
      return {
        bin: "kiro-cli",
        args: ["chat", "--no-interactive", "--trust-all-tools"],
        useStdin: true
      };
    case "cursor":
      return {
        bin: "agent",
        args: [],
        useStdin: true
      };
    default:
      throw new Error(`Unsupported CLI backend: ${backend}`);
  }
}
var sanitizeShellArg = validateArg;

export {
  executeBackend,
  sanitizeShellArg
};
