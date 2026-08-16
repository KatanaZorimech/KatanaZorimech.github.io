/** @typedef {{ op: string, n?: number, target?: string, id?: string }} Effect */

let cardDefs = null;
let starterDeckIds = [];

export async function loadCards() {
  const res = await fetch("./data/cards.json");
  const data = await res.json();
  cardDefs = Object.fromEntries(data.cards.map((c) => [c.id, c]));
  starterDeckIds = data.starterDeck.slice();
  return cardDefs;
}

export function getCardDef(id) {
  return cardDefs[id];
}

export function getAllCardIds() {
  return Object.keys(cardDefs);
}

export function getStarterDeckIds() {
  return starterDeckIds.slice();
}

export function createCardInstance(defId, upgraded = false) {
  const def = cardDefs[defId];
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return {
    uid: `${defId}_${Math.random().toString(36).slice(2, 9)}`,
    defId,
    upgraded: !!upgraded,
  };
}

export function resolveCard(instance) {
  const def = cardDefs[instance.defId];
  const upgraded = !!instance.upgraded;
  let cost = def.cost;
  if (upgraded && def.upgradeCost !== undefined) cost = def.upgradeCost;
  return {
    ...instance,
    name: def.name + (upgraded ? "+" : ""),
    type: def.type,
    rarity: def.rarity,
    cost,
    exhaust: def.exhaust,
    text: upgraded ? def.upgradeText : def.text,
    effects: upgraded ? def.upgradeEffects : def.effects,
    baseName: def.name,
  };
}

export function cardsByRarity(rarity) {
  return Object.values(cardDefs).filter((c) => c.rarity === rarity);
}

export function pickRewardOptions(rng, count = 3) {
  const starterIds = new Set([...new Set(starterDeckIds)]);
  const pool = [];
  for (const c of Object.values(cardDefs)) {
    if (starterIds.has(c.id)) continue;
    const weight = c.rarity === "common" ? 10 : c.rarity === "uncommon" ? 5 : 2;
    for (let i = 0; i < weight; i++) pool.push(c.id);
  }
  const picked = [];
  const used = new Set();
  let guard = 0;
  while (picked.length < count && pool.length && guard < 500) {
    guard += 1;
    const id = pool[Math.floor(rng() * pool.length)];
    if (used.has(id)) continue;
    used.add(id);
    picked.push(createCardInstance(id, false));
  }
  return picked;
}
