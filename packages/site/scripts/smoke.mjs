import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "dist/index.html",
  "dist/src/styles.css",
  "dist/src/main.js",
  "dist/assets/logo.svg"
];

for (const file of requiredFiles) {
  const fileStat = await stat(resolve(packageRoot, file));
  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`Missing or empty site artifact: ${file}`);
  }
}

const html = await readFile(resolve(packageRoot, "dist/index.html"), "utf8");
const css = await readFile(resolve(packageRoot, "dist/src/styles.css"), "utf8");
const js = await readFile(resolve(packageRoot, "dist/src/main.js"), "utf8");

const requiredCopy = [
  "CodeAgora",
  "npm i -g @codeagora/review@rc",
  "GitHub Action",
  "MCP",
  "Desktop",
  "토론하는 리뷰",
  "공식 지원 표면"
];

for (const copy of requiredCopy) {
  if (!html.includes(copy)) {
    throw new Error(`Landing page is missing required copy: ${copy}`);
  }
}

if (html.includes("web dashboard") || html.includes("stable Desktop")) {
  throw new Error("Landing page contains out-of-scope surface claims");
}

if (!css.includes("@media") || !css.includes("prefers-reduced-motion") || !js.includes("data-command-tab")) {
  throw new Error("Landing page is missing responsive CSS, reduced-motion CSS, or progressive JavaScript");
}

console.log("CodeAgora site smoke passed");
