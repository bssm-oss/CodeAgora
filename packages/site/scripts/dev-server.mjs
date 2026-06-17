import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./prepare-assets.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const requestedPort = Number.parseInt(process.env.PORT ?? "4173", 10);

const child = spawn(
  "pnpm",
  ["exec", "astro", "dev", "--root", packageRoot, "--host", "127.0.0.1", "--port", String(requestedPort)],
  { cwd: repoRoot, stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
