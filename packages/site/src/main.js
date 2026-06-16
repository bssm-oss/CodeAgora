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
  { id: "file", label: "검토 범위" },
  { id: "line", label: "라인 확인" },
  { id: "quote", label: "근거 대조" },
  { id: "conflict", label: "판정 정리" }
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
      ["Security", "사용자 컴퓨터에서 실행되는 CLI 도구는 허용된 실행 경로만 설정에 들어가야 합니다. 잘못 넣으면 리뷰가 엉뚱한 도구를 부를 수 있습니다."],
      ["Maintainer", "`fast`, `budget`, `github-action`처럼 이름만 다른 선택지가 실제로 같은 설정 규칙으로 이어지는지도 확인해야 합니다."],
      ["Head Verdict", "파일과 코드 인용은 확인됐습니다. 다만 어떤 CLI 백엔드를 기본 프리셋에 넣을지는 제품 정책 판단이 필요해 사람 확인으로 올립니다."]
    ],
    filters: {
      file: "이 지적이 실제 저장소의 init.ts 변경을 보고 나온 것인지 먼저 확인했습니다.",
      line: "표시된 코드는 프리셋을 만드는 함수 안에 있으며, CLI 도구를 골라내는 흐름과 연결됩니다.",
      quote: "화면의 `CLI_PRESET_EXCLUDED_BACKENDS` 인용은 실제 코드 토큰과 대조 가능한 형태로 유지합니다.",
      conflict: "보안을 더 엄격히 하면 사용성은 줄 수 있습니다. 자동으로 단정하지 않고, 제품 정책 질문으로 정리합니다."
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
      ["Reliability", "틀렸다고 판단한 지적과 아직 애매한 지적이 서로 다른 목록으로 넘어가는지 확인합니다."],
      ["Security", "제거된 지적도 왜 빠졌는지 추적할 수 있어야 합니다. 그래야 중요한 경고가 조용히 사라지지 않습니다."],
      ["Head Verdict", "환각 필터 경로는 확인됐습니다. 애매한 항목이 최종 판정에서 어떻게 보이는지까지 함께 봅니다."]
    ],
    filters: {
      file: "orchestrator.ts는 리뷰 파이프라인을 실제로 조립하는 핵심 파일입니다.",
      line: "필터를 호출하는 부분과 evidence를 다시 묶는 부분을 같은 흐름으로 확인합니다.",
      quote: "`filterHallucinations`라는 함수 호출이 실제 import와 호출 구조에 맞는지 대조합니다.",
      conflict: "삭제한 지적과 애매한 지적을 같은 취급으로 뭉개지 않도록, 최종 판정 단계와 맞춰봅니다."
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
      ["CI Reviewer", "PR 변경 내용을 가져오지 못한 상황과 AI 공급자 호출 실패는 원인이 다릅니다. 결과 화면에서도 구분되어야 합니다."],
      ["Maintainer", "외부 기여자의 PR이나 secret 누락은 흔한 운영 상황입니다. 리뷰 게시 실패와 섞이면 팀이 원인을 찾기 어렵습니다."],
      ["Head Verdict", "GitHub Action은 조용히 통과시키는 대신, 어떤 부분이 낮아진 상태인지 표시하는 방향으로 검토합니다."]
    ],
    filters: {
      file: "루트 action.yml을 기준으로 GitHub PR에서 실행되는 공개 사용 경로를 확인합니다.",
      line: "변경 내용 획득 실패와 실제 리뷰 실행 단계가 분리되어 있는지 확인합니다.",
      quote: "`degraded=true` 출력이 실제 Action output 계약과 맞는지 대조합니다.",
      conflict: "fork PR, secret 부재, 게시 실패는 각각 다른 운영 문제입니다. 하나의 실패로 뭉개지 않는지 확인합니다."
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
      ["UX", "랜딩의 색상과 대비가 Desktop 앱의 다크/라이트 테마와 같은 제품군처럼 보여야 합니다."],
      ["Maintainer", "Desktop은 새로운 리뷰 규칙을 만드는 앱이 아니라, sessions/run/config/setup 화면으로 같은 core 계약을 보여주는 표면입니다."],
      ["Head Verdict", "테마와 화면 이름은 제품 계약과 맞습니다. 랜딩에서도 같은 시각 언어를 쓰는 방향으로 승인할 수 있습니다."]
    ],
    filters: {
      file: "Desktop main.ts의 테마 설정을 기준으로 랜딩의 색상 방향을 맞춥니다.",
      line: "테마 적용 함수와 화면 타입이 같은 앱 계약 안에 있는지 확인합니다.",
      quote: "`codeagora.desktop.theme` 인용은 랜딩 테마 토큰을 설명하는 근거로 사용할 수 있습니다.",
      conflict: "Desktop이 별도 판단 규칙을 만들지 않는다는 문구와 화면 구성이 일치합니다."
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
    stepLabel.textContent = reviewSteps.find((step) => step.id === filterKey)?.label ?? "검토 범위";
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
