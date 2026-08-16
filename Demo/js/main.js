import { loadCards, pickRewardOptions, resolveCard } from "./cards.js";
import { loadEnemies, pickEncounter, createEnemyInstance } from "./enemies.js";
import { loadSprites } from "./sprites.js";
import { createCombat, syncPlayerHp } from "./combat.js";
import {
  createNewRun,
  makeRng,
  saveRun,
  loadRun,
  clearSave,
  restHeal,
  waffleReward,
} from "./state.js";
import {
  getCurrentNode,
  travelToNode,
  completeCurrentNode,
} from "./map.js";
import {
  renderCombat,
  bindCombatHandlers,
  renderPileModal,
  playCombatAnims,
} from "./ui/combat-ui.js";
import { renderMap } from "./ui/map-ui.js";
import {
  renderReward,
  renderRest,
  renderUpgradePicker,
  renderShop,
  buildShopOffer,
} from "./ui/reward-ui.js";

import { initBgm, mountBgmToggle } from "./audio.js";
import { mountCombatTutorial } from "./ui/tutorial.js";
import { mountLandscapeGate } from "./mobile.js";

const app = document.getElementById("app");

let run = null;
let combat = null;
let combatHandlers = null;
let rewardOptions = null;
let lastWaffleGain = 0;
let shopOffer = null;
let scene = "menu";
let firstCombatPending = false;

async function init() {
  await Promise.all([loadCards(), loadEnemies(), loadSprites()]);
  initBgm();
  mountBgmToggle(document.body);
  mountLandscapeGate();
  showMenu();
}

function clearCombatChrome() {
  document.body.classList.remove("combat-touch-fit");
}

function showMenu() {
  scene = "menu";
  combat = null;
  clearCombatChrome();
  const hasSave = !!loadRun();
  app.innerHTML = `
    <section class="scene scene-menu">
      <div class="menu-glow" aria-hidden="true"></div>
      <p class="menu-eyebrow">Shadows Fall</p>
      <h1 class="menu-title">暗影降临</h1>
      <p class="menu-tagline">Hawkins 之外，倒挂世界的尖塔正在苏醒。以念力构筑牌组，直面夺心魔与维克那。</p>
      <div class="menu-actions">
        <button class="btn btn-primary" id="btn-new">开始旅程</button>
        <button class="btn" id="btn-continue" ${hasSave ? "" : "disabled"}>继续游戏</button>
      </div>
      <p class="menu-hero">扮演 · 小十一</p>
      <p class="menu-home"><a href="../">← 返回主站</a></p>
    </section>
  `;
  document.getElementById("btn-new").addEventListener("click", () => {
    clearSave();
    run = createNewRun();
    run.combatCount = 0;
    saveRun(run);
    showMap();
  });
  document.getElementById("btn-continue").addEventListener("click", () => {
    run = loadRun();
    if (!run) return showMenu();
    if (typeof run.combatCount !== "number") {
      run.combatCount = (run.visitedNodeIds || []).length > 0 ? 1 : 0;
    }
    showMap();
  });
}

function showMap() {
  scene = "map";
  combat = null;
  shopOffer = null;
  clearCombatChrome();
  if (run.completed) {
    showWin();
    return;
  }
  renderMap(app, run, {
    onSelectPath(node) {
      if (!travelToNode(run, node.id)) return;
      saveRun(run);
      enterNode(node);
    },
    onEnterNode(node) {
      enterNode(node);
    },
    onViewDeck() {
      showDeckOverlay();
    },
  });
  saveRun(run);
}

function showDeckOverlay() {
  const modal = document.createElement("div");
  modal.className = "modal";
  const box = document.createElement("div");
  box.className = "modal-box";
  box.innerHTML = "<h3>当前牌组</h3>";
  const list = document.createElement("div");
  list.className = "retrieve-list";
  run.deck.forEach((inst) => {
    const c = resolveCard(inst);
    const div = document.createElement("div");
    div.className = `card compact rarity-${c.rarity}`;
    div.innerHTML = `<span class="card-name">${c.name}</span><span class="card-text">${c.text}</span>`;
    list.appendChild(div);
  });
  box.appendChild(list);
  const close = document.createElement("button");
  close.className = "btn";
  close.textContent = "关闭";
  close.addEventListener("click", () => modal.remove());
  box.appendChild(close);
  modal.appendChild(box);
  app.appendChild(modal);
}

function enterNode(node) {
  if (node.type === "rest") {
    showRest();
    return;
  }
  if (node.type === "shop") {
    showShop();
    return;
  }
  startCombat(node);
}

function startCombat(node) {
  const rng = makeRng(run);
  let enemyId;
  if (node.type === "boss") {
    enemyId = node.bossId || "vecna";
  } else if (node.enemyId) {
    enemyId = node.enemyId;
  } else if (node.type === "elite") {
    enemyId = pickEncounter("elite", rng, run);
  } else {
    enemyId = pickEncounter("normal", rng, run);
  }
  const enemy = createEnemyInstance(enemyId);
  combat = createCombat(run, [enemy], rng);
  firstCombatPending = (run.combatCount || 0) === 0;
  run.combatCount = (run.combatCount || 0) + 1;
  scene = "combat";
  saveRun(run);
  refreshCombat();
}

function refreshCombat() {
  if (!combat) return;
  combatHandlers = bindCombatHandlers(combat, {
    refresh: () => refreshCombat(),
    onVictory: () => onCombatVictory(),
    onDefeat: () => onCombatDefeat(),
    onViewPile(pileKey) {
      const modal = renderPileModal(combat, pileKey, () => modal.remove());
      app.appendChild(modal);
    },
  });
  renderCombat(app, combat, combatHandlers);
  playCombatAnims(app, combat);
  if (firstCombatPending) {
    const shown = mountCombatTutorial(app, {
      onDone: () => {
        firstCombatPending = false;
      },
    });
    if (!shown) firstCombatPending = false;
  }
}

function onCombatVictory() {
  syncPlayerHp(combat, run);
  const node = getCurrentNode(run);
  const tier =
    node?.type === "boss" ? "boss" : node?.type === "elite" ? "elite" : "normal";
  combat = null;
  clearCombatChrome();

  const rng = makeRng(run);
  lastWaffleGain = waffleReward(tier, rng);
  run.waffles = (run.waffles || 0) + lastWaffleGain;

  // Final boss: still show rewards then complete
  rewardOptions = pickRewardOptions(rng, 3, { upgraded: tier === "elite" });
  scene = "reward";
  renderReward(
    app,
    rewardOptions,
    {
      onPick(idx) {
        run.deck.push(rewardOptions[idx]);
        rewardOptions = null;
        finishNode();
      },
      onSkip() {
        rewardOptions = null;
        finishNode();
      },
    },
    lastWaffleGain,
    { eliteUpgraded: tier === "elite" }
  );
  saveRun(run);
}

function finishNode() {
  const result = completeCurrentNode(run);
  saveRun(run);
  if (result.won || run.completed) {
    showWin();
    return;
  }
  showMap();
}

function onCombatDefeat() {
  combat = null;
  clearCombatChrome();
  clearSave();
  scene = "gameover";
  app.innerHTML = `
    <section class="scene scene-end">
      <h2>暗影将你吞没</h2>
      <p>小十一倒下了。Hawkins 仍在等待下一次反抗。</p>
      <button class="btn btn-primary" id="btn-again">返回标题</button>
    </section>
  `;
  document.getElementById("btn-again").addEventListener("click", showMenu);
}

function showRest() {
  scene = "rest";
  clearCombatChrome();
  renderRest(app, run, {
    onHeal() {
      restHeal(run);
      finishNode();
    },
    onUpgrade() {
      showUpgrade();
    },
  });
}

function showUpgrade() {
  scene = "upgrade";
  renderUpgradePicker(app, run.deck, {
    onPickUpgrade(idx) {
      run.deck[idx].upgraded = true;
      finishNode();
    },
    onBack() {
      showRest();
    },
  });
}

function showShop() {
  scene = "shop";
  clearCombatChrome();
  const rng = makeRng(run);
  shopOffer = buildShopOffer(rng, pickRewardOptions);
  refreshShop();
}

function refreshShop() {
  renderShop(app, run, shopOffer, {
    onBuy(idx) {
      const entry = shopOffer[idx];
      if (!entry || entry.sold) return;
      if (run.waffles < entry.price) return;
      run.waffles -= entry.price;
      run.deck.push(entry.card);
      entry.sold = true;
      saveRun(run);
      refreshShop();
    },
    onLeave() {
      shopOffer = null;
      finishNode();
    },
  });
}

function showWin() {
  scene = "win";
  clearCombatChrome();
  clearSave();
  app.innerHTML = `
    <section class="scene scene-end scene-win">
      <p class="menu-eyebrow">Shadows Fall</p>
      <h2>暗影退去</h2>
      <p>维克那倒下了。倒挂世界的尖塔暂时沉寂——你用一副牌组改写了结局。</p>
      <button class="btn btn-primary" id="btn-again">再来一局</button>
    </section>
  `;
  document.getElementById("btn-again").addEventListener("click", showMenu);
}

init().catch((err) => {
  app.innerHTML = `<section class="scene"><p>加载失败：${err.message}</p></section>`;
  console.error(err);
});
