import { resolveCard } from "../cards.js";
import { SHOP_PRICES } from "../state.js";

export function renderReward(root, options, handlers, waffleGained = 0, meta = {}) {
  root.innerHTML = "";
  root.className = "scene scene-reward";

  const title = document.createElement("h2");
  title.textContent = "战斗奖励";
  root.appendChild(title);

  if (waffleGained > 0) {
    const waffle = document.createElement("p");
    waffle.className = "reward-waffles";
    waffle.textContent = `获得华夫饼 × ${waffleGained}`;
    root.appendChild(waffle);
  }

  const sub = document.createElement("p");
  sub.className = "rest-blurb";
  sub.textContent = meta.eliteUpgraded
    ? "精英战利：三张均为升级卡，选择一张加入牌组"
    : "选择一张牌加入牌组";
  root.appendChild(sub);

  const row = document.createElement("div");
  row.className = "reward-row";

  options.forEach((inst, idx) => {
    const card = resolveCard(inst);
    const btn = document.createElement("button");
    btn.className = `card reward rarity-${card.rarity}`;
    btn.innerHTML = `
      <span class="card-cost">${card.cost === "X" ? "X" : card.cost}</span>
      <span class="card-name">${card.name}</span>
      <span class="card-type">${rarityLabel(card.rarity)}</span>
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
  title.textContent = "威尔的木屋";
  root.appendChild(title);

  const blurb = document.createElement("p");
  blurb.className = "rest-blurb";
  blurb.textContent =
    "木屋灯串微亮，对讲机偶尔嗡鸣。在壁炉旁恢复体力，或强化一张牌。";
  root.appendChild(blurb);

  const actions = document.createElement("div");
  actions.className = "rest-actions";

  const healBtn = document.createElement("button");
  healBtn.className = "btn";
  const healAmt = Math.floor(run.maxHp * 0.3);
  healBtn.textContent = `靠着壁炉休息（回复 ${healAmt} 生命）`;
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

export function renderShop(root, run, offer, handlers) {
  root.innerHTML = "";
  root.className = "scene scene-shop";

  const title = document.createElement("h2");
  title.textContent = "商店";
  root.appendChild(title);

  const blurb = document.createElement("p");
  blurb.className = "rest-blurb";
  blurb.innerHTML = `用华夫饼换取力量。当前：<strong class="waffle-count">${run.waffles}</strong> 块华夫饼`;
  root.appendChild(blurb);

  const row = document.createElement("div");
  row.className = "reward-row shop-row";

  offer.forEach((entry, idx) => {
    const card = resolveCard(entry.card);
    const price = entry.price;
    const sold = entry.sold;
    const canBuy = !sold && run.waffles >= price;
    const btn = document.createElement("button");
    btn.className = `card reward rarity-${card.rarity}${sold ? " muted" : ""}`;
    btn.disabled = sold || !canBuy;
    btn.innerHTML = `
      <span class="card-cost">${card.cost === "X" ? "X" : card.cost}</span>
      <span class="card-name">${card.name}</span>
      <span class="card-type">${rarityLabel(card.rarity)}</span>
      <span class="card-text">${card.text}</span>
      <span class="shop-price">${sold ? "已购" : `华夫饼 ${price}`}</span>
    `;
    if (!sold) {
      btn.addEventListener("click", () => handlers.onBuy(idx));
    }
    row.appendChild(btn);
  });

  root.appendChild(row);

  const leave = document.createElement("button");
  leave.className = "btn btn-primary";
  leave.textContent = "离开商店";
  leave.addEventListener("click", () => handlers.onLeave());
  root.appendChild(leave);
}

function rarityLabel(r) {
  return r === "common" ? "普通" : r === "uncommon" ? "强力" : "稀有";
}

export function buildShopOffer(rng, pickRewardOptions, avoidIds = []) {
  const cards = pickRewardOptions(rng, 5, { avoidIds });
  return cards.map((card) => {
    const resolved = resolveCard(card);
    return {
      card,
      price: SHOP_PRICES[resolved.rarity] || 50,
      sold: false,
    };
  });
}
