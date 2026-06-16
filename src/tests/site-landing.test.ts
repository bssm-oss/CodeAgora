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
    expect(html).toContain("중개 서버 없이");
    expect(html).toContain("검증 가능한 품질");
    expect(html).toContain("어디서 실행해도 같은 기준");
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

  it("uses Korean app-console copy with responsive progressive motion", () => {
    expect(html).toContain('lang="ko"');
    expect(html).toContain("토론하는 리뷰");
    expect(html).toContain("LLM 다자 토론형 코드 리뷰");
    expect(html).toContain("비개발자");
    expect(html).toContain("그럴듯한 오답");
    expect(html).toContain("무엇을 해야 하는지");
    expect(html).toContain("결정 자료");
    expect(html).toContain("CodeAgora 리뷰 아레나 데모");
    expect(html).toContain('data-arena-file="init"');
    expect(html).toContain('data-arena-file="orchestrator"');
    expect(html).toContain('data-filter-step="quote"');
    expect(html).toContain("packages/cli/src/commands/init.ts");
    expect(html).toContain("CLI_PRESET_EXCLUDED_BACKENDS");
    expect(html).toContain("검토 범위");
    expect(html).toContain("근거 대조");
    expect(html).toContain("Head Verdict");
    expect(css).toContain("@media");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("--brand: #05a6b9");
    expect(css).toContain("--brand-strong: #191a51");
    expect(css).toContain(".review-arena");
    expect(css).toContain(".arena-files");
    expect(css).toContain(".plain-summary");
    expect(css).toContain(".explain-grid");
    expect(css).toContain("scan-beam");
    expect(js).toContain("data-command-tab");
    expect(js).toContain("arenaScenarios");
    expect(js).toContain("renderArena");
    expect(js).toContain("data-arena-file");
    expect(js).toContain("data-filter-step");
    expect(js).toContain("판정 정리");
    expect(js).toContain("navigator.clipboard");
    expect(js).toContain("reviewSteps");
  });
});
