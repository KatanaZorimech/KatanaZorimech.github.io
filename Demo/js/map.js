/**
 * Short run map: Floor 1: fight, fight, elite, rest, boss(mind_flayer)
 * Floor 2: fight, elite, rest, boss(vecna)
 */

export function generateRunMap() {
  return {
    floors: [
      {
        index: 1,
        nodes: [
          { id: "f1n0", type: "combat", label: "遭遇" },
          { id: "f1n1", type: "combat", label: "遭遇" },
          { id: "f1n2", type: "elite", label: "精英" },
          { id: "f1n3", type: "rest", label: "营地" },
          { id: "f1n4", type: "boss", label: "夺心魔", bossId: "mind_flayer" },
        ],
      },
      {
        index: 2,
        nodes: [
          { id: "f2n0", type: "combat", label: "遭遇" },
          { id: "f2n1", type: "elite", label: "精英" },
          { id: "f2n2", type: "rest", label: "营地" },
          { id: "f2n3", type: "boss", label: "维克那", bossId: "vecna" },
        ],
      },
    ],
  };
}

export function getCurrentNode(run) {
  const floor = run.map.floors[run.floorIndex];
  if (!floor) return null;
  return floor.nodes[run.nodeIndex] || null;
}

export function advanceNode(run) {
  const floor = run.map.floors[run.floorIndex];
  run.nodeIndex += 1;
  if (run.nodeIndex >= floor.nodes.length) {
    run.floorIndex += 1;
    run.nodeIndex = 0;
    if (run.floorIndex >= run.map.floors.length) {
      run.completed = true;
      return null;
    }
  }
  return getCurrentNode(run);
}

export function isRunComplete(run) {
  return !!run.completed;
}
