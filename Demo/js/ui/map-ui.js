import {
  getAct,
  getAvailableNodes,
  getCurrentNode,
  isNodeAvailable,
} from "../map.js";

const TYPE_ICON = {
  combat: "⚔",
  elite: "☠",
  rest: "🏠",
  shop: "🏪",
  boss: "👁",
};

export function renderMap(root, run, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-map";

  const act = getAct(run);
  const available = getAvailableNodes(run);
  const availableIds = new Set(available.map((n) => n.id));
  const current = getCurrentNode(run);
  const needsEnter = current && !run.awaitingPathChoice;

  const header = document.createElement("div");
  header.className = "map-header";
  header.innerHTML = `
    <h2>暗影降临</h2>
    <p class="map-status">
      ${act.name} · 小十一 ${run.hp}/${run.maxHp}
      · <span class="waffle-count">华夫饼 ${run.waffles ?? 0}</span>
    </p>
  `;
  root.appendChild(header);

  const legend = document.createElement("p");
  legend.className = "map-legend";
  legend.textContent = "⚔遭遇  ☠精英  🏠威尔的木屋  🏪商店  👁Boss";
  root.appendChild(legend);

  const canvas = document.createElement("div");
  canvas.className = "map-canvas";

  const maxRow = Math.max(...act.nodes.map((n) => n.row));
  const byRow = [];
  for (let r = 0; r <= maxRow; r++) {
    byRow[r] = act.nodes.filter((n) => n.row === r);
  }

  // SVG paths behind nodes (row N → row N+1), drawn top-to-bottom visually (boss on top)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("map-edges");
  svg.setAttribute("aria-hidden", "true");

  const nodeEls = new Map();

  // Render from top (boss) to bottom (start) for Spire feel
  for (let r = maxRow; r >= 0; r--) {
    const rowEl = document.createElement("div");
    rowEl.className = "map-row";
    rowEl.dataset.row = String(r);

    byRow[r].forEach((node) => {
      const btn = document.createElement("button");
      const isCurrent = current && current.id === node.id && !run.awaitingPathChoice;
      const isVisited = run.visitedNodeIds.includes(node.id) && !isCurrent;
      const isAvail = availableIds.has(node.id);
      const isFuture = !isCurrent && !isVisited && !isAvail;

      btn.className = [
        "map-node",
        `type-${node.type}`,
        isCurrent ? "current" : "",
        isVisited ? "past" : "",
        isAvail ? "available" : "",
        isFuture ? "future" : "",
      ]
        .filter(Boolean)
        .join(" ");

      btn.innerHTML = `
        <span class="map-node-icon">${TYPE_ICON[node.type] || "·"}</span>
        <span class="map-node-label">${node.label}</span>
      `;
      btn.title = node.label;
      btn.disabled = !(isAvail || isCurrent);

      if (isAvail) {
        btn.addEventListener("click", () => handlers.onSelectPath(node));
      } else if (isCurrent) {
        btn.addEventListener("click", () => handlers.onEnterNode(node));
      }

      rowEl.appendChild(btn);
      nodeEls.set(node.id, btn);
    });

    canvas.appendChild(rowEl);
  }

  canvas.insertBefore(svg, canvas.firstChild);
  root.appendChild(canvas);

  // Draw edges after layout
  requestAnimationFrame(() => {
    const cRect = canvas.getBoundingClientRect();
    svg.setAttribute("width", String(cRect.width));
    svg.setAttribute("height", String(cRect.height));
    svg.style.width = `${cRect.width}px`;
    svg.style.height = `${cRect.height}px`;

    for (const node of act.nodes) {
      for (const nextId of node.next) {
        const a = nodeEls.get(node.id);
        const b = nodeEls.get(nextId);
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const x1 = ar.left + ar.width / 2 - cRect.left;
        const y1 = ar.top + ar.height / 2 - cRect.top;
        const x2 = br.left + br.width / 2 - cRect.left;
        const y2 = br.top + br.height / 2 - cRect.top;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        const lit =
          run.visitedNodeIds.includes(node.id) &&
          (run.visitedNodeIds.includes(nextId) || availableIds.has(nextId));
        line.setAttribute("class", lit ? "map-edge lit" : "map-edge");
        svg.appendChild(line);
      }
    }
  });

  const hint = document.createElement("p");
  hint.className = "map-hint";
  if (needsEnter) {
    hint.textContent = `当前：${current.label} — 点击节点进入`;
  } else if (available.length) {
    hint.textContent = "选择下一条路线（高亮节点可点）";
  } else {
    hint.textContent = "旅程继续…";
  }
  root.appendChild(hint);

  const deckBtn = document.createElement("button");
  deckBtn.className = "btn btn-ghost";
  deckBtn.textContent = `查看牌组 (${run.deck.length})`;
  deckBtn.addEventListener("click", () => handlers.onViewDeck());
  root.appendChild(deckBtn);
}
