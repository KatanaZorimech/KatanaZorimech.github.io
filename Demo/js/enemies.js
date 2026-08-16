let enemyDefs = null;
let encounters = null;

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

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Draw without replacement so each fight cycles through the pool evenly.
 * Avoids immediate repeat when the bag refills.
 */
export function pickEncounter(tier, rng, run) {
  if (tier === "bossFloor1") return encounters.bossFloor1;
  if (tier === "bossFloor2") return encounters.bossFloor2;

  const pool = encounters[tier];
  if (!pool || !pool.length) return null;

  if (!run.encounterBags) run.encounterBags = { normal: [], elite: [] };
  let bag = run.encounterBags[tier];

  if (!bag || bag.length === 0) {
    bag = shuffleInPlace(pool.slice(), rng);
    // If refill would start with the same enemy as last fight, rotate
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
  };
}

export function peekMove(enemy) {
  const def = enemyDefs[enemy.id];
  return def.moves[enemy.moveIndex % def.moves.length];
}

export function advanceMove(enemy) {
  const def = enemyDefs[enemy.id];
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
