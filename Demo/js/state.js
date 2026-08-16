import { createCardInstance, getStarterDeckIds } from "./cards.js";
import { generateRunMap } from "./map.js";

const SAVE_KEY = "shadows_fall_run_v2";

export function createNewRun(seed = Date.now()) {
  const starter = getStarterDeckIds().map((id) => createCardInstance(id, false));
  const run = {
    seed,
    rngState: seed >>> 0,
    hero: "小十一",
    maxHp: 70,
    hp: 70,
    waffles: 0,
    deck: starter,
    map: null,
    actIndex: 0,
    currentNodeId: null,
    awaitingPathChoice: false,
    visitedNodeIds: [],
    encounterBags: { normal: [], elite: [] },
    lastEncounter: {},
    combatCount: 0,
    seenRewardIds: [],
    completed: false,
  };
  // Build map with seeded rng
  const rng = makeRng(run);
  run.map = generateRunMap(rng);
  return run;
}

export function makeRng(run) {
  let state = run.rngState >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    run.rngState = state;
    return r;
  };
}

export function saveRun(run) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch (_) {
    /* ignore */
  }
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    if (!run.map || run.map.version !== 3 || !run.map.acts) return null;
    if (typeof run.waffles !== "number") run.waffles = 0;
    if (!run.encounterBags) run.encounterBags = { normal: [], elite: [] };
    if (!run.lastEncounter) run.lastEncounter = {};
    if (typeof run.combatCount !== "number") {
      run.combatCount = (run.visitedNodeIds || []).length > 0 ? 1 : 0;
    }
    if (!Array.isArray(run.seenRewardIds)) run.seenRewardIds = [];
    return run;
  } catch (_) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem("shadows_fall_run_v1");
  } catch (_) {
    /* ignore */
  }
}

export function healPlayer(run, amount) {
  run.hp = Math.min(run.maxHp, run.hp + amount);
}

export function restHeal(run) {
  const amount = Math.floor(run.maxHp * 0.3);
  healPlayer(run, amount);
  return amount;
}

/** Waffle drops by encounter tier */
export function waffleReward(tier, rng) {
  if (tier === "elite") return 28 + Math.floor(rng() * 13); // 28–40
  if (tier === "boss") return 45 + Math.floor(rng() * 16); // 45–60
  return 12 + Math.floor(rng() * 9); // 12–20
}

export const SHOP_PRICES = {
  common: 40,
  uncommon: 65,
  rare: 95,
};
