import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const siteRoot = resolve(process.cwd(), "packages/site");
const html = readFileSync(resolve(siteRoot, "index.html"), "utf8");
const css = readFileSync(resolve(siteRoot, "src/styles.css"), "utf8");
const js = readFileSync(resolve(siteRoot, "src/main.js"), "utf8");

describe("CodeAgora landing page", () => {
  it("keeps public claims aligned with supported product surfaces", () => {
    expect(html).toContain("CLI");
    expect(html).toContain("GitHub Action");
    expect(html).toContain("MCP");
    expect(html).toContain("Desktop");
    expect(html).toContain("공식 지원 표면");
    expect(html).not.toMatch(/web dashboard/i);
    expect(html).not.toMatch(/stable desktop/i);
  });

  it("provides rc-friendly install and action snippets", () => {
    expect(html).toContain("npm i -g @codeagora/review@rc");
    expect(html).toContain("bssm-oss/CodeAgora@v0.1.0-rc.6");
    expect(html).toContain("@codeagora/mcp@rc");
  });

  it("uses Korean app-console copy with responsive progressive motion", () => {
    expect(html).toContain('lang="ko"');
    expect(html).toContain("토론하는 리뷰");
    expect(html).toContain("LLM 코드 리뷰를 운영 가능한 파이프라인으로");
    expect(html).toContain("Diff 분석");
    expect(html).toContain("병렬 리뷰어");
    expect(html).toContain("토론과 필터");
    expect(html).toContain("Head Verdict");
    expect(css).toContain("@media");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("--brand: #05a6b9");
    expect(css).toContain("--brand-strong: #191a51");
    expect(css).toContain(".app-demo");
    expect(js).toContain("data-command-tab");
    expect(js).toContain("navigator.clipboard");
    expect(js).toContain("reviewSteps");
  });
});
