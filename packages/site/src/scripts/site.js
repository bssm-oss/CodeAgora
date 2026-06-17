const header = document.querySelector(".site-header");
const menuToggle = document.getElementById("menu-toggle");
const nav = document.getElementById("site-nav");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setMenu(open) {
  header?.classList.toggle("is-menu-open", open);
  menuToggle?.setAttribute("aria-expanded", String(open));
  menuToggle?.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
}

menuToggle?.addEventListener("click", () => {
  setMenu(!header?.classList.contains("is-menu-open"));
});

nav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    setMenu(false);
  }
});

document.addEventListener("click", (event) => {
  if (!header?.classList.contains("is-menu-open")) return;
  if (event.target instanceof Node && header.contains(event.target)) return;
  setMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
  }
});

const progress = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const value = scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0;
  document.documentElement.style.setProperty("--scroll-progress", `${value.toFixed(2)}%`);
  header?.classList.toggle("is-scrolled", window.scrollY > 18);
};

window.addEventListener("scroll", progress, { passive: true });
window.addEventListener("resize", progress, { passive: true });
progress();

const revealTargets = [
  ...document.querySelectorAll(".section-shell"),
  ...document.querySelectorAll(".plain-grid article, .step-grid article, .surface-grid article, .trust-row article, .faq-grid details")
];

for (const target of revealTargets) {
  target.classList.add("reveal");
}

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });

  for (const target of revealTargets) {
    revealObserver.observe(target);
  }
} else {
  for (const target of revealTargets) {
    target.classList.add("is-visible");
  }
}

const navLinks = [...document.querySelectorAll(".nav-links a[href^='#']")];
const navTargets = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);

function syncNav() {
  let current = "";
  let distance = Number.POSITIVE_INFINITY;
  for (const target of navTargets) {
    const next = Math.abs(target.getBoundingClientRect().top - window.innerHeight * 0.28);
    if (next < distance) {
      distance = next;
      current = target.id;
    }
  }
  for (const link of navLinks) {
    link.classList.toggle("is-current", Boolean(current) && link.getAttribute("href") === `#${current}`);
  }
}

window.addEventListener("scroll", syncNav, { passive: true });
window.addEventListener("resize", syncNav, { passive: true });
syncNav();

const commandTabs = [...document.querySelectorAll("[data-command-tab]")];
const commandPanels = [...document.querySelectorAll("[data-command-panel]")];

function activateCommand(target) {
  for (const tab of commandTabs) {
    const active = tab.dataset.commandTab === target;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.setAttribute("tabindex", active ? "0" : "-1");
  }
  for (const panel of commandPanels) {
    panel.hidden = panel.dataset.commandPanel !== target;
  }
}

for (const tab of commandTabs) {
  tab.addEventListener("click", () => activateCommand(tab.dataset.commandTab));
  tab.addEventListener("keydown", (event) => {
    const index = commandTabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : index;
    if (nextIndex === index) return;
    event.preventDefault();
    const next = commandTabs[(nextIndex + commandTabs.length) % commandTabs.length];
    next.focus();
    activateCommand(next.dataset.commandTab);
  });
}

activateCommand(commandTabs.find((tab) => tab.classList.contains("active"))?.dataset.commandTab ?? "cli");

const reviewTabs = [...document.querySelectorAll("[data-review-tab]")];
const reviewPanels = [...document.querySelectorAll("[data-review-panel]")];

function activateReviewStep(target) {
  for (const tab of reviewTabs) {
    const active = tab.dataset.reviewTab === target;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.setAttribute("tabindex", active ? "0" : "-1");
  }
  for (const panel of reviewPanels) {
    panel.hidden = panel.dataset.reviewPanel !== target;
  }
}

for (const tab of reviewTabs) {
  tab.addEventListener("click", () => activateReviewStep(tab.dataset.reviewTab));
  tab.addEventListener("keydown", (event) => {
    const index = reviewTabs.indexOf(tab);
    const nextIndex = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? index + 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? index - 1
        : index;
    if (nextIndex === index) return;
    event.preventDefault();
    const next = reviewTabs[(nextIndex + reviewTabs.length) % reviewTabs.length];
    next.focus();
    activateReviewStep(next.dataset.reviewTab);
  });
}

if (reviewTabs.length > 0) {
  activateReviewStep(reviewTabs.find((tab) => tab.classList.contains("active"))?.dataset.reviewTab ?? reviewTabs[0].dataset.reviewTab);
}

const heroPanel = document.querySelector(".hero-panel");

if (heroPanel && !reduceMotion) {
  heroPanel.addEventListener("pointermove", (event) => {
    const rect = heroPanel.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    heroPanel.style.setProperty("--tilt-x", `${((x - 0.5) * 7).toFixed(2)}deg`);
    heroPanel.style.setProperty("--tilt-y", `${((0.5 - y) * 6).toFixed(2)}deg`);
    heroPanel.style.setProperty("--glow-x", `${(x * 100).toFixed(1)}%`);
    heroPanel.style.setProperty("--glow-y", `${(y * 100).toFixed(1)}%`);
  });

  heroPanel.addEventListener("pointerleave", () => {
    heroPanel.style.setProperty("--tilt-x", "0deg");
    heroPanel.style.setProperty("--tilt-y", "0deg");
    heroPanel.style.setProperty("--glow-x", "50%");
    heroPanel.style.setProperty("--glow-y", "50%");
  });
}

const agentCards = [...document.querySelectorAll(".agent-lanes article")];

if (agentCards.length > 0 && !reduceMotion) {
  let activeAgentIndex = 0;
  agentCards[activeAgentIndex].classList.add("is-live");
  window.setInterval(() => {
    agentCards[activeAgentIndex].classList.remove("is-live");
    activeAgentIndex = (activeAgentIndex + 1) % agentCards.length;
    agentCards[activeAgentIndex].classList.add("is-live");
  }, 1700);
}

for (const button of document.querySelectorAll("[data-copy-target]")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.getAttribute("data-copy-target"));
    const text = target?.textContent?.trim() ?? "";
    if (!text || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    const previous = button.textContent;
    button.textContent = "복사됨";
    setTimeout(() => {
      button.textContent = previous;
    }, 1200);
  });
}
