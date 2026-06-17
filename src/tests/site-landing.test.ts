import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const siteRoot = resolve(repoRoot, "packages/site");
const html = readFileSync(resolve(siteRoot, "dist/index.html"), "utf8");
const css = readFileSync(resolve(siteRoot, "src/styles/site.css"), "utf8");
const js = readFileSync(resolve(siteRoot, "src/scripts/site.js"), "utf8");
const robots = readFileSync(resolve(siteRoot, "dist/robots.txt"), "utf8");
const sitemap = readFileSync(resolve(siteRoot, "dist/sitemap.xml"), "utf8");
const socialCard = readFileSync(resolve(siteRoot, "assets/social-card.png"));
const wordmark = readFileSync(resolve(siteRoot, "assets/codeagora-wordmark.png"));
const icon = readFileSync(resolve(siteRoot, "assets/codeagora-icon.png"));
const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};
const vercelConfig = JSON.parse(readFileSync(resolve(repoRoot, "vercel.json"), "utf8")) as {
  framework?: string | null;
  installCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  cleanUrls?: boolean;
};
const vercelIgnore = readFileSync(resolve(repoRoot, ".vercelignore"), "utf8");
const siteUrl = "https://codeagora.vercel.app/";

const structuredData = (() => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(match?.[1]).toBeTruthy();
  return JSON.parse(match?.[1] ?? "{}") as {
    "@context"?: string;
    "@graph"?: Array<Record<string, unknown>>;
  };
})();

describe("CodeAgora landing page", () => {
  it("keeps public claims aligned with supported product surfaces", () => {
    for (const copy of [
      "CLI",
      "GitHub Action",
      "MCP",
      "Desktop app",
      "공식 지원 환경",
      "AI 코드 리뷰 도구",
      "여러 AI가 검토하고",
      "근거로 판단합니다.",
      "한 명의 AI에게 맡기는",
      "리뷰가 아닙니다.",
      "결과는 읽는 글이 아니라,",
      "판단 가능한 자료입니다.",
      "코드는 직접 보내고,",
      "비용은 그대로 보입니다.",
      "자주 묻는 질문"
    ]) {
      expect(html).toContain(copy);
    }

    expect(html).not.toContain("3114 황준혁 | Justn");
    expect(html).not.toMatch(/web dashboard/i);
    expect(html).not.toMatch(/stable desktop/i);
    expect(html).not.toMatch(/90%|85%/);
    expect(html).not.toContain("코드가 기기를 떠나지");
  });

  it("renders the current branded shell and desktop-like review preview", () => {
    expect(html).toContain('class="brand-icon" src="/assets/codeagora-icon.png"');
    expect(html).toContain('class="brand-wordmark" src="/assets/codeagora-wordmark.png"');
    expect(html).toContain('href="/assets/codeagora-icon.png" type="image/png"');
    expect(html).toContain("CodeAgora Desktop");
    expect(html).toContain("NEEDS_HUMAN");
    expect(html).toContain("head-verdict.json");
    expect(html).toContain("reviews/security.md");
    expect(css).toContain(".app-preview");
    expect(css).toContain(".brand .brand-icon");
    expect(css).toContain("transform: translateY(2px)");
  });

  it("keeps the interactive pipeline grouped as a central workbench", () => {
    expect(html).toContain('class="pipeline-rail"');
    expect(html).toContain('data-pipeline-demo');
    expect(html).toContain('data-pipeline-step="diff"');
    expect(html).toContain('data-pipeline-step="reviewers"');
    expect(html).toContain('data-pipeline-step="evidence"');
    expect(html).toContain('data-pipeline-step="verdict"');
    expect(html).toContain("스크롤하면 리뷰가");
    expect(html).toContain("판정으로 좁혀집니다.");
    expect(css).toContain(".pipeline-demo");
    expect(css).toContain("width: min(100%, 1180px)");
    expect(css).toContain(".pipeline-rail");
    expect(css).toContain("position: sticky");
    expect(js).toContain("syncPipelineFromScroll");
    expect(js).toContain("[data-pipeline-step]");
  });

  it("provides stable install and action snippets", () => {
    expect(html).toContain("npm i -g @codeagora/review");
    expect(html).toContain("bssm-oss/CodeAgora@v0.1.2");
    expect(html).toContain("@codeagora/mcp");
    expect(html).toContain("Desktop app");
    expect(html).toContain("v0.1.2 macOS arm64 unsigned preview DMG");
  });

  it("publishes canonical SEO and social preview metadata", () => {
    expect(html).toContain(`<link rel="canonical" href="${siteUrl}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="ko" href="${siteUrl}">`);
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain(`<meta property="og:url" content="${siteUrl}">`);
    expect(html).toContain('<meta property="og:image" content="https://codeagora.vercel.app/assets/social-card.png">');
    expect(html).toContain('<meta property="og:image:type" content="image/png">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:image:alt" content="CodeAgora - 토론하는 리뷰, 근거 있는 판정">');
    expect(html).toContain('<meta name="theme-color" content="#080d18">');
    expect(html).toContain('<meta name="application-name" content="CodeAgora">');
    expect(html).toMatch(/<meta name="codeagora:commit" content="(unknown|[0-9a-f]{40})">/);
    expect(html).toMatch(/<body data-codeagora-site="astro" data-codeagora-commit="(unknown|[0-9a-f]{40})">/);
    expect(html).not.toContain("90%");
  });

  it("keeps structured data valid and aligned with supported surfaces", () => {
    expect(structuredData["@context"]).toBe("https://schema.org");
    expect(structuredData["@graph"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "WebSite",
          url: siteUrl,
          inLanguage: "ko-KR"
        }),
        expect.objectContaining({
          "@type": "SoftwareApplication",
          applicationCategory: "DeveloperApplication",
          applicationSubCategory: "AI code review",
          softwareVersion: "0.1.2",
          isAccessibleForFree: true,
          codeRepository: "https://github.com/bssm-oss/CodeAgora",
          downloadUrl: "https://www.npmjs.com/package/@codeagora/review",
          featureList: expect.arrayContaining([
            "GitHub Action pull request automation",
            "MCP server for AI IDEs and coding agents",
            "Desktop app local review UI"
          ])
        }),
        expect.objectContaining({
          "@type": "FAQPage",
          "@id": `${siteUrl}#faq`,
          mainEntity: expect.arrayContaining([
            expect.objectContaining({
              "@type": "Question",
              name: "CodeAgora는 무엇인가요?"
            }),
            expect.objectContaining({
              "@type": "Question",
              name: "비개발자도 이해할 수 있나요?"
            }),
            expect.objectContaining({
              "@type": "Question",
              name: "Desktop은 안정판인가요?"
            })
          ])
        }),
        expect.objectContaining({
          "@type": "BreadcrumbList",
          "@id": `${siteUrl}#breadcrumb`
        })
      ])
    );
    expect(JSON.stringify(structuredData)).toContain("CLI, GitHub Action, MCP, Desktop");
    expect(JSON.stringify(structuredData)).not.toMatch(/stable Desktop|web dashboard/i);
  });

  it("ships crawler files and social/brand assets", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://codeagora.vercel.app/sitemap.xml");
    expect(sitemap).toContain(`<loc>${siteUrl}</loc>`);
    expect(sitemap).toContain("<lastmod>2026-06-16</lastmod>");
    expect(socialCard.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(socialCard.byteLength).toBeGreaterThan(100_000);
    expect(wordmark.byteLength).toBeGreaterThan(1000);
    expect(icon.byteLength).toBeGreaterThan(1000);
  });

  it("configures Vercel to deploy only the static site package", () => {
    expect(vercelConfig).toMatchObject({
      framework: null,
      installCommand: "pnpm install --frozen-lockfile --ignore-scripts",
      buildCommand: "pnpm --filter @codeagora/site build",
      outputDirectory: "packages/site/dist",
      cleanUrls: true
    });
    expect(vercelIgnore).toContain("/node_modules");
    expect(vercelIgnore).toContain("/packages/core");
    expect(vercelIgnore).toContain("!packages/site");
    expect(vercelIgnore).toContain("!packages/site/**");
    expect(vercelIgnore).toContain("!assets/logo.svg");
  });

  it("wires accessible tabs, motion controls, search, and copy helpers", () => {
    for (const tab of ["cli", "action", "mcp", "desktop"]) {
      expect(html).toContain(`id="tab-${tab}"`);
      expect(html).toContain(`aria-controls="panel-${tab}"`);
      expect(html).toContain(`id="panel-${tab}"`);
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain(`data-command-panel="${tab}"`);
    }

    expect(html).toContain("data-motion-toggle");
    expect(html).toContain("data-faq-search");
    expect(html).toContain("data-copy-target");
    expect(js).toContain("activateCommand");
    expect(js).toContain('event.key === "ArrowRight"');
    expect(js).toContain('event.key === "ArrowLeft"');
    expect(js).toContain("IntersectionObserver");
    expect(js).toContain("navigator.clipboard.writeText");
    expect(js).toContain("window.localStorage");
    expect(js).toContain("[data-live-agent]");
  });

  it("keeps the site static, responsive, and Node 20-compatible", () => {
    expect(rootPackage.engines?.node).toBe(">=20");
    expect(rootPackage.devDependencies?.astro).toMatch(/^\^?5\./);
    expect(css).toContain("@media");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("overflow: auto");
    expect(css).not.toContain("word-break: break-all");
    expect(css).not.toContain(".poster-qr");
    expect(css).not.toContain(".poster-metrics");
  });
});
