import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "dist/index.html",
  "dist/assets/logo.svg",
  "dist/assets/codeagora-icon.png",
  "dist/assets/codeagora-wordmark.png",
  "dist/assets/social-card.png",
  "dist/robots.txt",
  "dist/sitemap.xml"
];

for (const file of requiredFiles) {
  const fileStat = await stat(resolve(packageRoot, file));
  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`Missing or empty site artifact: ${file}`);
  }
}

const html = await readFile(resolve(packageRoot, "dist/index.html"), "utf8");
const robots = await readFile(resolve(packageRoot, "dist/robots.txt"), "utf8");
const sitemap = await readFile(resolve(packageRoot, "dist/sitemap.xml"), "utf8");
const astroFiles = await readdir(resolve(packageRoot, "dist/_astro"));
const cssFiles = astroFiles.filter((file) => file.endsWith(".css"));

if (cssFiles.length === 0) {
  throw new Error("Landing page is missing Astro CSS bundle");
}

const css = (
  await Promise.all(cssFiles.map((file) => readFile(resolve(packageRoot, "dist/_astro", file), "utf8")))
).join("\n");

const requiredCopy = [
  "CodeAgora",
  "npm i -g @codeagora/review",
  "GitHub Action",
  "MCP",
  "Desktop",
  "AI가 코드를 쏟아낼수록,",
  "검증은 더 치밀해져야 합니다.",
  "AI 코드 리뷰 도구",
  "GitHub Action 코드 리뷰",
  "자주 묻는 질문",
  "토론하는 리뷰",
  "공식 지원 환경"
];

for (const copy of requiredCopy) {
  if (!html.includes(copy)) {
    throw new Error(`Landing page is missing required copy: ${copy}`);
  }
}

if (html.includes("web dashboard") || html.includes("stable Desktop")) {
  throw new Error("Landing page contains out-of-scope surface claims");
}

const requiredSeo = [
  'rel="canonical"',
  'property="og:title"',
  'property="og:image"',
  'property="og:image:width"',
  'name="twitter:card"',
  'name="application-name"',
  'name="codeagora:commit"',
  'data-codeagora-site="astro"',
  'data-codeagora-commit=',
  '"@type":"FAQPage"',
  '"@type":"BreadcrumbList"',
  'type="application/ld+json"',
  "https://codeagora.vercel.app/"
];

for (const marker of requiredSeo) {
  if (!html.includes(marker)) {
    throw new Error(`Landing page is missing SEO marker: ${marker}`);
  }
}

if (!robots.includes("Sitemap: https://codeagora.vercel.app/sitemap.xml")) {
  throw new Error("robots.txt is missing the canonical sitemap URL");
}

if (!sitemap.includes("<loc>https://codeagora.vercel.app/</loc>")) {
  throw new Error("sitemap.xml is missing the canonical landing URL");
}

if (!css.includes("@media") || !css.includes("prefers-reduced-motion") || !html.includes("data-command-tab")) {
  throw new Error("Landing page is missing responsive CSS, reduced-motion CSS, or progressive JavaScript");
}

console.log("CodeAgora site smoke passed");
