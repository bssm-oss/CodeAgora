import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const assets = [
  ["../../assets/logo.svg", "public/assets/logo.svg"],
  ["assets/codeagora-icon.png", "public/assets/codeagora-icon.png"],
  ["assets/codeagora-wordmark.png", "public/assets/codeagora-wordmark.png"],
  ["assets/social-card.svg", "public/assets/social-card.svg"],
  ["robots.txt", "public/robots.txt"],
  ["sitemap.xml", "public/sitemap.xml"]
];

for (const [from, to] of assets) {
  const target = resolve(packageRoot, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(packageRoot, from), target);
}
