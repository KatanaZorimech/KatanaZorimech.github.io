let enemyDefs = null;
let encounters = null;

/** Weak → strong for map row bias */
export const POWER_ORDER = [
  "demo_pup",
  "controlled_will",
  "demo_hound",
  "shadow_vine",
];

export async function loadEnemies() {
  const res = await fetch("./data/enemies.json");
  const data = await res.json();
  enemyDefs = data.enemies;
  encounters = data.encounters;
  return enemyDefs;
}

export function getEnemyDef(id) {
  return enemyDefs[id];
}

export function getEncounters() {
  return encounters;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Fallback random draw (when node has no pre-assigned enemyId).
 */
export function pickEncounter(tier, rng, run) {
  if (tier === "boss" || tier === "bossFloor1" || tier === "bossFloor2") {
    return encounters.boss || encounters.bossFloor2 || "vecna";
  }

  const pool = encounters[tier];
  if (!pool || !pool.length) return null;

  if (!run.encounterBags) run.encounterBags = { normal: [], elite: [] };
  let bag = run.encounterBags[tier];

  if (!bag || bag.length === 0) {
    bag = shuffleInPlace(pool.slice(), rng);
    const last = run.lastEncounter?.[tier];
    if (last && bag.length > 1 && bag[bag.length - 1] === last) {
      bag.unshift(bag.pop());
    }
    run.encounterBags[tier] = bag;
  }

  const id = bag.pop();
  if (!run.lastEncounter) run.lastEncounter = {};
  run.lastEncounter[tier] = id;
  return id;
}

export function createEnemyInstance(defId) {
  const def = enemyDefs[defId];
  if (!def) throw new Error(`Unknown enemy: ${defId}`);
  const maxHp = Number(def.maxHp) || 50;
  return {
    id: defId,
    name: def.name,
    tier: def.tier,
    spriteKey: def.sprite || null,
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

function moveDef(enemy) {
  const key = enemy.phaseId || enemy.id;
  return enemyDefs[key];
}

export function peekMove(enemy) {
  const def = moveDef(enemy);
  return def.moves[enemy.moveIndex % def.moves.length];
}

export function advanceMove(enemy) {
  const def = moveDef(enemy);
  enemy.moveIndex = (enemy.moveIndex + 1) % def.moves.length;
}

export function intentLabel(move) {
  if (!move) return "?";
  switch (move.intent) {
    case "attack":
      return `攻 ${move.damage}`;
    case "attack_debuff":
      return `攻 ${move.damage} · 减益`;
    case "defend":
      return `防 ${move.block}`;
    case "buff":
      return "强化";
    case "charge":
      return `蓄力 · 防 ${move.block || 0}`;
    default:
      return move.name;
  }
}

/**
 * Assign enemies to combat/elite nodes: lower rows weaker, even frequency.
 */
export function assignEncountersToRows(rows, rng) {
  if (!encounters) return;
  const normalPool = (encounters.normal || []).slice();
  const elitePool = (encounters.elite || []).slice();

  const combatNodes = [];
  const eliteNodes = [];
  for (const row of rows) {
    for (const n of row) {
      if (n.type === "combat") combatNodes.push(n);
      else if (n.type === "elite") eliteNodes.push(n);
    }
  }

  assignWithRowBias(combatNodes, normalPool, rng);
  assignWithRowBias(eliteNodes, elitePool, rng);
}

function assignWithRowBias(nodes, pool, rng) {
  if (!nodes.length || !pool.length) return;
  nodes.sort((a, b) => a.row - b.row || a.col - b.col);

  const counts = Object.fromEntries(pool.map((id) => [id, 0]));
  const maxRow = Math.max(...nodes.map((n) => n.row), 1);

  for (const node of nodes) {
    const t = node.row / maxRow;
    // Prefer weaker early, stronger late
    let preferred;
    if (pool.length === 1) preferred = pool[0];
    else if (t < 0.4) preferred = pool[0];
    else if (t > 0.6) preferred = pool[pool.length - 1];
    else preferred = pool[Math.floor(rng() * pool.length)];

    const minCount = Math.min(...pool.map((id) => counts[id]));
    const underused = pool.filter((id) => counts[id] === minCount);

    let pick;
    if (underused.includes(preferred)) pick = preferred;
    else if (counts[preferred] <= minCount + 1 && rng() < 0.55) pick = preferred;
    else pick = underused[Math.floor(rng() * underused.length)];

    node.enemyId = pick;
    counts[pick] += 1;
  }
}
