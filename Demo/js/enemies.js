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

export function pickEncounter(tier, rng) {
  if (tier === "bossFloor1") return encounters.bossFloor1;
  if (tier === "bossFloor2") return encounters.bossFloor2;
  const list = encounters[tier];
  return list[Math.floor(rng() * list.length)];
}

export function createEnemyInstance(defId) {
  const def = enemyDefs[defId];
  return {
    id: defId,
    name: def.name,
    tier: def.tier,
    maxHp: def.maxHp,
    hp: def.maxHp,
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
