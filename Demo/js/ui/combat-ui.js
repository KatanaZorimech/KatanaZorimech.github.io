import { resolveCard } from "../cards.js";
import {
  canPlayCard,
  needsTarget,
  playCard,
  endPlayerTurn,
  completeRetrieve,
  getIntentDisplay,
  calcAttackDamage,
} from "../combat.js";

const STATUS_LABEL = {
  vulnerable: "易伤",
  weak: "虚弱",
  strength: "力量",
};

export function renderCombat(root, combat, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-combat";
  if (combat.player.strength) {
    combat.player.statuses.strength = combat.player.strength;
  } else {
    delete combat.player.statuses.strength;
  }

  const arena = el("div", "combat-arena");
  arena.appendChild(renderPlayer(combat));

  const enemiesCol = el("div", "enemies-col");
  combat.enemies.forEach((enemy, idx) => {
    enemiesCol.appendChild(renderEnemy(enemy, idx, combat, handlers));
  });
  arena.appendChild(enemiesCol);

  const piles = el("div", "piles");
  piles.appendChild(
    pileButton("抽牌堆", combat.player.deck.length, () =>
      handlers.onViewPile("deck")
    )
  );
  piles.appendChild(
    pileButton("弃牌堆", combat.player.discard.length, () =>
      handlers.onViewPile("discard")
    )
  );
  piles.appendChild(
    pileButton("消耗", combat.player.exhaust.length, () =>
      handlers.onViewPile("exhaust")
    )
  );

  const hand = el("div", "hand");
  combat.player.hand.forEach((inst, idx) => {
    hand.appendChild(renderCard(inst, idx, combat, handlers));
  });

  const actions = el("div", "combat-actions");
  const endBtn = el("button", "btn btn-end");
  endBtn.textContent = "结束回合";
  endBtn.disabled = combat.phase !== "player";
  endBtn.addEventListener("click", () => handlers.onEndTurn());
  actions.appendChild(endBtn);

  const log = el("div", "combat-log");
  log.innerHTML = combat.log
    .slice(-8)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");

  root.appendChild(arena);
  root.appendChild(piles);
  root.appendChild(hand);
  root.appendChild(actions);
  root.appendChild(log);

  if (combat.phase === "await_retrieve") {
    root.appendChild(renderRetrieveModal(combat, handlers));
  }

  if (combat.phase === "won" || combat.phase === "lost") {
    const overlay = el("div", "combat-result");
    overlay.innerHTML = `<p>${combat.phase === "won" ? "胜利" : "失败"}</p>`;
    const btn = el("button", "btn");
    btn.textContent = combat.phase === "won" ? "继续" : "返回标题";
    btn.addEventListener("click", () =>
      combat.phase === "won" ? handlers.onVictory() : handlers.onDefeat()
    );
    overlay.appendChild(btn);
    root.appendChild(overlay);
  }
}

function pileButton(label, count, onClick) {
  const btn = el("button", "pile-btn");
  btn.type = "button";
  btn.innerHTML = `<span class="pile-label">${label}</span><span class="pile-count">${count}</span>`;
  btn.addEventListener("click", onClick);
  return btn;
}

export function renderPileModal(combat, pileKey, onClose) {
  const titles = {
    deck: "抽牌堆",
    discard: "弃牌堆",
    exhaust: "消耗牌堆",
  };
  const notes = {
    deck: "顺序已打乱显示（与尖塔相同）",
    discard: "按弃牌顺序排列",
    exhaust: "本场战斗已消耗的牌",
  };

  let cards = (combat.player[pileKey] || []).slice();
  if (pileKey === "deck") {
    // Visual shuffle only — does not mutate combat state
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  const modal = el("div", "modal");
  const box = el("div", "modal-box pile-modal");
  box.innerHTML = `
    <h3>${titles[pileKey] || "牌堆"}（${cards.length}）</h3>
    <p class="pile-note">${notes[pileKey] || ""}</p>
  `;

  const list = el("div", "pile-card-grid");
  if (!cards.length) {
    const empty = el("p", "pile-empty");
    empty.textContent = "空";
    list.appendChild(empty);
  } else {
    cards.forEach((inst) => {
      const c = resolveCard(inst);
      const div = el("div", `card compact rarity-${c.rarity}`);
      div.innerHTML = `
        <span class="card-name">${escapeHtml(c.name)}</span>
        <span class="card-type">${typeLabel(c.type)} · 费用 ${c.cost === "X" ? "X" : c.cost}</span>
        <span class="card-text">${escapeHtml(c.text)}</span>
      `;
      list.appendChild(div);
    });
  }
  box.appendChild(list);

  const close = el("button", "btn");
  close.textContent = "关闭";
  close.addEventListener("click", onClose);
  box.appendChild(close);

  modal.appendChild(box);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) onClose();
  });
  return modal;
}

function renderEnemy(enemy, idx, combat, handlers) {
  const card = el("div", `fighter-card enemy-card ${enemy.hp <= 0 ? "dead" : ""}`);
  const intent = getIntentDisplay(enemy);
  const statuses = formatStatuses(enemy.statuses);

  card.innerHTML = `
    <div class="intent" title="${escapeHtml(intent.move?.name || "")}">${escapeHtml(intent.label)}</div>
    <div class="enemy-name">${escapeHtml(enemy.name)}</div>
    <div class="hp-bar"><div class="hp-fill" style="width:${(enemy.hp / enemy.maxHp) * 100}%"></div></div>
    <div class="hp-text">${enemy.hp}/${enemy.maxHp}${enemy.block ? ` · 格挡 ${enemy.block}` : ""}</div>
    <div class="statuses">${statuses}</div>
  `;

  if (combat.phase === "player" && enemy.hp > 0) {
    card.classList.add("targetable");
    card.addEventListener("click", () => handlers.onSelectEnemy?.(idx));
  }
  return card;
}

function renderPlayer(combat) {
  const p = combat.player;
  const card = el("div", "fighter-card player-card");
  const statuses = formatStatuses(p.statuses);
  const thorns = p.thorns ? ` · 反弹 ${p.thorns}` : "";
  card.innerHTML = `
    <div class="fighter-tag">你</div>
    <div class="player-name">小十一</div>
    <div class="hp-bar"><div class="hp-fill player" style="width:${(p.hp / p.maxHp) * 100}%"></div></div>
    <div class="hp-text">${p.hp}/${p.maxHp}${p.block ? ` · 格挡 ${p.block}` : ""}${thorns}</div>
    <div class="energy">能量 ${p.energy}/${p.maxEnergy}</div>
    <div class="statuses">${statuses}</div>
  `;
  return card;
}

function renderCard(inst, idx, combat, handlers) {
  const card = resolveCard(inst);
  const playable = canPlayCard(combat, idx);
  const node = el(
    "button",
    `card rarity-${card.rarity} type-${card.type}${playable ? " playable" : " muted"}`
  );
  const costLabel = card.cost === "X" ? "X" : String(card.cost);
  node.innerHTML = `
    <span class="card-cost">${costLabel}</span>
    <span class="card-name">${escapeHtml(card.name)}</span>
    <span class="card-type">${typeLabel(card.type)}</span>
    <span class="card-text">${escapeHtml(card.text)}</span>
  `;
  node.disabled = !playable;
  node.addEventListener("click", () => {
    if (!playable) return;
    handlers.onPlayCard(idx);
  });

  if (
    card.type === "attack" ||
    card.effects.some((e) => e.op === "damage" || e.op === "damage_x_times")
  ) {
    const enemy = combat.enemies.find((e) => e.hp > 0);
    if (enemy) {
      const dmgEff = card.effects.find(
        (e) => e.op === "damage" || e.op === "damage_x_times"
      );
      if (dmgEff) {
        const preview = calcAttackDamage(dmgEff.n, combat.player, enemy);
        node.title = `预估伤害: ${preview}${dmgEff.op === "damage_x_times" ? " × 能量" : ""}`;
      }
    }
  }
  return node;
}

function renderRetrieveModal(combat, handlers) {
  const modal = el("div", "modal");
  const box = el("div", "modal-box");
  box.innerHTML = "<h3>选择一张弃牌收回手牌</h3>";
  const list = el("div", "retrieve-list");
  combat.player.discard.forEach((inst, idx) => {
    const c = resolveCard(inst);
    const btn = el("button", "card compact");
    btn.innerHTML = `<span class="card-name">${escapeHtml(c.name)}</span><span class="card-text">${escapeHtml(c.text)}</span>`;
    btn.addEventListener("click", () => handlers.onRetrieve(idx));
    list.appendChild(btn);
  });
  box.appendChild(list);
  modal.appendChild(box);
  return modal;
}

function formatStatuses(statuses) {
  return Object.entries(statuses || {})
    .map(([k, v]) => `${STATUS_LABEL[k] || k}${v}`)
    .join(" ");
}

function typeLabel(t) {
  return { attack: "攻击", skill: "技能", power: "能力" }[t] || t;
}

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bindCombatHandlers(combat, callbacks) {
  let selectedEnemy = 0;

  return {
    onSelectEnemy(idx) {
      selectedEnemy = idx;
    },
    onPlayCard(handIndex) {
      const inst = combat.player.hand[handIndex];
      const target = needsTarget(inst) ? selectedEnemy : 0;
      if (needsTarget(inst)) {
        if (!combat.enemies[target] || combat.enemies[target].hp <= 0) {
          selectedEnemy = combat.enemies.findIndex((e) => e.hp > 0);
        }
      }
      const result = playCard(combat, handIndex, selectedEnemy);
      if (result.ok) callbacks.refresh();
    },
    onEndTurn() {
      endPlayerTurn(combat);
      callbacks.refresh();
    },
    onRetrieve(discardIndex) {
      completeRetrieve(combat, discardIndex);
      callbacks.refresh();
    },
    onViewPile(pileKey) {
      callbacks.onViewPile?.(pileKey);
    },
    onVictory: callbacks.onVictory,
    onDefeat: callbacks.onDefeat,
  };
}
