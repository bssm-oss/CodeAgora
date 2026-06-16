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
const runState = document.querySelector("[data-run-state]");
const verdict = document.querySelector("[data-verdict]");

const reviewSteps = [
  { label: "파일 실존 확인", state: "경로 검증 중", verdict: "EVIDENCE" },
  { label: "라인 범위 검증", state: "라인 매핑 중", verdict: "CHECKING" },
  { label: "코드 인용 대조", state: "인용 대조 중", verdict: "DISCUSSING" },
  { label: "상충 주장 검출", state: "최종 판정 생성", verdict: "NEEDS_HUMAN" }
];

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

// Review Run Progressive Simulation
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let stepIndex = 0;
  window.setInterval(() => {
    stepIndex = (stepIndex + 1) % reviewSteps.length;
    const step = reviewSteps[stepIndex];
    if (stepLabel) {
      stepLabel.textContent = step.label;
    }
    if (runState) {
      runState.textContent = step.state;
    }
    if (verdict) {
      verdict.textContent = step.verdict;
    }
  }, 1250);
}
