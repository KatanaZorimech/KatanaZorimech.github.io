/**
 * Elite/Boss balance verification — planned-play win-rate sim.
 *
 * Goal: with deliberate card play, elite & boss win rate in [80%, 100%].
 *
 * Usage (from repo root or Demo/):
 *   node Demo/scripts/balance-sim.mjs
 *   node Demo/scripts/balance-sim.mjs --runs 200
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(__dirname, "..");

const HAND_LIMIT = 10;
const DRAW_PER_TURN = 5;
const BASE_ENERGY = 3;
const MAX_TURNS = 80;
const TARGET_MIN = 0.8;
const TARGET_MAX = 1.0;

function parseArgs(argv) {
  let runs = 150;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs" && argv[i + 1]) runs = Number(argv[++i]);
  }
  return { runs: Number.isFinite(runs) && runs > 0 ? runs : 150 };
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(DEMO_ROOT, rel), "utf8"));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function statusAmt(unit, id) {
  return Number(unit?.statuses?.[id]) || 0;
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

function calcAttackDamage(base, attacker, defender) {
  let dmg = base + statusAmt(attacker, "strength");
  if (statusAmt(attacker, "weak") > 0) dmg = Math.floor(dmg * 0.75);
  if (statusAmt(defender, "vulnerable") > 0) dmg = Math.floor(dmg * 1.5);
  return Math.max(0, dmg);
}

function applyDamage(target, amount) {
  let dmg = amount;
  if (target.block > 0) {
    const blocked = Math.min(target.block, dmg);
    target.block -= blocked;
    dmg -= blocked;
  }
  if (dmg > 0) target.hp = Math.max(0, target.hp - dmg);
  return amount;
}

function resolveCard(defs, inst) {
  const def = defs[inst.defId];
  const upgraded = !!inst.upgraded;
  let cost = def.cost;
  if (upgraded && def.upgradeCost !== undefined) cost = def.upgradeCost;
  return {
    ...inst,
    name: def.name,
    type: def.type,
    cost,
    exhaust: def.exhaust,
    effects: upgraded ? def.upgradeEffects : def.effects,
  };
}

function peekMove(enemyDefs, enemy) {
  const key = enemy.phaseId || enemy.id;
  const def = enemyDefs[key];
  return def.moves[enemy.moveIndex % def.moves.length];
}

function advanceMove(enemyDefs, enemy) {
  const key = enemy.phaseId || enemy.id;
  const def = enemyDefs[key];
  enemy.moveIndex = (enemy.moveIndex + 1) % def.moves.length;
}

function createEnemy(enemyDefs, id) {
  const def = enemyDefs[id];
  const maxHp = Number(def.maxHp) || 50;
  return {
    id,
    name: def.name,
    tier: def.tier,
    maxHp,
    hp: maxHp,
    block: 0,
    statuses: {},
    moveIndex: 0,
    intent: null,
    transformed: false,
    phaseId: null,
  };
}

function checkBossTransform(enemyDefs, enemy) {
  if (!enemy || enemy.hp <= 0) return;
  if (enemy.id !== "vecna" || enemy.transformed) return;
  if (enemy.hp > enemy.maxHp * 0.5) return;
  enemy.transformed = true;
  enemy.phaseId = "mind_flayer";
  enemy.name = enemyDefs.mind_flayer.name;
  enemy.moveIndex = 0;
}

function drawCards(combat, n) {
  for (let i = 0; i < n; i++) {
    if (combat.player.hand.length >= HAND_LIMIT) break;
    if (!combat.player.deck.length) {
      if (!combat.player.discard.length) break;
      combat.player.deck = shuffle(combat.player.discard.splice(0), combat.rng);
    }
    if (!combat.player.deck.length) break;
    combat.player.hand.push(combat.player.deck.pop());
  }
}

function createCombat(cardDefs, enemyDefs, deckIds, enemyId, rng, hp = 70, maxHp = 70) {
  const deck = deckIds.map((defId, i) => ({
    uid: `${defId}_${i}`,
    defId,
    upgraded: false,
  }));
  shuffle(deck, rng);
  const enemy = createEnemy(enemyDefs, enemyId);
  enemy.intent = peekMove(enemyDefs, enemy);
  const combat = {
    rng,
    phase: "player",
    turn: 1,
    cardDefs,
    enemyDefs,
    player: {
      maxHp,
      hp,
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
    enemies: [enemy],
  };
  drawCards(combat, DRAW_PER_TURN);
  return combat;
}

function canPlay(combat, handIndex) {
  if (combat.phase !== "player") return false;
  const inst = combat.player.hand[handIndex];
  if (!inst) return false;
  const card = resolveCard(combat.cardDefs, inst);
  if (card.cost === "X") return combat.player.energy >= 0;
  return combat.player.energy >= card.cost;
}

function playCard(combat, handIndex) {
  if (!canPlay(combat, handIndex)) return false;
  const inst = combat.player.hand[handIndex];
  const card = resolveCard(combat.cardDefs, inst);
  const enemy = combat.enemies[0];

  let energySpent = 0;
  if (card.cost === "X") {
    energySpent = combat.player.energy;
    combat.player.energy = 0;
  } else {
    energySpent = card.cost;
    combat.player.energy -= card.cost;
  }
  combat.player.hand.splice(handIndex, 1);
  if (combat.player.strength) {
    combat.player.statuses.strength = combat.player.strength;
  }

  const effects = [...card.effects].sort((a, b) => {
    const rank = (op) =>
      op === "status" || op === "gain_strength" || op === "thorns"
        ? 0
        : op === "damage" || op === "damage_x_times"
          ? 1
          : 2;
    return rank(a.op) - rank(b.op);
  });

  let needRetrieve = false;
  for (const effect of effects) {
    switch (effect.op) {
      case "damage":
        if (enemy?.hp > 0) {
          applyDamage(
            enemy,
            calcAttackDamage(effect.n, combat.player, enemy)
          );
          checkBossTransform(combat.enemyDefs, enemy);
        }
        break;
      case "damage_x_times":
        for (let t = 0; t < energySpent; t++) {
          if (!enemy || enemy.hp <= 0) break;
          applyDamage(
            enemy,
            calcAttackDamage(effect.n, combat.player, enemy)
          );
          checkBossTransform(combat.enemyDefs, enemy);
        }
        break;
      case "block":
        combat.player.block += effect.n;
        break;
      case "status": {
        const target = effect.target === "enemy" ? enemy : combat.player;
        if (target) addStatus(target, effect.id, effect.n);
        break;
      }
      case "draw":
        drawCards(combat, effect.n);
        break;
      case "heal":
        combat.player.hp = Math.min(
          combat.player.maxHp,
          combat.player.hp + effect.n
        );
        break;
      case "lose_hp":
        combat.player.hp = Math.max(0, combat.player.hp - effect.n);
        break;
      case "gain_energy":
        combat.player.energy += effect.n;
        break;
      case "gain_strength":
        combat.player.strength += effect.n;
        combat.player.statuses.strength = combat.player.strength;
        break;
      case "thorns":
        combat.player.thorns += effect.n;
        break;
      case "retrieve_discard":
        if (combat.player.discard.length) {
          // Planned: take highest-value discard (damage/block)
          let best = 0;
          let bestScore = -1;
          combat.player.discard.forEach((d, i) => {
            const c = resolveCard(combat.cardDefs, d);
            let s = 0;
            for (const e of c.effects) {
              if (e.op === "damage") s += e.n * 2;
              if (e.op === "block") s += e.n;
              if (e.op === "status") s += 4;
            }
            if (s > bestScore) {
              bestScore = s;
              best = i;
            }
          });
          const taken = combat.player.discard.splice(best, 1)[0];
          if (combat.player.hand.length < HAND_LIMIT) {
            combat.player.hand.push(taken);
          } else {
            combat.player.discard.push(taken);
          }
        }
        break;
      default:
        break;
    }
  }

  if (!needRetrieve) {
    if (card.exhaust) combat.player.exhaust.push(inst);
    else combat.player.discard.push(inst);
  }

  if (combat.player.hp <= 0) combat.phase = "lost";
  else if (combat.enemies.every((e) => e.hp <= 0)) combat.phase = "won";
  return true;
}

function incomingDamage(combat) {
  const enemy = combat.enemies.find((e) => e.hp > 0);
  if (!enemy) return 0;
  const move = peekMove(combat.enemyDefs, enemy);
  if (!move?.damage) return 0;
  let dmg = move.damage + statusAmt(enemy, "strength");
  if (statusAmt(enemy, "weak") > 0) dmg = Math.floor(dmg * 0.75);
  if (statusAmt(combat.player, "vulnerable") > 0) dmg = Math.floor(dmg * 1.5);
  return dmg;
}

function cardScore(combat, card, intentDmg) {
  const enemy = combat.enemies[0];
  let score = 0;
  const needBlock = Math.max(0, intentDmg - combat.player.block);
  const hpDanger = combat.player.hp <= intentDmg + 8;

  for (const e of card.effects) {
    if (e.op === "block") {
      score += e.n * (needBlock > 0 ? (hpDanger ? 3.2 : 2.2) : 0.35);
      if (needBlock > 0) score += Math.min(e.n, needBlock) * 1.5;
    }
    if (e.op === "damage") {
      const dmg = calcAttackDamage(e.n, combat.player, enemy);
      score += dmg * (needBlock > 6 && hpDanger ? 0.55 : 1.35);
    }
    if (e.op === "damage_x_times") {
      const times = Math.max(1, combat.player.energy);
      const dmg = calcAttackDamage(e.n, combat.player, enemy) * times;
      score += dmg * 1.2;
    }
    if (e.op === "status" && e.target === "enemy") {
      if (e.id === "vulnerable") score += 10 + e.n * 4;
      if (e.id === "weak") score += 8 + e.n * 3;
    }
    if (e.op === "gain_strength") score += 12 * e.n;
    if (e.op === "thorns") score += e.n * (intentDmg > 0 ? 2.5 : 1);
    if (e.op === "heal") score += e.n * (combat.player.hp < 40 ? 2.5 : 0.8);
    if (e.op === "draw") score += e.n * 3;
    if (e.op === "gain_energy") score += e.n * 6;
    if (e.op === "retrieve_discard") {
      score += combat.player.discard.length ? 7 : -20;
    }
  }

  // Prefer spending energy efficiently when safe
  if (card.cost !== "X" && typeof card.cost === "number") {
    score += (3 - card.cost) * 0.15;
  }
  return score;
}

/** Planned player: block into big hits, apply debuffs, then maximize damage. */
function plannedTurn(combat) {
  let guard = 0;
  while (combat.phase === "player" && guard++ < 40) {
    const intentDmg = incomingDamage(combat);
    let bestIdx = -1;
    let bestScore = -1e9;
    for (let i = 0; i < combat.player.hand.length; i++) {
      if (!canPlay(combat, i)) continue;
      const card = resolveCard(combat.cardDefs, combat.player.hand[i]);
      // Skip empty X-cost
      if (card.cost === "X" && combat.player.energy === 0) continue;
      const s = cardScore(combat, card, intentDmg);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore < 0.5) break;
    playCard(combat, bestIdx);
    if (combat.phase !== "player") return;
  }
}

function endPlayerTurn(combat) {
  if (combat.phase !== "player") return;
  while (combat.player.hand.length) {
    combat.player.discard.push(combat.player.hand.pop());
  }
  tickStatuses(combat.player);
  combat.phase = "enemy";

  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.block = 0;
    const move = peekMove(combat.enemyDefs, enemy);
    if (move.damage) {
      let dmg = move.damage + statusAmt(enemy, "strength");
      if (statusAmt(enemy, "weak") > 0) dmg = Math.floor(dmg * 0.75);
      if (statusAmt(combat.player, "vulnerable") > 0) {
        dmg = Math.floor(dmg * 1.5);
      }
      // thorns
      const amount = dmg;
      applyDamage(combat.player, dmg);
      if (combat.player.thorns > 0 && amount > 0) {
        let td = combat.player.thorns;
        if (statusAmt(enemy, "vulnerable") > 0) td = Math.floor(td * 1.5);
        applyDamage(enemy, td);
        checkBossTransform(combat.enemyDefs, enemy);
      }
    }
    if (move.block) enemy.block += move.block;
    if (move.status?.target === "player") {
      addStatus(combat.player, move.status.id, move.status.n);
    }
    if (move.selfStatus) {
      addStatus(enemy, move.selfStatus.id, move.selfStatus.n);
    }
    advanceMove(combat.enemyDefs, enemy);
    enemy.intent = peekMove(combat.enemyDefs, enemy);
    tickStatuses(enemy);

    if (combat.player.hp <= 0) {
      combat.phase = "lost";
      return;
    }
    if (combat.enemies.every((e) => e.hp <= 0)) {
      combat.phase = "won";
      return;
    }
  }

  combat.player.block = 0;
  combat.player.thorns = 0;
  combat.player.energy = combat.player.maxEnergy;
  if (combat.player.strength) {
    combat.player.statuses.strength = combat.player.strength;
  }
  drawCards(combat, DRAW_PER_TURN);
  combat.phase = "player";
  combat.turn += 1;
}

function simulateFight(cardDefs, enemyDefs, deck, enemyId, seed, hp = 70) {
  const rng = mulberry32(seed);
  const combat = createCombat(cardDefs, enemyDefs, deck, enemyId, rng, hp, 70);
  while (
    combat.phase !== "won" &&
    combat.phase !== "lost" &&
    combat.turn <= MAX_TURNS
  ) {
    plannedTurn(combat);
    if (combat.phase === "won" || combat.phase === "lost") break;
    endPlayerTurn(combat);
  }
  if (combat.phase !== "won" && combat.phase !== "lost") combat.phase = "lost";
  return {
    result: combat.phase,
    hp: combat.player.hp,
    enemyHp: combat.enemies[0]?.hp ?? 0,
    turns: combat.turn,
  };
}

function runSuite(name, cardDefs, enemyDefs, deck, enemyId, runs, hp = 70) {
  let wins = 0;
  let hpSum = 0;
  let turnSum = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateFight(cardDefs, enemyDefs, deck, enemyId, 1000 + i * 97, hp);
    if (r.result === "won") {
      wins += 1;
      hpSum += r.hp;
      turnSum += r.turns;
    }
  }
  const rate = wins / runs;
  return {
    name,
    enemyId,
    runs,
    wins,
    rate,
    avgHpOnWin: wins ? +(hpSum / wins).toFixed(1) : 0,
    avgTurnsOnWin: wins ? +(turnSum / wins).toFixed(1) : 0,
    ok: rate >= TARGET_MIN && rate <= TARGET_MAX,
  };
}

function main() {
  const { runs } = parseArgs(process.argv.slice(2));
  const cardsJson = loadJson("data/cards.json");
  const enemiesJson = loadJson("data/enemies.json");
  const cardDefs = Object.fromEntries(cardsJson.cards.map((c) => [c.id, c]));
  const enemyDefs = enemiesJson.enemies;
  const starter = cardsJson.starterDeck.slice();

  // Mid-act elite: starter + a few planned rewards (full HP after rest)
  const eliteDeck = [
    ...starter,
    "full_power",
    "deep_breath",
    "slingshot",
  ];

  // Boss: denser planned deck after an act of rewards/upgrades
  const bossDeck = [
    ...starter,
    "full_power",
    "full_power",
    "slingshot",
    "deep_breath",
    "rage_burst",
    "radio_call",
    "psychic_ward",
    "first_aid",
  ];

  const suites = [
    runSuite("精英·魔犬（规划牌组）", cardDefs, enemyDefs, eliteDeck, "demo_hound", runs),
    runSuite("精英·藤蔓（规划牌组）", cardDefs, enemyDefs, eliteDeck, "shadow_vine", runs),
    runSuite("Boss·维克那（规划牌组）", cardDefs, enemyDefs, bossDeck, "vecna", runs),
    // Sanity: starter-only vs elites should still be mostly winnable with good play
    runSuite("精英·魔犬（仅初始牌）", cardDefs, enemyDefs, starter, "demo_hound", runs),
    runSuite("精英·藤蔓（仅初始牌）", cardDefs, enemyDefs, starter, "shadow_vine", runs),
  ];

  console.log(`\n暗影降临 · 精英/Boss 胜率验证（规划出牌 AI，每组 ${runs} 场）`);
  console.log(`目标区间：${(TARGET_MIN * 100) | 0}% – ${(TARGET_MAX * 100) | 0}%\n`);
  console.log(
    "场景".padEnd(22) +
      "胜率".padStart(8) +
      "胜场".padStart(10) +
      "均剩HP".padStart(10) +
      "均回合".padStart(8) +
      "  结果"
  );
  console.log("-".repeat(70));

  let failed = 0;
  for (const s of suites) {
    const pct = `${(s.rate * 100).toFixed(1)}%`;
    const mark = s.ok ? "PASS" : "FAIL";
    if (!s.ok) failed += 1;
    console.log(
      s.name.padEnd(22) +
        pct.padStart(8) +
        `${s.wins}/${s.runs}`.padStart(10) +
        String(s.avgHpOnWin).padStart(10) +
        String(s.avgTurnsOnWin).padStart(8) +
        `  ${mark}`
    );
  }

  // Primary gate: the three “planned mid/late deck” suites
  const primary = suites.slice(0, 3);
  const primaryFail = primary.filter((s) => !s.ok);
  console.log("");
  if (primaryFail.length) {
    console.error(
      `未达标：${primaryFail.map((s) => s.name).join("、")}（需落在 ${TARGET_MIN * 100}-${TARGET_MAX * 100}%）`
    );
    process.exitCode = 1;
  } else {
    console.log("主目标（精英×2 + Boss）全部达标。");
  }
}

main();
