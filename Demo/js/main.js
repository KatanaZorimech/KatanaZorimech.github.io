import { loadCards, pickRewardOptions, resolveCard } from "./cards.js";
import { loadEnemies, pickEncounter, createEnemyInstance } from "./enemies.js";
import { createCombat, syncPlayerHp } from "./combat.js";
import {
  createNewRun,
  makeRng,
  saveRun,
  loadRun,
  clearSave,
  restHeal,
} from "./state.js";
import { getCurrentNode, advanceNode } from "./map.js";
import { renderCombat, bindCombatHandlers } from "./ui/combat-ui.js";
import { renderMap } from "./ui/map-ui.js";
import {
  renderReward,
  renderRest,
  renderUpgradePicker,
} from "./ui/reward-ui.js";

const app = document.getElementById("app");

let run = null;
let combat = null;
let combatHandlers = null;
let rewardOptions = null;
let scene = "menu"; // menu | map | combat | reward | rest | upgrade | win | gameover

async function init() {
  await Promise.all([loadCards(), loadEnemies()]);
  showMenu();
}

function showMenu() {
  scene = "menu";
  combat = null;
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
    saveRun(run);
    showMap();
  });
  document.getElementById("btn-continue").addEventListener("click", () => {
    run = loadRun();
    if (!run) return showMenu();
    showMap();
  });
}

function showMap() {
  scene = "map";
  combat = null;
  if (run.completed) {
    showWin();
    return;
  }
  renderMap(app, run, {
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
  startCombat(node);
}

function startCombat(node) {
  const rng = makeRng(run);
  let enemyId;
  if (node.type === "boss") {
    enemyId = node.bossId;
  } else if (node.type === "elite") {
    enemyId = pickEncounter("elite", rng);
  } else {
    enemyId = pickEncounter("normal", rng);
  }
  const enemy = createEnemyInstance(enemyId);
  combat = createCombat(run, [enemy], rng);
  scene = "combat";
  refreshCombat();
}

function refreshCombat() {
  if (!combat) return;
  combatHandlers = bindCombatHandlers(combat, {
    refresh: () => refreshCombat(),
    onVictory: () => onCombatVictory(),
    onDefeat: () => onCombatDefeat(),
  });
  renderCombat(app, combat, combatHandlers);
}

function onCombatVictory() {
  syncPlayerHp(combat, run);
  const node = getCurrentNode(run);
  const isBoss = node?.type === "boss";
  combat = null;

  if (isBoss && run.floorIndex === 1) {
    // Final boss — advance then win
    advanceNode(run);
    run.completed = true;
    saveRun(run);
    showWin();
    return;
  }

  // Rewards after combat/elite/boss (floor1)
  const rng = makeRng(run);
  rewardOptions = pickRewardOptions(rng, 3);
  scene = "reward";
  renderReward(app, rewardOptions, {
    onPick(idx) {
      run.deck.push(rewardOptions[idx]);
      rewardOptions = null;
      finishNode();
    },
    onSkip() {
      rewardOptions = null;
      finishNode();
    },
  });
}

function finishNode() {
  advanceNode(run);
  saveRun(run);
  if (run.completed) {
    showWin();
    return;
  }
  showMap();
}

function onCombatDefeat() {
  combat = null;
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

function showWin() {
  scene = "win";
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
