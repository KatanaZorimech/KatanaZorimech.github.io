/**
 * Slay the Spire?style branching map (2 acts).
 * Nodes form a DAG by row; player picks among reachable next nodes.
 * Target ~12 nodes per start?boss path.
 * Lower rows favor normals; upper rows favor elites.
 * Soft caps: ?4 elites and ?4 rests (???) per path.
 */

import { assignEncountersToRows } from "./enemies.js";

const NODE_LABELS = {
  combat: "??",
  elite: "??",
  rest: "???????",
  shop: "??",
  boss: "Boss",
};

const CONTENT_ROWS = 11; // rows 0..10 + boss ? path length 12
const REST_TARGET = 3;
const REST_MAX = 4;
const ELITE_MAX = 4;
const ELITE_TARGET = 3;

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Initial types ? no rests; rests assigned by balanceRests. */
function pickType(rng, row, contentRows) {
  if (row === 0) return "combat";
  const progress = row / Math.max(contentRows - 1, 1);
  const r = rng();
  // Bottom: mostly normals
  if (progress < 0.4) {
    if (r < 0.1) return "shop";
    return "combat";
  }
  // Mid: light elite / shop mix
  if (progress < 0.65) {
    if (r < 0.2) return "elite";
    if (r < 0.34) return "shop";
    return "combat";
  }
  // Top: elites more common (capped later per path)
  if (r < 0.48) return "elite";
  if (r < 0.6) return "shop";
  return "combat";
}

function setNodeType(node, type) {
  node.type = type;
  if (type === "boss") return;
  node.label = NODE_LABELS[type];
}

function enumeratePaths(start, byId) {
  const paths = [];
  function dfs(node, path) {
    const nextPath = path.concat(node);
    if (!node.next.length || node.type === "boss") {
      paths.push(nextPath);
      return;
    }
    for (const nid of node.next) {
      const nxt = byId.get(nid);
      if (nxt) dfs(nxt, nextPath);
    }
  }
  dfs(start, []);
  return paths;
}

function countType(path, type) {
  return path.filter((n) => n.type === type).length;
}

function pathHas(path, node) {
  return path.some((n) => n.id === node.id);
}

/**
 * Place / trim rest sites so each path is near REST_TARGET and ? REST_MAX.
 */
function balanceRests(rows) {
  const nodes = rows.flat();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = rows[0][0];

  const canBecomeRest = (n) =>
    n.row > 0 && n.type !== "boss" && n.type !== "elite";

  const preferredRow = Math.max(3, Math.floor(rows.length * 0.55));
  const seedRow = rows[preferredRow] || rows[Math.floor(rows.length / 2)];
  if (seedRow) {
    for (const n of seedRow) {
      if (canBecomeRest(n)) {
        setNodeType(n, "rest");
        break;
      }
    }
  }

  for (let iter = 0; iter < 60; iter++) {
    const paths = enumeratePaths(start, byId);
    const short = paths.filter((p) => countType(p, "rest") < REST_TARGET);
    if (!short.length) break;

    let best = null;
    let bestScore = -Infinity;

    for (const n of nodes) {
      if (!canBecomeRest(n) || n.type === "rest") continue;

      let help = 0;
      let overshoot = 0;
      for (const path of paths) {
        if (!pathHas(path, n)) continue;
        const after = countType(path, "rest") + 1;
        if (countType(path, "rest") < REST_TARGET) help += 1;
        if (after > REST_MAX) overshoot += 1;
      }
      if (help === 0) continue;

      const score = help * 10 - overshoot * 8 + n.row * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best) break;
    setNodeType(best, "rest");
  }

  for (let iter = 0; iter < 50; iter++) {
    const paths = enumeratePaths(start, byId);
    const long = paths.filter((p) => countType(p, "rest") > REST_MAX);
    if (!long.length) break;

    let best = null;
    let bestScore = -Infinity;

    for (const n of nodes) {
      if (n.type !== "rest") continue;

      let longHits = 0;
      let wouldShorten = 0;
      for (const path of paths) {
        if (!pathHas(path, n)) continue;
        if (countType(path, "rest") > REST_MAX) longHits += 1;
        if (countType(path, "rest") - 1 < REST_TARGET) wouldShorten += 1;
      }
      if (longHits === 0) continue;

      const score = longHits * 10 - wouldShorten * 12;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best || bestScore < 0) break;
    setNodeType(best, "combat");
  }

  // Hard cap: never allow > REST_MAX rests on any path
  for (let iter = 0; iter < 80; iter++) {
    const paths = enumeratePaths(start, byId);
    const long = paths.filter((p) => countType(p, "rest") > REST_MAX);
    if (!long.length) break;

    let best = null;
    let bestScore = -Infinity;
    for (const n of nodes) {
      if (n.type !== "rest") continue;
      let longHits = 0;
      for (const path of paths) {
        if (pathHas(path, n) && countType(path, "rest") > REST_MAX) longHits += 1;
      }
      if (!longHits) continue;
      const score = longHits * 10 - n.row * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (!best) break;
    setNodeType(best, "combat");
  }

  const paths = enumeratePaths(start, byId);
  for (const path of paths) {
    if (countType(path, "rest") > 0) continue;
    const candidate = [...path]
      .reverse()
      .find((n) => canBecomeRest(n) && n.type !== "rest");
    if (!candidate) continue;
    let overflow = false;
    for (const p of paths) {
      if (!pathHas(p, candidate)) continue;
      if (countType(p, "rest") + 1 > REST_MAX) {
        overflow = true;
        break;
      }
    }
    if (!overflow) setNodeType(candidate, "rest");
  }
}

/**
 * Keep elites upper-biased and ? ELITE_MAX per path.
 */
function balanceElites(rows) {
  const nodes = rows.flat();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = rows[0][0];
  const contentRows = rows.length - 1;
  const upperFrom = Math.floor(contentRows * 0.45);

  const canBecomeElite = (n) =>
    n.row >= upperFrom &&
    n.type !== "boss" &&
    n.type !== "rest" &&
    n.type !== "shop";

  for (const n of nodes) {
    if (n.type === "elite" && n.row < upperFrom) setNodeType(n, "combat");
  }

  for (let iter = 0; iter < 60; iter++) {
    const paths = enumeratePaths(start, byId);
    const long = paths.filter((p) => countType(p, "elite") > ELITE_MAX);
    if (!long.length) break;

    let best = null;
    let bestScore = -Infinity;

    for (const n of nodes) {
      if (n.type !== "elite") continue;
      let longHits = 0;
      for (const path of paths) {
        if (!pathHas(path, n)) continue;
        if (countType(path, "elite") > ELITE_MAX) longHits += 1;
      }
      if (longHits === 0) continue;
      const score = longHits * 10 - n.row * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best) break;
    setNodeType(best, "combat");
  }

  for (let iter = 0; iter < 50; iter++) {
    const paths = enumeratePaths(start, byId);
    const short = paths.filter((p) => countType(p, "elite") < ELITE_TARGET);
    if (!short.length) break;

    let best = null;
    let bestScore = -Infinity;

    for (const n of nodes) {
      if (!canBecomeElite(n) || n.type === "elite") continue;

      let help = 0;
      let overshoot = 0;
      for (const path of paths) {
        if (!pathHas(path, n)) continue;
        if (countType(path, "elite") < ELITE_TARGET) help += 1;
        if (countType(path, "elite") + 1 > ELITE_MAX) overshoot += 1;
      }
      if (help === 0 || overshoot > 0) continue;

      const score = help * 10 + n.row * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best) break;
    setNodeType(best, "elite");
  }
}

function generateAct(actIndex, bossId, bossLabel, rng) {
  const contentRows = CONTENT_ROWS;
  const rows = [];

  for (let row = 0; row < contentRows; row++) {
    const count = row === 0 ? 1 : randInt(rng, 2, 4);
    const rowNodes = [];
    for (let col = 0; col < count; col++) {
      const type = pickType(rng, row, contentRows);
      rowNodes.push({
        id: `a${actIndex}_r${row}_${col}`,
        row,
        col,
        type,
        label: NODE_LABELS[type],
        next: [],
      });
    }
    rows.push(rowNodes);
  }

  const boss = {
    id: `a${actIndex}_boss`,
    row: contentRows,
    col: 0,
    type: "boss",
    label: bossLabel,
    bossId,
    next: [],
  };
  rows.push([boss]);

  for (let r = 0; r < rows.length - 1; r++) {
    const cur = rows[r];
    const nxt = rows[r + 1];
    const parentsFor = nxt.map(() => []);

    for (let i = 0; i < cur.length; i++) {
      const from = cur[i];
      const ideal = (i / Math.max(cur.length - 1, 1)) * (nxt.length - 1);
      const primary = Math.round(ideal);
      const targets = new Set([primary]);
      if (nxt.length > 1 && rng() < 0.65) {
        const side = primary + (rng() < 0.5 ? -1 : 1);
        if (side >= 0 && side < nxt.length) targets.add(side);
      }
      if (nxt.length > 2 && rng() < 0.25) {
        targets.add(randInt(rng, 0, nxt.length - 1));
      }
      for (const t of targets) {
        from.next.push(nxt[t].id);
        parentsFor[t].push(from.id);
      }
    }

    for (let t = 0; t < nxt.length; t++) {
      if (parentsFor[t].length) continue;
      const ideal = (t / Math.max(nxt.length - 1, 1)) * (cur.length - 1);
      const p = Math.round(ideal);
      cur[p].next.push(nxt[t].id);
    }

    for (const node of cur) {
      node.next = [...new Set(node.next)];
    }
  }

  balanceElites(rows);
  balanceRests(rows);
  assignEncountersToRows(rows, rng);

  return {
    index: actIndex,
    name: actIndex === 0 ? "??? · ???" : "????",
    bossId,
    nodes: rows.flat(),
  };
}

export function generateRunMap(rng) {
  const act0 = generateAct(0, "vecna", "???", rng);
  const act1 = generateAct(1, "vecna", "???", rng);
  return {
    acts: [act0, act1],
    version: 3,
  };
}

export function getAct(run) {
  return run.map.acts[run.actIndex];
}

export function getNode(run, nodeId) {
  const act = getAct(run);
  return act.nodes.find((n) => n.id === nodeId) || null;
}

export function getCurrentNode(run) {
  if (!run.currentNodeId) return null;
  return getNode(run, run.currentNodeId);
}

export function getAvailableNodes(run) {
  const act = getAct(run);
  if (!act) return [];

  if (!run.currentNodeId) {
    return act.nodes.filter((n) => n.row === 0);
  }

  const cur = getNode(run, run.currentNodeId);
  if (!cur) return [];

  if (run.awaitingPathChoice) {
    return cur.next.map((id) => getNode(run, id)).filter(Boolean);
  }

  return [];
}

export function isNodeAvailable(run, nodeId) {
  return getAvailableNodes(run).some((n) => n.id === nodeId);
}

export function travelToNode(run, nodeId) {
  if (!isNodeAvailable(run, nodeId)) return false;
  run.currentNodeId = nodeId;
  run.awaitingPathChoice = false;
  if (!run.visitedNodeIds.includes(nodeId)) {
    run.visitedNodeIds.push(nodeId);
  }
  return true;
}

export function completeCurrentNode(run) {
  const cur = getCurrentNode(run);
  if (!cur) return { done: false };

  if (cur.type === "boss") {
    if (run.actIndex >= run.map.acts.length - 1) {
      run.completed = true;
      run.awaitingPathChoice = false;
      return { done: true, won: true };
    }
    run.actIndex += 1;
    run.currentNodeId = null;
    run.awaitingPathChoice = false;
    run.visitedNodeIds = [];
    return { done: true, nextAct: true };
  }

  if (!cur.next.length) {
    run.completed = true;
    return { done: true, won: true };
  }

  run.awaitingPathChoice = true;
  return { done: true };
}

export function isRunComplete(run) {
  return !!run.completed;
}

export { NODE_LABELS };
