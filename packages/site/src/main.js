// Theme Toggle
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  
  if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });
}

// Progressive Command tabs
const commandTabs = document.querySelectorAll("[data-command-tab]");
const commandPanels = document.querySelectorAll("[data-command-panel]");
const stepLabel = document.querySelector("[data-step-label]");

const reviewSteps = [
  { id: "file", label: "파일 실존 확인" },
  { id: "line", label: "라인 범위 검증" },
  { id: "quote", label: "코드 인용 대조" },
  { id: "conflict", label: "상충 주장 검출" }
];

const arenaScenarios = {
  init: {
    path: "packages/cli/src/commands/init.ts",
    title: "프리셋 생성 경로 검토",
    verdict: "NEEDS_HUMAN",
    code: `<span class="code-muted">const</span> CLI_PRESET_EXCLUDED_BACKENDS = <span class="code-muted">new</span> Set([<span class="code-string">'copilot'</span>]);

<span class="code-muted">export function</span> generatePresets(
  env: EnvironmentReport,
  catalog: ModelsCatalog | null,
  cliBackends?: DetectedCli[],
): DynamicPreset[] {
  <span class="code-add">const availableCli = [...(cliBackends?.filter((c) =&gt;</span>
  <span class="code-add">  c.available &amp;&amp; !CLI_PRESET_EXCLUDED_BACKENDS.has(c.backend)</span>
  <span class="code-add">) ?? [])].sort((a, b) =&gt; {</span>`,
    comments: [
      ["Security", "로컬 CLI 백엔드는 허용된 실행 경로만 프리셋에 들어가야 합니다. 제외 목록과 탐지 결과를 같이 확인합니다."],
      ["Maintainer", "`fast`, `budget`, `github-action` 별칭이 같은 설정 계약으로 귀결되는지도 함께 검토해야 합니다."],
      ["Head Verdict", "파일 경로와 코드 인용은 확인됨. 프리셋 별칭과 CLI 백엔드 제외 정책은 사람 검토로 올립니다."]
    ],
    filters: {
      file: "실제 저장소의 init.ts 경로와 코드 인용을 먼저 확인했습니다.",
      line: "표시된 블록은 프리셋 생성 함수 내부의 CLI 백엔드 필터링 흐름에 연결됩니다.",
      quote: "화면의 `CLI_PRESET_EXCLUDED_BACKENDS` 인용은 실제 코드 토큰과 대조 가능한 형태로 유지합니다.",
      conflict: "보안 경계와 사용성 별칭 계약이 충돌하므로 Head Verdict가 사람 검토로 올립니다."
    }
  },
  orchestrator: {
    path: "packages/core/src/pipeline/orchestrator.ts",
    title: "환각 필터 적용 경로 검토",
    verdict: "EVIDENCE",
    code: `<span class="code-muted">const</span> { filterHallucinations } =
  <span class="code-muted">await import</span>(<span class="code-string">'./hallucination-filter.js'</span>);

<span class="code-add">const hallucinationResult = filterHallucinations(</span>
<span class="code-add">  allEvidenceDocs,</span>
<span class="code-add">  filteredDiffContent,</span>
<span class="code-add">);</span>

allEvidenceDocs = [
  ...hallucinationResult.filtered,
  ...hallucinationResult.uncertain,
];`,
    comments: [
      ["Reliability", "필터 결과가 `filtered`와 `uncertain`으로 나뉘어 다음 단계에 전달되는지 확인합니다."],
      ["Security", "제거된 finding을 조용히 버리지 않고 evidence 흐름에서 추적 가능해야 합니다."],
      ["Head Verdict", "필터 적용 경로는 확인됨. uncertain 큐가 최종 판정에 어떻게 보존되는지 검토합니다."]
    ],
    filters: {
      file: "orchestrator.ts는 pipeline 진입점으로 확인됩니다.",
      line: "필터 호출과 evidence 재구성 라인을 같은 블록으로 묶어 검토합니다.",
      quote: "`filterHallucinations` 호출 인용이 실제 import/호출 구조와 일치하는지 확인합니다.",
      conflict: "제거된 finding과 uncertain finding의 처리 정책이 판정 단계와 충돌하지 않는지 봅니다."
    }
  },
  action: {
    path: "action.yml",
    title: "GitHub Action degraded 경로 검토",
    verdict: "CHECKING",
    code: `<span class="code-muted">- name:</span> Capture PR diff
  <span class="code-muted">shell:</span> bash
  <span class="code-muted">run:</span> |
    <span class="code-add">if ! gh pr diff "$PR_NUMBER" --repo "$REPO" &gt; /tmp/codeagora-pr.diff; then</span>
      echo <span class="code-string">"degraded=true"</span> &gt;&gt; "$GITHUB_OUTPUT"
    fi

<span class="code-muted">- name:</span> Run CodeAgora review
  <span class="code-muted">run:</span> node "$ACTION_PATH/dist/action.js"`,
    comments: [
      ["CI Reviewer", "PR diff 획득 실패가 provider 호출 실패와 구분되어 degraded output으로 남는지 확인합니다."],
      ["Maintainer", "fork PR과 secret 누락 경로가 리뷰 게시 실패와 섞이지 않아야 합니다."],
      ["Head Verdict", "Action 경로는 fail-open이 아니라 degraded 상태를 명시하는 방향으로 검토합니다."]
    ],
    filters: {
      file: "루트 action.yml 경로를 기준으로 composite action 계약을 확인합니다.",
      line: "diff 획득 실패와 review 실행 단계가 분리되어 있는지 라인 범위를 확인합니다.",
      quote: "`degraded=true` 출력 인용이 실제 Action output 계약과 맞는지 대조합니다.",
      conflict: "fork PR 안전성, secret 부재, 게시 실패를 하나의 실패로 뭉개지 않는지 확인합니다."
    }
  },
  desktop: {
    path: "packages/desktop/src/main.ts",
    title: "Desktop 테마와 세션 표면 검토",
    verdict: "ACCEPT",
    code: `<span class="code-muted">const</span> themePreferenceKey =
  <span class="code-string">'codeagora.desktop.theme'</span>;

<span class="code-muted">function</span> applyDesktopTheme(preference = state.themePreference): void {
  <span class="code-add">root.dataset.theme = preference;</span>
  <span class="code-add">root.style.colorScheme = preference;</span>
}

<span class="code-muted">type</span> View = <span class="code-string">'sessions'</span> | <span class="code-string">'run'</span> | <span class="code-string">'config'</span> | <span class="code-string">'setup'</span>;`,
    comments: [
      ["UX", "랜딩의 다크/라이트 토큰이 Desktop 테마 전환과 같은 제품군처럼 보여야 합니다."],
      ["Maintainer", "Desktop은 별도 리뷰 의미론이 아니라 sessions/run/config/setup 표면으로 core 계약을 보여줍니다."],
      ["Head Verdict", "테마와 표면 명명은 제품 계약과 정렬되어 있어 랜딩 목업에 반영 가능합니다."]
    ],
    filters: {
      file: "Desktop main.ts 경로와 테마 preference key를 기준으로 제품 테마를 확인합니다.",
      line: "테마 적용 함수와 View 타입이 같은 화면 계약 안에 있는지 확인합니다.",
      quote: "`codeagora.desktop.theme` 인용은 랜딩 테마 토큰의 근거로 사용할 수 있습니다.",
      conflict: "Desktop이 별도 semantics를 만들지 않는다는 문구와 화면 구성이 일치합니다."
    }
  }
};

let activeArenaFile = "init";
let activeFilterStep = "file";

function renderArena(fileKey = activeArenaFile, filterKey = activeFilterStep) {
  const scenario = arenaScenarios[fileKey] ?? arenaScenarios.init;
  activeArenaFile = fileKey;
  activeFilterStep = filterKey;

  document.querySelector("[data-arena-path]").textContent = scenario.path;
  document.querySelector("[data-arena-title]").textContent = scenario.title;
  document.querySelector("[data-arena-verdict]").textContent = scenario.verdict;
  document.querySelector("[data-arena-code]").innerHTML = scenario.code;
  const codeScroller = document.querySelector(".code-review-card pre");
  if (codeScroller) {
    codeScroller.scrollTop = 0;
    codeScroller.scrollLeft = 0;
  }
  const arenaScroller = document.querySelector(".review-arena");
  if (arenaScroller) {
    arenaScroller.scrollLeft = 0;
  }

  scenario.comments.forEach(([role, text], index) => {
    const roleNode = document.querySelector(`[data-agent-role="${index}"]`);
    const textNode = document.querySelector(`[data-agent-text="${index}"]`);
    if (roleNode) roleNode.textContent = role;
    if (textNode) textNode.textContent = index === 2 ? (scenario.filters[filterKey] ?? text) : text;
  });

  for (const button of document.querySelectorAll("[data-arena-file]")) {
    const isActive = button.getAttribute("data-arena-file") === fileKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  for (const button of document.querySelectorAll("[data-filter-step]")) {
    const isActive = button.getAttribute("data-filter-step") === filterKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  if (stepLabel) {
    stepLabel.textContent = reviewSteps.find((step) => step.id === filterKey)?.label ?? "파일 실존 확인";
  }
}

for (const tab of commandTabs) {
  tab.addEventListener("click", () => {
    const target = tab.getAttribute("data-command-tab");

    for (const button of commandTabs) {
      const isActive = button === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    }

    for (const panel of commandPanels) {
      panel.hidden = panel.getAttribute("data-command-panel") !== target;
    }
  });
}

for (const button of document.querySelectorAll("[data-arena-file]")) {
  button.addEventListener("click", () => {
    renderArena(button.getAttribute("data-arena-file") || "init", "file");
  });
}

for (const button of document.querySelectorAll("[data-filter-step]")) {
  button.addEventListener("click", () => {
    renderArena(activeArenaFile, button.getAttribute("data-filter-step") || "file");
  });
}

if (document.querySelector("[data-arena-code]")) {
  renderArena();
}

// Copy to Clipboard buttons
for (const button of document.querySelectorAll("[data-copy-target]")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.getAttribute("data-copy-target"));
    const text = target?.textContent?.trim();
    if (!text || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(text);
    button.textContent = "복사됨";
    window.setTimeout(() => {
      button.textContent = "복사";
    }, 1400);
  });
}
