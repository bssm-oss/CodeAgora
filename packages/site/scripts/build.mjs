import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import "./prepare-assets.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const execFileAsync = promisify(execFile);

await execFileAsync(
  "pnpm",
  [
    "exec",
    "astro",
    "build",
    "--root",
    packageRoot
  ],
  { cwd: repoRoot }
);

console.log("Built CodeAgora Astro site at ./packages/site/dist");
