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

export function pickRewardOptions(rng, count = 3, opts = {}) {
  const upgraded = !!opts.upgraded;
  const avoid = new Set(opts.avoidIds || []);
  const starterIds = new Set([...new Set(starterDeckIds)]);

  const candidates = [];
  for (const c of Object.values(cardDefs)) {
    if (starterIds.has(c.id)) continue;
    candidates.push(c.id);
  }

  const weightOf = (id) => {
    const r = cardDefs[id].rarity;
    return r === "common" ? 10 : r === "uncommon" ? 5 : 2;
  };

  function drawFrom(ids, n, already) {
    const pool = [];
    for (const id of ids) {
      if (already.has(id)) continue;
      const w = weightOf(id);
      for (let i = 0; i < w; i++) pool.push(id);
    }
    const out = [];
    let guard = 0;
    while (out.length < n && pool.length && guard < 800) {
      guard += 1;
      const id = pool[Math.floor(rng() * pool.length)];
      if (already.has(id)) continue;
      already.add(id);
      out.push(id);
    }
    return out;
  }

  const pickedIds = [];
  const used = new Set();
  const fresh = candidates.filter((id) => !avoid.has(id));
  pickedIds.push(...drawFrom(fresh, count, used));
  if (pickedIds.length < count) {
    pickedIds.push(...drawFrom(candidates, count - pickedIds.length, used));
  }

  return pickedIds.map((id) => createCardInstance(id, upgraded));
}

/** Record reward/shop offers so future picks prefer unseen cards. */
export function noteSeenRewardIds(run, cardInstances) {
  if (!run.seenRewardIds) run.seenRewardIds = [];
  const seen = new Set(run.seenRewardIds);
  for (const inst of cardInstances || []) {
    if (inst?.defId && !seen.has(inst.defId)) {
      seen.add(inst.defId);
      run.seenRewardIds.push(inst.defId);
    }
  }
}
