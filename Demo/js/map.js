/**
 * Slay the Spire–style branching map (2 acts).
 * Nodes form a DAG by row; player picks among reachable next nodes.
 */

const NODE_LABELS = {
  combat: "遭遇",
  elite: "精英",
  rest: "威尔家的地下室",
  shop: "商店",
  boss: "Boss",
};

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickType(rng, row, totalRows) {
  // last content row before boss prefers rest/shop
  if (row === 0) return "combat";
  if (row === totalRows - 2) {
    return rng() < 0.55 ? "rest" : "elite";
  }
  const r = rng();
  if (row >= 3 && r < 0.18) return "elite";
  if (r < 0.22) return "rest";
  if (r < 0.38) return "shop";
  return "combat";
}

function generateAct(actIndex, bossId, bossLabel, rng) {
  const contentRows = 7; // rows 0..6 content, row 7 boss
  const rows = [];

  for (let row = 0; row < contentRows; row++) {
    const count = row === 0 ? 1 : randInt(rng, 2, 4);
    const rowNodes = [];
    for (let col = 0; col < count; col++) {
      const type = pickType(rng, row, contentRows + 1);
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
    // Ensure every next node has ≥1 parent
    const parentsFor = nxt.map(() => []);

    for (let i = 0; i < cur.length; i++) {
      const from = cur[i];
      // Map column proportionally into next row
      const ideal = (i / Math.max(cur.length - 1, 1)) * (nxt.length - 1);
      const primary = Math.round(ideal);
      const targets = new Set([primary]);
      if (nxt.length > 1 && rng() < 0.65) {
        const side = primary + (rng() < 0.5 ? -1 : 1);
        if (side >= 0 && side < nxt.length) targets.add(side);
      }
      if (nxt.length > 2 && rng() < 0.25) {
        const extra = randInt(rng, 0, nxt.length - 1);
        targets.add(extra);
      }
      for (const t of targets) {
        from.next.push(nxt[t].id);
        parentsFor[t].push(from.id);
      }
    }

    // Orphan repair: connect nearest parent
    for (let t = 0; t < nxt.length; t++) {
      if (parentsFor[t].length) continue;
      const ideal = (t / Math.max(nxt.length - 1, 1)) * (cur.length - 1);
      const p = Math.round(ideal);
      cur[p].next.push(nxt[t].id);
    }

    // Dedupe next arrays
    for (const node of cur) {
      node.next = [...new Set(node.next)];
    }
  }

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
    // legacy key kept empty for old saves detection
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

/** Nodes the player may travel to next (or first row if not started). */
export function getAvailableNodes(run) {
  const act = getAct(run);
  if (!act) return [];

  if (!run.currentNodeId) {
    return act.nodes.filter((n) => n.row === 0);
  }

  const cur = getNode(run, run.currentNodeId);
  if (!cur) return [];

  // After completing current node, choose among its next links
  if (run.awaitingPathChoice) {
    return cur.next.map((id) => getNode(run, id)).filter(Boolean);
  }

  // Still need to enter/complete current node
  return [];
}

export function isNodeAvailable(run, nodeId) {
  return getAvailableNodes(run).some((n) => n.id === nodeId);
}

/** Call when player selects a path node to travel to. */
export function travelToNode(run, nodeId) {
  if (!isNodeAvailable(run, nodeId)) return false;
  run.currentNodeId = nodeId;
  run.awaitingPathChoice = false;
  if (!run.visitedNodeIds.includes(nodeId)) {
    run.visitedNodeIds.push(nodeId);
  }
  return true;
}

/** Call after finishing a node's encounter/rest/shop. */
export function completeCurrentNode(run) {
  const cur = getCurrentNode(run);
  if (!cur) return { done: false };

  if (cur.type === "boss") {
    // Advance act or win
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
