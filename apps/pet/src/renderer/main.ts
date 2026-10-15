/**
 * 阶段 B：自定义拖拽 + 单击 / 双击 / 右键 → FSM 表情；右键菜单由主进程弹出。
 */
import { createPetFsm, type PetState } from "./fsm.js";

const api = window.desktopPet;
const rootEl = document.getElementById("pet-root");
const petEl = document.querySelector<HTMLElement>(".pet");
const hint = document.querySelector<HTMLParagraphElement>(".pet-hint");
const toastEl = document.getElementById("pet-toast");

if (!rootEl || !petEl || !api) {
  throw new Error("桌面宠物渲染层初始化失败");
}

const root: HTMLElement = rootEl;
const pet: HTMLElement = petEl;

const fsm = createPetFsm();
let sfxEnabled = false;
let dragArmed = false;
let dragging = false;
let lastX = 0;
let lastY = 0;
let downX = 0;
let downY = 0;
let lastTapAt = 0;
let singleTapTimer: number | null = null;

const DRAG_THRESHOLD = 12;
const DOUBLE_TAP_MS = 320;

const STATE_HINT: Record<PetState, string> = {
  idle: "单击 / 拖动 / 右键",
  drag: "拖动中…",
  click: "嘿～",
  happy: "超级开心！",
};

function applyState(state: PetState): void {
  pet.dataset.state = state;
  pet.classList.remove("is-idle", "is-drag", "is-click", "is-happy");
  pet.classList.add(`is-${state}`);
  pet.style.animation = "none";
  void pet.offsetWidth;
  pet.style.animation = "";
  if (hint) hint.textContent = STATE_HINT[state];
}

function showToast(message: string): void {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.dataset.visible = "true";
  window.clearTimeout(Number(toastEl.dataset.timer ?? 0));
  const timer = window.setTimeout(() => {
    toastEl.dataset.visible = "false";
  }, 2200);
  toastEl.dataset.timer = String(timer);
}

function playSfx(kind: "click" | "happy" | "drag"): void {
  if (!sfxEnabled) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freq = kind === "happy" ? 880 : kind === "drag" ? 220 : 520;
    osc.frequency.value = freq;
    gain.gain.value = 0.04;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.stop(ctx.currentTime + 0.13);
    void ctx.close();
  } catch {
    // ignore
  }
}

function clearSingleTapTimer(): void {
  if (singleTapTimer !== null) {
    window.clearTimeout(singleTapTimer);
    singleTapTimer = null;
  }
}

function handleTap(): void {
  const now = Date.now();
  if (now - lastTapAt <= DOUBLE_TAP_MS) {
    clearSingleTapTimer();
    lastTapAt = 0;
    fsm.dispatch("DOUBLE_CLICK");
    return;
  }
  lastTapAt = now;
  clearSingleTapTimer();
  singleTapTimer = window.setTimeout(() => {
    singleTapTimer = null;
    fsm.dispatch("CLICK");
  }, DOUBLE_TAP_MS);
}

fsm.subscribe((state, prev) => {
  applyState(state);
  if (state === "click" && prev !== "click") playSfx("click");
  if (state === "happy") playSfx("happy");
  if (state === "drag" && prev !== "drag") playSfx("drag");
});

applyState("idle");

void api.getSettings().then((s) => {
  sfxEnabled = s.sfxEnabled;
});

api.onSettingsChanged((s) => {
  sfxEnabled = s.sfxEnabled;
});

api.onToast((message) => showToast(message));

root.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  dragArmed = true;
  dragging = false;
  lastX = event.screenX;
  lastY = event.screenY;
  downX = event.screenX;
  downY = event.screenY;
});

window.addEventListener("mousemove", (event) => {
  if (!dragArmed) return;
  const dx = event.screenX - lastX;
  const dy = event.screenY - lastY;
  const total = Math.hypot(event.screenX - downX, event.screenY - downY);
  if (!dragging && total >= DRAG_THRESHOLD) {
    dragging = true;
    clearSingleTapTimer();
    lastTapAt = 0;
    fsm.dispatch("DRAG_START");
  }
  if (dragging && (dx !== 0 || dy !== 0)) {
    lastX = event.screenX;
    lastY = event.screenY;
    void api.moveBy(dx, dy);
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || !dragArmed) return;
  dragArmed = false;
  if (dragging) {
    dragging = false;
    fsm.dispatch("DRAG_END");
    return;
  }
  handleTap();
});

root.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  clearSingleTapTimer();
  lastTapAt = 0;
  fsm.dispatch("CONTEXT");
  api.showContextMenu();
});

// 阻止系统双击选中等默认行为
root.addEventListener("dblclick", (event) => event.preventDefault());

console.info("[桌面宠物] 阶段 B 已加载");
