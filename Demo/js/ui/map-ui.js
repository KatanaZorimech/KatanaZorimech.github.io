import { getCurrentNode } from "../map.js";

export function renderMap(root, run, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-map";

  const header = document.createElement("div");
  header.className = "map-header";
  header.innerHTML = `
    <h2>暗影降临</h2>
    <p class="map-status">第 ${run.floorIndex + 1} 层 · 小十一 ${run.hp}/${run.maxHp}</p>
  `;
  root.appendChild(header);

  const path = document.createElement("div");
  path.className = "map-path";

  run.map.floors.forEach((floor, fi) => {
    const floorEl = document.createElement("div");
    floorEl.className = "map-floor";
    floorEl.innerHTML = `<h3>${fi === 0 ? "霍金斯 · 实验室" : "倒挂世界"}</h3>`;
    const row = document.createElement("div");
    row.className = "map-nodes";

    floor.nodes.forEach((node, ni) => {
      const btn = document.createElement("button");
      const isCurrent = fi === run.floorIndex && ni === run.nodeIndex;
      const isPast =
        fi < run.floorIndex || (fi === run.floorIndex && ni < run.nodeIndex);
      const isFuture =
        fi > run.floorIndex || (fi === run.floorIndex && ni > run.nodeIndex);

      btn.className = `map-node type-${node.type}${isCurrent ? " current" : ""}${isPast ? " past" : ""}${isFuture ? " future" : ""}`;
      btn.textContent = node.label;
      btn.disabled = !isCurrent;
      if (isCurrent) {
        btn.addEventListener("click", () => handlers.onEnterNode(node));
      }
      row.appendChild(btn);
      if (ni < floor.nodes.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "map-arrow";
        arrow.textContent = "→";
        row.appendChild(arrow);
      }
    });

    floorEl.appendChild(row);
    path.appendChild(floorEl);
  });

  root.appendChild(path);

  const hint = document.createElement("p");
  hint.className = "map-hint";
  const cur = getCurrentNode(run);
  hint.textContent = cur
    ? `当前节点：${cur.label} — 点击进入`
    : "旅程结束";
  root.appendChild(hint);

  const deckBtn = document.createElement("button");
  deckBtn.className = "btn btn-ghost";
  deckBtn.textContent = `查看牌组 (${run.deck.length})`;
  deckBtn.addEventListener("click", () => handlers.onViewDeck());
  root.appendChild(deckBtn);
}

export function renderDeckModal(root, run, onClose) {
  const modal = document.createElement("div");
  modal.className = "modal";
  const box = document.createElement("div");
  box.className = "modal-box";
  box.innerHTML = "<h3>当前牌组</h3>";
  const list = document.createElement("div");
  list.className = "retrieve-list";

  // Dynamic import avoided — caller passes resolved cards
  onClose._list = list;
  box.appendChild(list);

  const close = document.createElement("button");
  close.className = "btn";
  close.textContent = "关闭";
  close.addEventListener("click", onClose);
  box.appendChild(close);
  modal.appendChild(box);
  root.appendChild(modal);
  return list;
}
