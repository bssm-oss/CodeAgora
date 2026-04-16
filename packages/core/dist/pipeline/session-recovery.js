import fs from "fs/promises";
import path from "path";
async function detectProjectContext(repoPath, userContext) {
  try {
    const lines = [];
    if (userContext?.deploymentType) {
      const deployDescriptions = {
        "github-action": "Deployment: GitHub Action \u2014 dist/ is a SELF-CONTAINED BUNDLE. All dependencies MUST be inlined. Do NOT flag bundled dependencies as external or missing.",
        "cli": "Deployment: CLI tool \u2014 distributed as a standalone executable or npm package.",
        "library": "Deployment: Library \u2014 published to a package registry. Public API surface matters.",
        "web-app": "Deployment: Web application \u2014 bundled for browser delivery.",
        "api-server": "Deployment: API server \u2014 runs as a long-lived process.",
        "lambda": "Deployment: Serverless function (Lambda/Cloud Function) \u2014 cold-start and bundle size matter.",
        "docker": "Deployment: Docker container \u2014 multi-stage builds and image size matter.",
        "edge-function": "Deployment: Edge function \u2014 strict runtime constraints, limited APIs.",
        "monorepo": "Architecture: monorepo (workspace:* dependencies are STANDARD and correct \u2014 do NOT flag them)."
      };
      lines.push(deployDescriptions[userContext.deploymentType] ?? `Deployment: ${userContext.deploymentType}`);
    }
    const markerFiles = [
      [["action.yml", "action.yaml"], "Deployment: GitHub Action \u2014 dist/ is a SELF-CONTAINED BUNDLE. All dependencies MUST be inlined. Do NOT flag bundled dependencies as external or missing."],
      [["Dockerfile"], "Build: Docker container detected."],
      [["serverless.yml", "serverless.yaml"], "Deployment: Serverless Framework detected."],
      [["vercel.json"], "Deployment: Vercel detected."],
      [["netlify.toml"], "Deployment: Netlify detected."],
      [["fly.toml"], "Deployment: Fly.io detected."],
      [["wrangler.toml"], "Deployment: Cloudflare Workers detected."]
    ];
    for (const [files, label] of markerFiles) {
      for (const f of files) {
        const exists = await fs.access(path.join(repoPath, f)).then(() => true).catch(() => false);
        if (exists) {
          lines.push(label);
          break;
        }
      }
    }
    if (userContext?.bundledOutputs && userContext.bundledOutputs.length > 0) {
      lines.push(`Bundled outputs: ${userContext.bundledOutputs.join(", ")} \u2014 all deps inlined, do NOT flag external/missing dependency issues in these paths.`);
    }
    const pkgPath = path.join(repoPath, "package.json");
    const pkgRaw = await fs.readFile(pkgPath, "utf-8").catch(() => null);
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps);
      if (pkg.name) lines.push(`Project: ${pkg.name}`);
      const isMonorepo = await fs.access(path.join(repoPath, "pnpm-workspace.yaml")).then(() => true).catch(() => false) || await fs.access(path.join(repoPath, "lerna.json")).then(() => true).catch(() => false) || await fs.access(path.join(repoPath, "nx.json")).then(() => true).catch(() => false);
      if (isMonorepo) {
        lines.push("Architecture: monorepo (workspace:* dependencies are STANDARD and correct \u2014 do NOT flag them)");
      }
      if (pkg.packageManager?.startsWith("pnpm") || depNames.includes("pnpm")) {
        lines.push("Package manager: pnpm");
      }
      const knownLibs = [
        [["zod"], "Validation: zod (do NOT suggest joi, yup, or other validation libraries)"],
        [["joi"], "Validation: joi"],
        [["express"], "Framework: Express"],
        [["fastify"], "Framework: Fastify"],
        [["hono"], "Framework: Hono"],
        [["next"], "Framework: Next.js"],
        [["nuxt"], "Framework: Nuxt"],
        [["react"], "UI: React"],
        [["vue"], "UI: Vue"],
        [["prisma", "@prisma/client"], "ORM: Prisma"],
        [["typeorm"], "ORM: TypeORM"],
        [["drizzle-orm"], "ORM: Drizzle"],
        [["vitest"], "Test: vitest"],
        [["jest"], "Test: jest"],
        [["typescript"], "Language: TypeScript (strict mode expected)"]
      ];
      for (const [keys, label] of knownLibs) {
        if (keys.some((k) => depNames.includes(k))) {
          lines.push(label);
        }
      }
    }
    if (userContext?.notes && userContext.notes.length > 0) {
      for (const note of userContext.notes) {
        lines.push(note);
      }
    }
    if (lines.length === 0) return void 0;
    return `## Project Context
${lines.map((l) => `- ${l}`).join("\n")}

Do NOT flag items that conform to the above context as issues.`;
  } catch {
    return void 0;
  }
}
export {
  detectProjectContext
};
