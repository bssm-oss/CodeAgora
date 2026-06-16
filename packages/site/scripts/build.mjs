import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const distDir = resolve(packageRoot, "dist");

const files = [
  ["index.html", "index.html"],
  ["src/styles.css", "src/styles.css"],
  ["src/main.js", "src/main.js"],
  ["../../assets/logo.svg", "assets/logo.svg"]
];

await rm(distDir, { force: true, recursive: true });

for (const [from, to] of files) {
  const target = resolve(distDir, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(packageRoot, from), target);
}

console.log(`Built CodeAgora site at ${distDir.replace(repoRoot, ".")}`);

