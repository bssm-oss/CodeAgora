import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const siteRoot = resolve(process.cwd(), "packages/site");
const html = readFileSync(resolve(siteRoot, "index.html"), "utf8");
const css = readFileSync(resolve(siteRoot, "src/styles.css"), "utf8");
const js = readFileSync(resolve(siteRoot, "src/main.js"), "utf8");
const robots = readFileSync(resolve(siteRoot, "robots.txt"), "utf8");
const sitemap = readFileSync(resolve(siteRoot, "sitemap.xml"), "utf8");
const socialCard = readFileSync(resolve(siteRoot, "assets/social-card.svg"), "utf8");
const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  framework?: string | null;
  installCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  cleanUrls?: boolean;
};
const vercelIgnore = readFileSync(resolve(process.cwd(), ".vercelignore"), "utf8");
const siteUrl = "https://codeagora.vercel.app/";

describe("CodeAgora landing page", () => {
  it("keeps public claims aligned with supported product surfaces", () => {
    expect(html).toContain("CLI");
    expect(html).toContain("GitHub Action");
    expect(html).toContain("MCP");
    expect(html).toContain("Desktop");
    expect(html).toContain("공식 지원 환경");
    expect(html).toContain("중개 서버 없이");
    expect(html).toContain("검증 가능한 품질");
    expect(html).toContain("어디서 실행해도 같은 기준");
    expect(html).toContain("AI 코드 리뷰 도구");
    expect(html).toContain("GitHub Action 코드 리뷰 자동화");
    expect(html).toContain("MCP 코드 리뷰");
    expect(html).toContain("Desktop RC");
    expect(html).toContain("자주 묻는 질문");
    expect(html).toContain("RC는 정식 출시 전 검증 채널");
    expect(html).toContain("data-command-status");
    expect(html).not.toMatch(/web dashboard/i);
    expect(html).not.toMatch(/stable desktop/i);
    expect(html).not.toMatch(/90%|85%/);
    expect(html).not.toContain("코드가 기기를 떠나지");
  });

  it("provides rc-friendly install and action snippets", () => {
    expect(html).toContain("npm i -g @codeagora/review@rc");
    expect(html).toContain("bssm-oss/CodeAgora@v0.1.0-rc.6");
    expect(html).toContain("@codeagora/mcp@rc");
  });

  it("publishes canonical SEO and social preview metadata", () => {
    expect(html).toContain(`<link rel="canonical" href="${siteUrl}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="ko" href="${siteUrl}">`);
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain(`<meta property="og:url" content="${siteUrl}">`);
    expect(html).toContain('<meta property="og:image" content="https://codeagora.vercel.app/assets/social-card.svg">');
    expect(html).toContain('<meta property="og:image:type" content="image/svg+xml">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:image:alt" content="CodeAgora - 토론하는 리뷰, 근거 있는 판정">');
    expect(html).toContain('<meta name="theme-color" content="#111318">');
    expect(html).toContain('<meta name="application-name" content="CodeAgora">');
    expect(html).toContain('<meta name="format-detection" content="telephone=no">');
    expect(html).not.toContain("90%");
  });

  it("keeps structured data valid and aligned with supported surfaces", () => {
    const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const structuredData = JSON.parse(match?.[1] ?? "{}");

    expect(structuredData["@context"]).toBe("https://schema.org");
    expect(structuredData["@graph"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "WebSite",
          url: siteUrl,
          inLanguage: "ko-KR"
        }),
        expect.objectContaining({
          "@type": "WebPage",
          "@id": `${siteUrl}#webpage`,
          about: {
            "@id": `${siteUrl}#software`
          }
        }),
        expect.objectContaining({
          "@type": "SoftwareApplication",
          applicationCategory: "DeveloperApplication",
          applicationSubCategory: "AI code review",
          softwareVersion: "0.1.0-rc.6",
          isAccessibleForFree: true,
          codeRepository: "https://github.com/bssm-oss/CodeAgora",
          downloadUrl: "https://www.npmjs.com/package/@codeagora/review",
          featureList: expect.arrayContaining([
            "GitHub Action pull request automation",
            "MCP server for AI IDEs and coding agents",
            "Desktop RC local review UI"
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
              name: "GitHub Action 코드 리뷰 자동화에 쓸 수 있나요?"
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

  it("ships crawler files and social card assets", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://codeagora.vercel.app/sitemap.xml");
    expect(sitemap).toContain(`<loc>${siteUrl}</loc>`);
    expect(sitemap).toContain("<lastmod>2026-06-16</lastmod>");
    expect(socialCard).toContain("<svg");
    expect(socialCard).toContain("CodeAgora");
    expect(socialCard).toContain("토론하는 리뷰");
  });

  it("configures Vercel to deploy only the static site package", () => {
    expect(vercelConfig).toMatchObject({
      framework: null,
      installCommand: "pnpm install --frozen-lockfile",
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

  it("keeps static asset paths portable for subpath hosting", () => {
    expect(html).toContain('href="./assets/logo.svg"');
    expect(html).toContain('src="./assets/logo.svg"');
    expect(html).not.toContain('href="/assets/logo.svg"');
    expect(html).not.toContain('src="/assets/logo.svg"');
  });

  it("wires install tabs with accessible tabpanel semantics and keyboard support", () => {
    for (const tab of ["cli", "action", "mcp", "desktop"]) {
      expect(html).toContain(`id="command-tab-${tab}"`);
      expect(html).toContain(`aria-controls="command-panel-${tab}"`);
      expect(html).toContain(`id="command-panel-${tab}"`);
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain(`aria-labelledby="command-tab-${tab}"`);
    }

    expect(js).toContain("activateCommandTab");
    expect(js).toContain('event.key === "ArrowRight"');
    expect(js).toContain('event.key === "ArrowLeft"');
    expect(js).toContain('event.key === "Home"');
    expect(js).toContain('event.key === "End"');
  });

  it("copies runnable snippets instead of terminal prompts or output", () => {
    expect(js).toContain("commandTextFromCode");
    expect(js).toContain('clone.querySelectorAll(".result").forEach((node) => node.remove())');
    expect(js).toContain('replace(/^\\s*\\$\\s?/u, "")');
    expect(js).toContain("복사 실패");
    expect(js).toContain("await navigator.clipboard.writeText(text)");
  });

  it("keeps theme storage optional so page interactions survive restricted browsers", () => {
    expect(js).toContain("function readLocalTheme");
    expect(js).toContain("function writeLocalTheme");
    expect(js).toContain("try");
    expect(js).toContain("catch {");
    expect(html).toContain("savedTheme = null");
    expect(html).toContain("try {");
  });

  it("uses Korean app-console copy with responsive progressive motion", () => {
    expect(html).toContain('lang="ko"');
    expect(html).toContain("토론하는 리뷰");
    expect(html).toContain("여러 AI가 토론하고 사람이 결정하는 코드 리뷰");
    expect(html).toContain("비개발자");
    expect(html).toContain("그럴듯한 오답");
    expect(html).toContain("무엇을 해야 하는지");
    expect(html).toContain("결정 자료");
    expect(html).toContain("긴 코멘트 목록 대신");
    expect(html).toContain("ACCEPT");
    expect(html).toContain("REJECT");
    expect(html).toContain("NEEDS_HUMAN");
    expect(html).toContain("CodeAgora 리뷰 아레나 데모");
    expect(html).toContain('data-arena-file="init"');
    expect(html).toContain('data-arena-file="orchestrator"');
    expect(html).toContain('data-filter-step="quote"');
    expect(html).toContain("packages/cli/src/commands/init.ts");
    expect(html).toContain("CLI_PRESET_EXCLUDED_BACKENDS");
    expect(html).toContain("검토 범위");
    expect(html).toContain("근거 대조");
    expect(html).toContain("파일 확인");
    expect(html).toContain("인용 검증");
    expect(html).toContain("Head Verdict");
    expect(html).toContain("로컬 diff를 바로 리뷰합니다");
    expect(html).toContain("→ ACCEPT / REJECT / NEEDS_HUMAN verdict with evidence");
    expect(html).toContain("어떤 검색어로 찾아도 같은 제품");
    expect(html).toContain("CLI diff review");
    expect(html).toContain("AI IDE와 코딩 에이전트");
    expect(html).toContain("<details open>");
    expect(html).toContain("API 키와 코드는 어디에 저장되나요?");
    expect(css).toContain("@media");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("--brand: #05a6b9");
    expect(css).toContain("--brand-strong: #191a51");
    expect(css).toContain(".review-arena");
    expect(css).toContain(".arena-files");
    expect(css).toContain(".plain-summary");
    expect(css).toContain(".explain-grid");
    expect(css).toContain(".decision-grid");
    expect(css).toContain(".verdict-guide");
    expect(css).toContain(".diff-insight-row");
    expect(css).toContain(".use-case-grid");
    expect(css).toContain(".faq-list");
    expect(css).toContain("scan-beam");
    expect(js).toContain("data-command-tab");
    expect(js).toContain("commandStatusLabels");
    expect(js).toContain("arenaScenarios");
    expect(js).toContain("renderArena");
    expect(js).toContain("data-arena-file");
    expect(js).toContain("data-filter-step");
    expect(js).toContain("판정 정리");
    expect(js).toContain("navigator.clipboard");
    expect(js).toContain("reviewSteps");
  });

  it("keeps mobile code snippets readable instead of clipped", () => {
    expect(css).not.toContain("max-height: 78px");
    expect(css).not.toContain("word-break: break-all");
    expect(css).toContain("word-break: normal");
    expect(css).toContain("overflow: auto");
    expect(css).toContain("scrollbar-width: thin");
  });
});
