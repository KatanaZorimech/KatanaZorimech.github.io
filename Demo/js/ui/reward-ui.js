import { resolveCard } from "../cards.js";

export function renderReward(root, options, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-reward";

  const title = document.createElement("h2");
  title.textContent = "选择一张牌加入牌组";
  root.appendChild(title);

  const row = document.createElement("div");
  row.className = "reward-row";

  options.forEach((inst, idx) => {
    const card = resolveCard(inst);
    const btn = document.createElement("button");
    btn.className = `card reward rarity-${card.rarity}`;
    btn.innerHTML = `
      <span class="card-cost">${card.cost === "X" ? "X" : card.cost}</span>
      <span class="card-name">${card.name}</span>
      <span class="card-type">${card.rarity === "common" ? "普通" : card.rarity === "uncommon" ? "强力" : "稀有"}</span>
      <span class="card-text">${card.text}</span>
    `;
    btn.addEventListener("click", () => handlers.onPick(idx));
    row.appendChild(btn);
  });

  root.appendChild(row);

  const skip = document.createElement("button");
  skip.className = "btn btn-ghost";
  skip.textContent = "跳过";
  skip.addEventListener("click", () => handlers.onSkip());
  root.appendChild(skip);
}

export function renderRest(root, run, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-rest";

  const title = document.createElement("h2");
  title.textContent = "安全营地";
  root.appendChild(title);

  const blurb = document.createElement("p");
  blurb.className = "rest-blurb";
  blurb.textContent = "在倒挂世界边缘短暂喘息。恢复体力，或强化一张牌。";
  root.appendChild(blurb);

  const actions = document.createElement("div");
  actions.className = "rest-actions";

  const healBtn = document.createElement("button");
  healBtn.className = "btn";
  const healAmt = Math.floor(run.maxHp * 0.3);
  healBtn.textContent = `休息（回复 ${healAmt} 生命）`;
  healBtn.addEventListener("click", () => handlers.onHeal());
  actions.appendChild(healBtn);

  const upBtn = document.createElement("button");
  upBtn.className = "btn";
  upBtn.textContent = "升级一张牌";
  upBtn.addEventListener("click", () => handlers.onUpgrade());
  actions.appendChild(upBtn);

  root.appendChild(actions);
}

export function renderUpgradePicker(root, deck, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-rest";

  const title = document.createElement("h2");
  title.textContent = "选择要升级的牌";
  root.appendChild(title);

  const list = document.createElement("div");
  list.className = "retrieve-list";

  deck.forEach((inst, idx) => {
    const card = resolveCard(inst);
    if (inst.upgraded) {
      const muted = document.createElement("div");
      muted.className = "card compact muted";
      muted.innerHTML = `<span class="card-name">${card.name}</span><span class="card-text">已升级</span>`;
      list.appendChild(muted);
      return;
    }
    const btn = document.createElement("button");
    btn.className = "card compact";
    const up = resolveCard({ ...inst, upgraded: true });
    btn.innerHTML = `
      <span class="card-name">${card.name} → ${up.name}</span>
      <span class="card-text">${card.text}</span>
      <span class="card-text upgrade-preview">${up.text}</span>
    `;
    btn.addEventListener("click", () => handlers.onPickUpgrade(idx));
    list.appendChild(btn);
  });

  root.appendChild(list);

  const back = document.createElement("button");
  back.className = "btn btn-ghost";
  back.textContent = "返回";
  back.addEventListener("click", () => handlers.onBack());
  root.appendChild(back);
}
