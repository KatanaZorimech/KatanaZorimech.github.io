/**
 * Slay the Spire–style branching map (2 acts).
 * Nodes form a DAG by row; player picks among reachable next nodes.
 * Rest sites are placed so every start→boss path has a similar count.
 */

const NODE_LABELS = {
  combat: "遭遇",
  elite: "精英",
  rest: "威尔家的地下室",
  shop: "商店",
  boss: "Boss",
};

const REST_TARGET = 2; // desired rests per full path
const REST_MAX = 3; // soft cap per path

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Initial types — no rests; rests are assigned by balanceRests. */
function pickType(rng, row) {
  if (row === 0) return "combat";
  const r = rng();
  if (row >= 3 && r < 0.2) return "elite";
  if (r < 0.22) return "shop";
  return "combat";
}

function setNodeType(node, type) {
  node.type = type;
  node.label = type === "boss" ? node.label : NODE_LABELS[type];
  if (type !== "boss") {
    // keep boss label (夺心魔 / 维克那)
  }
  if (type === "rest" || type === "combat" || type === "elite" || type === "shop") {
    node.label = NODE_LABELS[type];
  }
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

function countRests(path) {
  return path.filter((n) => n.type === "rest").length;
}

function pathHas(path, node) {
  return path.some((n) => n.id === node.id);
}

/**
 * Place / trim rest sites so each start→boss path is near REST_TARGET.
 */
function balanceRests(rows) {
  const nodes = rows.flat();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = rows[0][0];

  const canBecomeRest = (n) =>
    n.row > 0 && n.type !== "boss" && n.type !== "elite";

  // Prefer mid/late rows for rest seeding
  const preferredRow = Math.max(2, rows.length - 3);

  // Seed: one rest on preferred row if possible (helps all lanes)
  const seedRow = rows[preferredRow] || rows[Math.floor(rows.length / 2)];
  if (seedRow) {
    for (const n of seedRow) {
      if (canBecomeRest(n)) {
        setNodeType(n, "rest");
        break;
      }
    }
  }

  // Add rests to short paths
  for (let iter = 0; iter < 50; iter++) {
    const paths = enumeratePaths(start, byId);
    const short = paths.filter((p) => countRests(p) < REST_TARGET);
    if (!short.length) break;

    let best = null;
    let bestScore = -Infinity;

    for (const n of nodes) {
      if (!canBecomeRest(n) || n.type === "rest") continue;

      let help = 0;
      let overshoot = 0;
      for (const path of paths) {
        if (!pathHas(path, n)) continue;
        const after = countRests(path) + 1;
        if (countRests(path) < REST_TARGET) help += 1;
        if (after > REST_MAX) overshoot += 1;
      }
      if (help === 0) continue;

      // Prefer later rows (camp before boss) and more helped short paths
      const rowBonus = n.row * 0.15;
      const score = help * 10 - overshoot * 6 + rowBonus;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best) break;
    setNodeType(best, "rest");
  }

  // Trim rests on paths that are too rich (without creating new shortfalls if possible)
  for (let iter = 0; iter < 40; iter++) {
    const paths = enumeratePaths(start, byId);
    const long = paths.filter((p) => countRests(p) > REST_MAX);
    if (!long.length) break;

    let best = null;
    let bestScore = -Infinity;

    for (const n of nodes) {
      if (n.type !== "rest") continue;

      let longHits = 0;
      let wouldShorten = 0;
      for (const path of paths) {
        if (!pathHas(path, n)) continue;
        if (countRests(path) > REST_MAX) longHits += 1;
        if (countRests(path) - 1 < REST_TARGET) wouldShorten += 1;
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

  // Final pass: if any path still has 0 rests, force one
  const paths = enumeratePaths(start, byId);
  for (const path of paths) {
    if (countRests(path) > 0) continue;
    const candidate = [...path]
      .reverse()
      .find((n) => canBecomeRest(n) && n.type !== "rest");
    if (candidate) setNodeType(candidate, "rest");
  }
}

function generateAct(actIndex, bossId, bossLabel, rng) {
  const contentRows = 7; // rows 0..6 content, row 7 boss
  const rows = [];

  for (let row = 0; row < contentRows; row++) {
    const count = row === 0 ? 1 : randInt(rng, 2, 4);
    const rowNodes = [];
    for (let col = 0; col < count; col++) {
      const type = pickType(rng, row);
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

  // Connect row i -> row i+1
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

  balanceRests(rows);

  return {
    index: actIndex,
    name: actIndex === 0 ? "霍金斯 · 实验室" : "倒挂世界",
    bossId,
    nodes: rows.flat(),
  };
}

export function generateRunMap(rng) {
  const act0 = generateAct(0, "mind_flayer", "夺心魔", rng);
  const act1 = generateAct(1, "vecna", "维克那", rng);
  return {
    acts: [act0, act1],
    version: 2,
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
