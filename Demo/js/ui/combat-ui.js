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
import { getPlayerSprite, getEnemySprite } from "../sprites.js";
import { isTouchPlay } from "../mobile.js";

const STATUS_INFO = {
  vulnerable: {
    label: "易伤",
    tip: "易伤：受到的攻击伤害提高 50%。每回合结束层数 −1。",
  },
  weak: {
    label: "虚弱",
    tip: "虚弱：造成的攻击伤害降低 25%。每回合结束层数 −1。",
  },
  strength: {
    label: "力量",
    tip: "力量：每层使攻击伤害 +1。战斗中持续存在，不会自然衰减。",
  },
};

const STATUS_LABEL = {
  vulnerable: STATUS_INFO.vulnerable.label,
  weak: STATUS_INFO.weak.label,
  strength: STATUS_INFO.strength.label,
};

const ANIM_CLASSES = [
  "anim-attack",
  "anim-cast",
  "anim-hit",
  "anim-die",
  "anim-transform",
];

export function renderCombat(root, combat, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-combat";
  document.body.classList.remove("combat-touch-fit");
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

  const piles = el("div", "piles piles-top");
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

  const touch = isTouchPlay();
  if (touch) {
    root.classList.add("touch-play");
    document.body.classList.add("combat-touch-fit");
  }

  const hint = el("p", "combat-hint");
  hint.textContent = touch
    ? "攻击牌：点选后点敌人（仅一名敌人时可直接点牌） · 技能牌：点击使用"
    : "攻击牌：拖到敌人头像框释放 · 技能牌：点击使用";

  const hand = el("div", "hand");
  combat.player.hand.forEach((inst, idx) => {
    hand.appendChild(renderCard(inst, idx, combat, handlers, touch));
  });

  const actions = el("div", "combat-actions");
  const endBtn = el("button", "btn btn-end");
  endBtn.textContent = "结束回合";
  endBtn.disabled = combat.phase !== "player";
  endBtn.addEventListener("click", () => handlers.onEndTurn());
  actions.appendChild(endBtn);

  const log = el("div", "combat-log");
  log.innerHTML = combat.log
    .slice(-6)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");

  if (touch) {
    // Compact single-screen shell: top bar → arena → hand row
    const top = el("div", "combat-topbar");
    top.appendChild(piles);
    top.appendChild(actions);
    const stage = el("div", "combat-stage");
    stage.appendChild(arena);
    const dock = el("div", "combat-dock");
    dock.appendChild(hint);
    dock.appendChild(hand);
    root.appendChild(top);
    root.appendChild(stage);
    root.appendChild(dock);
    // log stays available in DOM for desktop parity but hidden via CSS on touch
    root.appendChild(log);
  } else {
    root.appendChild(piles);
    root.appendChild(arena);
    root.appendChild(hint);
    root.appendChild(hand);
    root.appendChild(actions);
    root.appendChild(log);
  }

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

  if (touch) {
    setupTouchTargeting(root, combat, handlers);
  } else {
    setupCardDragDrop(root, combat, handlers);
  }
}

/** Drain combat.anims and play CSS classes on sprite actors. */
export function playCombatAnims(root, combat) {
  const queue = (combat.anims || []).splice(0);
  if (!queue.length) return;

  queue.forEach((ev, i) => {
    window.setTimeout(() => {
      const stage = root.querySelector(`[data-fighter="${ev.who}"]`);
      const actor = stage?.querySelector(".sprite-actor");
      if (!actor) return;
      ANIM_CLASSES.forEach((c) => actor.classList.remove(c));
      actor.classList.remove("idle");
      void actor.offsetWidth;
      const cls = `anim-${ev.kind}`;
      actor.classList.add(cls);
      if (ev.kind === "die") {
        stage?.classList.add("is-dead");
        return;
      }
      const onEnd = () => {
        actor.classList.remove(cls);
        if (!stage?.classList.contains("is-dead")) {
          actor.classList.add("idle");
        }
        actor.removeEventListener("animationend", onEnd);
      };
      actor.addEventListener("animationend", onEnd);
    }, i * 70);
  });
}

function livingEnemyIndexes(combat) {
  return combat.enemies
    .map((e, i) => (e.hp > 0 ? i : -1))
    .filter((i) => i >= 0);
}

/** Mobile: tap attack card (auto-cast if one foe), or select then tap enemy. */
function setupTouchTargeting(root, combat, handlers) {
  if (combat.phase !== "player") return;

  let selected = null;

  const clearSelection = () => {
    selected = null;
    root.classList.remove("is-targeting");
    root.querySelectorAll(".card.card-selected").forEach((n) => {
      n.classList.remove("card-selected");
    });
  };

  const selectCard = (handIndex, node) => {
    clearSelection();
    selected = handIndex;
    node.classList.add("card-selected");
    root.classList.add("is-targeting");
  };

  root.querySelectorAll(".card[data-hand-index]").forEach((node) => {
    if (node.dataset.needsTarget !== "1") return;
    node.addEventListener("click", (e) => {
      e.preventDefault();
      if (node.disabled || combat.phase !== "player") return;
      const handIndex = Number(node.dataset.handIndex);
      const living = livingEnemyIndexes(combat);

      if (selected === handIndex) {
        clearSelection();
        return;
      }

      if (living.length === 1) {
        handlers.onPlayCard(handIndex, living[0]);
        return;
      }

      if (living.length === 0) return;
      selectCard(handIndex, node);
    });
  });

  root.querySelectorAll(".enemy-card.targetable").forEach((card) => {
    card.addEventListener("click", () => {
      if (selected == null || combat.phase !== "player") return;
      const idx = Number(card.dataset.enemyIndex);
      if (!combat.enemies[idx] || combat.enemies[idx].hp <= 0) return;
      const handIndex = selected;
      clearSelection();
      handlers.onPlayCard(handIndex, idx);
    });
  });
}

function setupCardDragDrop(root, combat, handlers) {
  if (combat.phase !== "player") return;

  let drag = null;
  let ghost = null;
  let listenersBound = false;

  const clearDropHighlight = () => {
    root.querySelectorAll(".enemy-card.drop-hover").forEach((n) => {
      n.classList.remove("drop-hover");
    });
  };

  const removeGhosts = () => {
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    // Mac 上偶发未收到 pointerup，扫掉残留幽灵
    document.querySelectorAll(".card-drag-ghost").forEach((n) => n.remove());
  };

  const unbindDocListeners = () => {
    if (!listenersBound) return;
    document.removeEventListener("pointermove", onDocPointerMove, true);
    document.removeEventListener("pointerup", onDocPointerUp, true);
    document.removeEventListener("pointercancel", onDocPointerUp, true);
    window.removeEventListener("blur", onBlurCancel);
    listenersBound = false;
  };

  const endDrag = () => {
    const node = drag?.node;
    const pointerId = drag?.pointerId;
    if (node && pointerId != null) {
      try {
        if (node.hasPointerCapture?.(pointerId)) {
          node.releasePointerCapture(pointerId);
        }
      } catch (_) {
        /* ignore */
      }
      node.removeEventListener("lostpointercapture", onLostCapture);
      node.classList.remove("dragging");
    }
    removeGhosts();
    drag = null;
    clearDropHighlight();
    root.classList.remove("is-dragging-attack");
    unbindDocListeners();
  };

  function onDocPointerMove(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    moveGhost(e.clientX, e.clientY);
    clearDropHighlight();
    const target = enemyAtPoint(root, e.clientX, e.clientY);
    if (target) target.classList.add("drop-hover");
  }

  function onDocPointerUp(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const target = enemyAtPoint(root, e.clientX, e.clientY);
    const idx = target ? Number(target.dataset.enemyIndex) : -1;
    const handIndex = drag.handIndex;
    endDrag();
    if (idx >= 0 && combat.enemies[idx] && combat.enemies[idx].hp > 0) {
      handlers.onPlayCard(handIndex, idx);
    }
  }

  function onLostCapture(e) {
    // Safari/Mac：capture 丢失时未必再有 pointerup。
    // 延后清理，避免抢在同帧 pointerup（成功投放）之前把 drag 清掉。
    const pointerId = e.pointerId;
    requestAnimationFrame(() => {
      if (drag && drag.pointerId === pointerId) endDrag();
    });
  }

  function onBlurCancel() {
    if (drag) endDrag();
  }

  function moveGhost(x, y) {
    if (!ghost) return;
    const w = ghost.offsetWidth || 0;
    const h = ghost.offsetHeight || 0;
    ghost.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(-4deg)`;
  }

  root.querySelectorAll(".card[data-hand-index]").forEach((node) => {
    if (node.dataset.needsTarget !== "1") return;

    node.addEventListener("dragstart", (e) => e.preventDefault());

    node.addEventListener("pointerdown", (e) => {
      if (node.disabled || combat.phase !== "player") return;
      if (e.button !== 0) return;
      // 避免未结束的拖拽叠出多个幽灵
      if (drag) endDrag();

      e.preventDefault();
      e.stopPropagation();

      const handIndex = Number(node.dataset.handIndex);
      drag = { handIndex, node, pointerId: e.pointerId };
      node.classList.add("dragging");
      root.classList.add("is-dragging-attack");

      try {
        node.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      node.addEventListener("lostpointercapture", onLostCapture);

      ghost = node.cloneNode(true);
      ghost.classList.remove("dragging");
      ghost.classList.add("card-drag-ghost");
      ghost.removeAttribute("data-hand-index");
      ghost.tabIndex = -1;
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.width = `${node.offsetWidth}px`;
      document.body.appendChild(ghost);
      moveGhost(e.clientX, e.clientY);

      if (!listenersBound) {
        document.addEventListener("pointermove", onDocPointerMove, true);
        document.addEventListener("pointerup", onDocPointerUp, true);
        document.addEventListener("pointercancel", onDocPointerUp, true);
        window.addEventListener("blur", onBlurCancel);
        listenersBound = true;
      }
    });
  });
}

function enemyAtPoint(root, x, y) {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    const card = el.closest?.(".enemy-card.targetable");
    if (card && root.contains(card)) return card;
  }
  return null;
}

function buildSpriteStage(who, spriteCfg, name, tier, dead) {
  const stage = el("div", `sprite-stage${dead ? " is-dead" : ""}`);
  stage.dataset.fighter = who;

  if (spriteCfg?.src) {
    const img = document.createElement("img");
    const wide = spriteCfg.wide ? " is-wide" : "";
    img.className = `sprite-actor battle-sprite${wide}${spriteCfg.idle !== false ? " idle" : ""}`;
    img.src = spriteCfg.src;
    img.alt = name;
    img.draggable = false;
    img.style.setProperty("--scale", String(spriteCfg.scale ?? 3));
    stage.appendChild(img);
  } else {
    const ph = el(
      "div",
      `sprite-actor sprite-placeholder tier-${tier || "normal"} idle`
    );
    ph.setAttribute("aria-hidden", "true");
    stage.appendChild(ph);
  }
  return stage;
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
  const card = el(
    "div",
    `fighter-card enemy-card ${enemy.hp <= 0 ? "dead" : ""}`
  );
  card.dataset.enemyIndex = String(idx);
  const intent = getIntentDisplay(enemy);
  const statuses = formatStatuses(enemy.statuses);
  const spriteCfg = getEnemySprite(enemy.spriteKey);

  card.appendChild(
    buildSpriteStage(
      `enemy${idx}`,
      spriteCfg,
      enemy.name,
      enemy.tier,
      enemy.hp <= 0
    )
  );

  const meta = el("div", "fighter-meta");
  const maxHp = Number(enemy.maxHp) || 1;
  const hp = Number.isFinite(Number(enemy.hp)) ? Number(enemy.hp) : maxHp;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const intentTip = intentTooltip(intent.move);
  meta.innerHTML = `
    <div class="intent status-tip" title="${escapeHtml(intentTip)}" data-tip="${escapeHtml(intentTip)}">${escapeHtml(intent.label)}</div>
    <div class="enemy-name">${escapeHtml(enemy.name)}</div>
    <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%"></div></div>
    <div class="hp-text">${hp}/${maxHp}${formatBlockChip(enemy.block)}</div>
    <div class="statuses">${statuses}</div>
  `;
  card.appendChild(meta);

  if (combat.phase === "player" && enemy.hp > 0) {
    card.classList.add("targetable");
  }
  return card;
}

function renderPlayer(combat) {
  const p = combat.player;
  const card = el("div", "fighter-card player-card");
  const statuses = formatStatuses(p.statuses);
  const spriteCfg = getPlayerSprite();

  card.appendChild(
    buildSpriteStage("player", spriteCfg, "小十一", "player", p.hp <= 0)
  );

  const meta = el("div", "fighter-meta");
  meta.innerHTML = `
    <div class="fighter-tag">你</div>
    <div class="player-name">小十一</div>
    <div class="hp-bar"><div class="hp-fill player" style="width:${(p.hp / p.maxHp) * 100}%"></div></div>
    <div class="hp-text">${p.hp}/${p.maxHp}${formatBlockChip(p.block)}${formatThornsChip(p.thorns)}</div>
    <div class="energy status-tip" title="能量：打出卡牌消耗能量。每回合开始回复至上限。" data-tip="能量：打出卡牌消耗能量。每回合开始回复至上限。">能量 ${p.energy}/${p.maxEnergy}</div>
    <div class="statuses">${statuses}</div>
  `;
  card.appendChild(meta);
  return card;
}

function renderCard(inst, idx, combat, handlers, touch = false) {
  const card = resolveCard(inst);
  const playable = canPlayCard(combat, idx);
  const targetNeeded = needsTarget(inst);
  const node = el(
    "button",
    `card rarity-${card.rarity} type-${card.type}${playable ? " playable" : " muted"}${targetNeeded ? " needs-target" : ""}`
  );
  node.dataset.handIndex = String(idx);
  node.dataset.needsTarget = targetNeeded ? "1" : "0";
  const costLabel = card.cost === "X" ? "X" : String(card.cost);
  const targetHint = targetNeeded
    ? touch
      ? " · 点选"
      : " · 拖拽"
    : "";
  node.innerHTML = `
    <span class="card-cost">${costLabel}</span>
    <span class="card-name">${escapeHtml(card.name)}</span>
    <span class="card-type">${typeLabel(card.type)}${targetHint}</span>
    <span class="card-text">${escapeHtml(card.text)}</span>
  `;
  node.disabled = !playable;

  // Non-targeted skills: click to play. Targeted: touch uses setupTouchTargeting; desktop drag.
  if (!targetNeeded) {
    node.addEventListener("click", () => {
      if (!playable) return;
      handlers.onPlayCard(idx);
    });
  } else if (touch) {
    node.title = "点击出牌；多名敌人时先点牌再点敌人";
  } else {
    node.title = "拖到敌人头像框释放";
  }

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
        const how = touch ? "点击" : "拖到敌人释放";
        node.title = `${how} · 预估伤害: ${preview}${dmgEff.op === "damage_x_times" ? " × 能量" : ""}`;
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
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => {
      const info = STATUS_INFO[k];
      const label = info?.label || STATUS_LABEL[k] || k;
      const tip = info?.tip || label;
      return `<span class="status-pill status-tip status-${escapeHtml(k)}" title="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}">${escapeHtml(label)}${v}</span>`;
    })
    .join("");
}

function formatBlockChip(block) {
  if (!block) return "";
  const tip = "格挡：抵消受到的伤害。你的格挡在回合结束时清空；敌人的格挡在其行动前清空。";
  return ` <span class="status-pill status-tip status-block" title="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}">格挡 ${block}</span>`;
}

function formatThornsChip(thorns) {
  if (!thorns) return "";
  const tip = "反弹：受到攻击时（含被完全格挡）对该敌人造成等量反弹伤害。回合结束时清空。";
  return ` <span class="status-pill status-tip status-thorns" title="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}">反弹 ${thorns}</span>`;
}

function intentTooltip(move) {
  if (!move) return "意图未知";
  const parts = [move.name || "行动"];
  if (move.damage) parts.push(`造成 ${move.damage} 点攻击伤害`);
  if (move.block) parts.push(`获得 ${move.block} 点格挡`);
  if (move.status?.id === "vulnerable") {
    parts.push(`给予易伤 ${move.status.n} 层`);
  } else if (move.status?.id === "weak") {
    parts.push(`给予虚弱 ${move.status.n} 层`);
  } else if (move.status) {
    parts.push(`施加状态 ${move.status.id}×${move.status.n}`);
  }
  if (move.selfStatus?.id === "strength") {
    parts.push(`自身力量 +${move.selfStatus.n}`);
  } else if (move.selfStatus) {
    parts.push(`自身获得 ${move.selfStatus.id}×${move.selfStatus.n}`);
  }
  if (move.intent === "charge") parts.push("蓄力防御，下回合可能放出重击");
  if (move.intent === "stun") parts.push("本回合无法行动");
  return parts.join("。") + "。";
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
  return {
    onPlayCard(handIndex, enemyIndex) {
      const inst = combat.player.hand[handIndex];
      if (!inst) return;
      let target = 0;
      if (needsTarget(inst)) {
        if (enemyIndex === undefined || enemyIndex < 0) return;
        target = enemyIndex;
        if (!combat.enemies[target] || combat.enemies[target].hp <= 0) return;
      }
      const result = playCard(combat, handIndex, target);
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
