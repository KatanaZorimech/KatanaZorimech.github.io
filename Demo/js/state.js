import { createCardInstance, getStarterDeckIds } from "./cards.js";
import { generateRunMap } from "./map.js";

const SAVE_KEY = "shadows_fall_run_v1";

export function createNewRun(seed = Date.now()) {
  const starter = getStarterDeckIds().map((id) => createCardInstance(id, false));
  return {
    seed,
    rngState: seed,
    hero: "小十一",
    maxHp: 70,
    hp: 70,
    gold: 0,
    deck: starter,
    map: generateRunMap(),
    floorIndex: 0,
    nodeIndex: 0,
    completed: false,
    scene: "map", // menu handled outside
  };
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
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
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
