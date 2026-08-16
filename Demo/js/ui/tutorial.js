const TUTORIAL_KEY = "shadows_fall_tutorial_v1";

const STEPS = [
  {
    title: "欢迎来到战斗",
    body: "这是你的第一场战斗。右侧敌人会显示本回合意图；左侧是小十一的生命与格挡。",
    highlight: "[data-fighter=\"player\"]",
  },
  {
    title: "能量",
    body: "每回合开始获得能量。出牌会消耗能量；能量不足的牌无法使用。",
    highlight: ".energy",
  },
  {
    title: "攻击牌",
    body: "攻击牌需要指定目标：按住牌，拖到右侧敌人头像框上再松开。",
    highlight: ".hand",
  },
  {
    title: "技能牌",
    body: "技能牌（如心灵屏障）通常不需要目标，直接点击即可使用。",
    highlight: ".hand",
  },
  {
    title: "牌堆",
    body: "屏幕最上方可查看抽牌堆、弃牌堆与消耗牌堆。打出的牌一般进弃牌堆；标有「消耗」的牌会移出本场战斗。",
    highlight: ".piles",
  },
  {
    title: "结束回合",
    body: "手牌打完或想过牌时，点「结束回合」。敌人会按意图行动，然后你再抽牌。",
    highlight: ".btn-end",
  },
];

let active = null;

export function shouldShowTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) !== "1";
  } catch (_) {
    return true;
  }
}

export function markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch (_) {
    /* ignore */
  }
}

/**
 * Mount a step-by-step overlay (on document.body so combat re-renders keep it).
 * Returns true if tutorial is / was shown.
 */
export function mountCombatTutorial(combatRoot, { onDone } = {}) {
  if (!shouldShowTutorial()) return false;
  if (active) {
    active.combatRoot = combatRoot;
    active.refreshHighlight();
    return true;
  }

  let step = 0;
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "新手指引");

  const panel = document.createElement("div");
  panel.className = "tutorial-panel";

  const titleEl = document.createElement("h3");
  titleEl.className = "tutorial-title";

  const bodyEl = document.createElement("p");
  bodyEl.className = "tutorial-body";

  const progress = document.createElement("p");
  progress.className = "tutorial-progress";

  const actions = document.createElement("div");
  actions.className = "tutorial-actions";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "btn btn-ghost";
  skipBtn.textContent = "跳过";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn";
  nextBtn.textContent = "下一步";

  actions.appendChild(skipBtn);
  actions.appendChild(nextBtn);
  panel.appendChild(titleEl);
  panel.appendChild(bodyEl);
  panel.appendChild(progress);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const clearHighlight = () => {
    document.querySelectorAll(".tutorial-highlight").forEach((n) => {
      n.classList.remove("tutorial-highlight");
    });
  };

  const refreshHighlight = () => {
    clearHighlight();
    const s = STEPS[step];
    const root = active?.combatRoot || combatRoot;
    const target = root?.querySelector?.(s.highlight);
    if (target) target.classList.add("tutorial-highlight");
  };

  const finish = () => {
    clearHighlight();
    markTutorialDone();
    overlay.remove();
    active = null;
    onDone?.();
  };

  const renderStep = () => {
    const s = STEPS[step];
    titleEl.textContent = s.title;
    bodyEl.textContent = s.body;
    progress.textContent = `${step + 1} / ${STEPS.length}`;
    nextBtn.textContent = step === STEPS.length - 1 ? "开始战斗" : "下一步";
    refreshHighlight();
  };

  skipBtn.addEventListener("click", finish);
  nextBtn.addEventListener("click", () => {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    step += 1;
    renderStep();
  });

  active = { combatRoot, refreshHighlight, finish };
  renderStep();
  return true;
}
