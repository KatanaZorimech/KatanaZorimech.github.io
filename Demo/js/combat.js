import { resolveCard } from "./cards.js";
import { peekMove, advanceMove, intentLabel } from "./enemies.js";

const HAND_LIMIT = 10;
const DRAW_PER_TURN = 5;
const BASE_ENERGY = 3;

function statusAmt(unit, id) {
  if (!unit || !unit.statuses) return 0;
  return Number(unit.statuses[id]) || 0;
}

function addStatus(unit, id, n) {
  if (!unit.statuses) unit.statuses = {};
  unit.statuses[id] = (Number(unit.statuses[id]) || 0) + n;
}

function tickStatuses(unit) {
  for (const key of ["vulnerable", "weak"]) {
    if (unit.statuses[key]) {
      unit.statuses[key] -= 1;
      if (unit.statuses[key] <= 0) delete unit.statuses[key];
    }
  }
}

function pushAnim(combat, who, kind) {
  if (!combat.anims) combat.anims = [];
  combat.anims.push({ who, kind });
}

function whoFor(combat, unit) {
  if (unit === combat.player) return "player";
  const idx = combat.enemies.indexOf(unit);
  return idx >= 0 ? `enemy${idx}` : null;
}

export function calcAttackDamage(base, attacker, defender) {
  let dmg = base + statusAmt(attacker, "strength");
  if (statusAmt(attacker, "weak") > 0) dmg = Math.floor(dmg * 0.75);
  if (statusAmt(defender, "vulnerable") > 0) dmg = Math.floor(dmg * 1.5);
  return Math.max(0, dmg);
}

function ensureCombatStats(combat) {
  if (!combat.stats) {
    combat.stats = {
      damageDealt: 0,
      damageTaken: 0,
      cardsPlayed: 0,
    };
  }
  return combat.stats;
}

function recordHpLoss(combat, target, hpLost, source) {
  if (!combat || !hpLost) return;
  const stats = ensureCombatStats(combat);
  if (target === combat.player) {
    stats.damageTaken += hpLost;
  } else if (source === "player" || source === "thorns") {
    stats.damageDealt += hpLost;
  }
}

function applyDamage(target, amount, combat, source) {
  let dmg = amount;
  if (target.block > 0) {
    const blocked = Math.min(target.block, dmg);
    target.block -= blocked;
    dmg -= blocked;
  }
  if (dmg > 0) {
    const before = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    const lost = before - target.hp;
    if (lost > 0) {
      recordHpLoss(combat, target, lost, source);
      const who = whoFor(combat, target);
      if (who) {
        pushAnim(combat, who, "hit");
        if (target.hp <= 0) pushAnim(combat, who, "die");
      }
    }
  }
  // 反弹：被敌人攻击时触发（即使格挡完全挡住也要反弹）
  if (
    target === combat.player &&
    source === "enemy" &&
    combat.player.thorns > 0 &&
    combat._thornSource &&
    amount > 0
  ) {
    const enemy = combat._thornSource;
    let td = combat.player.thorns;
    if (statusAmt(enemy, "vulnerable") > 0) td = Math.floor(td * 1.5);
    if (enemy.block > 0) {
      const blocked = Math.min(enemy.block, td);
      enemy.block -= blocked;
      td -= blocked;
    }
    if (td > 0) {
      const eb = enemy.hp;
      enemy.hp = Math.max(0, enemy.hp - td);
      const thornLost = eb - enemy.hp;
      recordHpLoss(combat, enemy, thornLost, "thorns");
      combat.log.push(`反弹造成 ${td} 点伤害`);
      if (thornLost > 0) {
        const eWho = whoFor(combat, enemy);
        if (eWho) {
          pushAnim(combat, eWho, "hit");
          if (enemy.hp <= 0) pushAnim(combat, eWho, "die");
        }
        checkBossTransform(combat, enemy);
      }
    }
  }
  return amount;
}

function applyHpLoss(target, amount, combat) {
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  const lost = before - target.hp;
  if (combat && lost > 0) {
    recordHpLoss(combat, target, lost, "self");
    const who = whoFor(combat, target);
    if (who) {
      pushAnim(combat, who, "hit");
      if (target.hp <= 0) pushAnim(combat, who, "die");
    }
  }
}

function dealAttackToEnemy(combat, base, enemy) {
  if (!enemy.statuses) enemy.statuses = {};
  if (combat.player.strength) {
    combat.player.statuses.strength = combat.player.strength;
  }
  const dmg = calcAttackDamage(base, combat.player, enemy);
  const vuln = statusAmt(enemy, "vulnerable") > 0;
  applyDamage(enemy, dmg, combat, "player");
  combat.log.push(
    `造成 ${dmg} 点伤害 → ${enemy.name}${vuln ? "（易伤）" : ""}`
  );
  checkBossTransform(combat, enemy);
  return dmg;
}

/** 维克那血量过半时变身为夺心魔，并休息一回合 */
function checkBossTransform(combat, enemy) {
  if (!enemy || enemy.transformed) return;
  if (enemy.id !== "vecna") return;
  if (enemy.hp > enemy.maxHp * 0.5) return;

  // 过量击杀仍进入二阶段
  if (enemy.hp <= 0) {
    enemy.hp = Math.max(1, Math.ceil(enemy.maxHp * 0.45));
  }

  enemy.transformed = true;
  enemy.phaseId = "mind_flayer";
  enemy.name = "夺心魔";
  enemy.spriteKey = "mind_flayer";
  enemy.moveIndex = 0;
  enemy.stunnedTurns = 1;
  enemy.intent = {
    id: "reform",
    name: "重塑身躯",
    intent: "stun",
  };
  const who = whoFor(combat, enemy);
  if (who) pushAnim(combat, who, "transform");
  combat.log.push("维克那的身形扭曲崩解——夺心魔自暗影中显现！");
  combat.log.push("夺心魔正在凝实形体，下一回合无法行动。");
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createCombat(playerRun, enemies, rng) {
  const deck = playerRun.deck.map((c) => ({ ...c }));
  shuffle(deck, rng);
  const combat = {
    rng,
    phase: "player",
    player: {
      maxHp: playerRun.maxHp,
      hp: playerRun.hp,
      block: 0,
      energy: BASE_ENERGY,
      maxEnergy: BASE_ENERGY,
      strength: 0,
      statuses: {},
      thorns: 0,
      deck,
      hand: [],
      discard: [],
      exhaust: [],
    },
    enemies: enemies.map((e) => {
      const inst = { ...e, statuses: { ...e.statuses }, intent: null };
      inst.intent = peekMove(inst);
      return inst;
    }),
    log: ["战斗开始"],
    pendingRetrieve: null,
    drawPerTurn: DRAW_PER_TURN,
    anims: [],
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      cardsPlayed: 0,
    },
  };
  drawCards(combat, DRAW_PER_TURN);
  return combat;
}

function drawCards(combat, n) {
  for (let i = 0; i < n; i++) {
    if (combat.player.hand.length >= HAND_LIMIT) break;
    if (!combat.player.deck.length) {
      if (!combat.player.discard.length) break;
      combat.player.deck = shuffle(combat.player.discard.splice(0), combat.rng);
      combat.log.push("洗牌");
    }
    if (!combat.player.deck.length) break;
    combat.player.hand.push(combat.player.deck.pop());
  }
}

export function getPlayCost(cardInst) {
  const card = resolveCard(cardInst);
  if (card.cost === "X") return 0;
  return card.cost;
}

export function canPlayCard(combat, handIndex) {
  if (combat.phase !== "player") return false;
  const inst = combat.player.hand[handIndex];
  if (!inst) return false;
  const card = resolveCard(inst);
  if (card.cost === "X") return combat.player.energy >= 0;
  return combat.player.energy >= card.cost;
}

export function needsTarget(cardInst) {
  const card = resolveCard(cardInst);
  return card.effects.some(
    (e) =>
      e.op === "damage" ||
      e.op === "damage_x_times" ||
      (e.op === "status" && e.target === "enemy")
  );
}

export function playCard(combat, handIndex, enemyIndex = 0) {
  if (!canPlayCard(combat, handIndex)) return { ok: false, error: "无法打出" };
  const inst = combat.player.hand[handIndex];
  const card = resolveCard(inst);
  const enemy = combat.enemies[enemyIndex];

  let energySpent = 0;
  if (card.cost === "X") {
    energySpent = combat.player.energy;
    combat.player.energy = 0;
  } else {
    energySpent = card.cost;
    combat.player.energy -= card.cost;
  }

  combat.player.hand.splice(handIndex, 1);
  ensureCombatStats(combat).cardsPlayed += 1;
  combat.log.push(`打出 ${card.name}`);

  if (combat.player.strength) {
    combat.player.statuses.strength = combat.player.strength;
  }

  const dealsDamage = card.effects.some(
    (e) => e.op === "damage" || e.op === "damage_x_times"
  );
  pushAnim(combat, "player", dealsDamage ? "attack" : "cast");

  let needRetrieve = false;

  const effectOrder = (op) => {
    if (op === "status" || op === "gain_strength" || op === "thorns") return 0;
    if (op === "damage" || op === "damage_x_times") return 1;
    return 2;
  };
  const effects = [...card.effects].sort(
    (a, b) => effectOrder(a.op) - effectOrder(b.op)
  );

  for (const effect of effects) {
    switch (effect.op) {
      case "damage": {
        if (!enemy || enemy.hp <= 0) break;
        dealAttackToEnemy(combat, effect.n, enemy);
        break;
      }
      case "damage_x_times": {
        if (!enemy || enemy.hp <= 0) break;
        const times = energySpent;
        for (let t = 0; t < times; t++) {
          if (enemy.hp <= 0) break;
          dealAttackToEnemy(combat, effect.n, enemy);
        }
        break;
      }
      case "block":
        combat.player.block += effect.n;
        combat.log.push(`获得 ${effect.n} 点格挡`);
        break;
      case "status": {
        const target = effect.target === "enemy" ? enemy : combat.player;
        if (!target) break;
        addStatus(target, effect.id, effect.n);
        combat.log.push(
          `${target.name || "你"} 获得 ${effect.n} 层${statusName(effect.id)}`
        );
        break;
      }
      case "draw":
        drawCards(combat, effect.n);
        combat.log.push(`抽 ${effect.n} 张牌`);
        break;
      case "heal": {
        const before = combat.player.hp;
        combat.player.hp = Math.min(
          combat.player.maxHp,
          combat.player.hp + effect.n
        );
        combat.log.push(`回复 ${combat.player.hp - before} 点生命`);
        break;
      }
      case "lose_hp":
        applyHpLoss(combat.player, effect.n, combat);
        combat.log.push(`失去 ${effect.n} 点生命`);
        break;
      case "gain_energy":
        combat.player.energy += effect.n;
        combat.log.push(`获得 ${effect.n} 点能量`);
        break;
      case "gain_strength":
        combat.player.strength += effect.n;
        combat.player.statuses.strength = combat.player.strength;
        combat.log.push(`力量 +${effect.n}`);
        break;
      case "thorns":
        combat.player.thorns += effect.n;
        combat.log.push(`反弹 ${effect.n}`);
        break;
      case "retrieve_discard":
        if (combat.player.discard.length === 0) {
          combat.log.push("弃牌堆为空");
        } else {
          needRetrieve = true;
          combat.phase = "await_retrieve";
          combat.pendingRetrieve = { cardInst: inst, exhaust: card.exhaust };
        }
        break;
      default:
        break;
    }
  }

  if (!needRetrieve) {
    if (card.exhaust) {
      combat.player.exhaust.push(inst);
    } else {
      combat.player.discard.push(inst);
    }
  }

  checkCombatEnd(combat);
  return { ok: true, needRetrieve };
}

export function completeRetrieve(combat, discardIndex) {
  if (combat.phase !== "await_retrieve") return { ok: false };
  const pending = combat.pendingRetrieve;
  const card = combat.player.discard.splice(discardIndex, 1)[0];
  if (!card) return { ok: false, error: "无效选择" };
  if (combat.player.hand.length < HAND_LIMIT) {
    combat.player.hand.push(card);
  } else {
    combat.player.discard.push(card);
    combat.log.push("手牌已满，牌进入弃牌堆");
  }
  if (pending.exhaust) {
    combat.player.exhaust.push(pending.cardInst);
  } else {
    combat.player.discard.push(pending.cardInst);
  }
  combat.pendingRetrieve = null;
  combat.phase = "player";
  combat.log.push("从弃牌堆取回一张牌");
  checkCombatEnd(combat);
  return { ok: true };
}

function statusName(id) {
  return { vulnerable: "易伤", weak: "虚弱", strength: "力量" }[id] || id;
}

export function endPlayerTurn(combat) {
  if (combat.phase !== "player") return;
  while (combat.player.hand.length) {
    combat.player.discard.push(combat.player.hand.pop());
  }
  tickStatuses(combat.player);
  combat.phase = "enemy";
  runEnemyTurn(combat);
}

function runEnemyTurn(combat) {
  for (let ei = 0; ei < combat.enemies.length; ei++) {
    const enemy = combat.enemies[ei];
    if (enemy.hp <= 0) continue;
    enemy.block = 0;

    if (enemy.stunnedTurns > 0) {
      combat.log.push(`${enemy.name}：重塑身躯（休息）`);
      pushAnim(combat, `enemy${ei}`, "cast");
      enemy.stunnedTurns -= 1;
      enemy.intent = peekMove(enemy);
      tickStatuses(enemy);
      if (combat.player.hp <= 0) {
        combat.phase = "lost";
        combat.log.push("你倒下了…");
        return;
      }
      continue;
    }

    const move = peekMove(enemy);
    combat.log.push(`${enemy.name}：${move.name}`);

    const isAttack = !!move.damage;
    const isCast = !isAttack && (!!move.block || !!move.selfStatus || !!move.status);
    if (isAttack) pushAnim(combat, `enemy${ei}`, "attack");
    else if (isCast) pushAnim(combat, `enemy${ei}`, "cast");

    if (move.damage) {
      let dmg = move.damage + statusAmt(enemy, "strength");
      if (statusAmt(enemy, "weak") > 0) dmg = Math.floor(dmg * 0.75);
      if (statusAmt(combat.player, "vulnerable") > 0) dmg = Math.floor(dmg * 1.5);
      combat._thornSource = enemy;
      applyDamage(combat.player, dmg, combat, "enemy");
      combat._thornSource = null;
      combat.log.push(`你受到 ${dmg} 点伤害`);
      if (enemy.hp <= 0) {
        combat.log.push(`${enemy.name} 被反弹击倒`);
      }
    }
    if (move.block) {
      enemy.block += move.block;
    }
    if (move.status && move.status.target === "player") {
      addStatus(combat.player, move.status.id, move.status.n);
      combat.log.push(`你获得 ${move.status.n} 层${statusName(move.status.id)}`);
    }
    if (move.selfStatus) {
      addStatus(enemy, move.selfStatus.id, move.selfStatus.n);
      combat.log.push(
        `${enemy.name} 获得 ${move.selfStatus.n} 层${statusName(move.selfStatus.id)}`
      );
    }

    advanceMove(enemy);
    enemy.intent = peekMove(enemy);
    tickStatuses(enemy);

    if (combat.player.hp <= 0) {
      combat.phase = "lost";
      combat.log.push("你倒下了…");
      return;
    }
    if (combat.enemies.every((e) => e.hp <= 0)) {
      combat.phase = "won";
      combat.log.push("胜利！");
      return;
    }
  }

  combat.player.block = 0;
  combat.player.thorns = 0;
  combat.player.energy = combat.player.maxEnergy;
  if (combat.player.strength) {
    combat.player.statuses.strength = combat.player.strength;
  }
  drawCards(combat, combat.drawPerTurn);
  combat.phase = "player";
  combat.log.push("—— 你的回合 ——");
  checkCombatEnd(combat);
}

function checkCombatEnd(combat) {
  if (combat.player.hp <= 0) {
    combat.phase = "lost";
    return;
  }
  if (combat.enemies.every((e) => e.hp <= 0)) {
    combat.phase = "won";
    combat.log.push("胜利！");
  }
}

export function syncPlayerHp(combat, run) {
  run.hp = combat.player.hp;
}

export function getIntentDisplay(enemy) {
  const move = enemy.intent || peekMove(enemy);
  return { move, label: intentLabel(move) };
}

export { BASE_ENERGY, DRAW_PER_TURN, HAND_LIMIT };
