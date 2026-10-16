/**
 * P3：四帧立绘手势 + 清新手绘面板 + 气泡聊天 + 日历/计算器。
 */
import { createPetFsm, type PetState } from "./fsm.js";

const apiRef = window.desktopPet;
const appEl = document.getElementById("app");
const petHitEl = document.getElementById("pet-hit");
const petEl = document.querySelector<HTMLElement>(".pet");
const spriteEl = document.getElementById("pet-sprite") as HTMLImageElement | null;
const toastEl = document.getElementById("pet-toast");
const chatPanelEl = document.getElementById("chat-panel");
const settingsPanelEl = document.getElementById("settings-panel");
const calendarPanelEl = document.getElementById("calendar-panel");
const calculatorPanelEl = document.getElementById("calculator-panel");
const chatHistoryNode = document.getElementById("chat-history");
const chatStatus = document.getElementById("chat-status");
const chatForm = document.getElementById("chat-form") as HTMLFormElement | null;
const chatInput = document.getElementById("chat-input") as HTMLInputElement | null;
const chatSend = document.getElementById("chat-send") as HTMLButtonElement | null;

if (
  !apiRef ||
  !appEl ||
  !petHitEl ||
  !petEl ||
  !spriteEl ||
  !chatPanelEl ||
  !settingsPanelEl ||
  !calendarPanelEl ||
  !calculatorPanelEl ||
  !chatHistoryNode
) {
  throw new Error("桌面宠物渲染层初始化失败");
}

const api = apiRef;
const app: HTMLElement = appEl;
const petHit: HTMLElement = petHitEl;
const pet: HTMLElement = petEl;
const sprite: HTMLImageElement = spriteEl;
const chatPanel: HTMLElement = chatPanelEl;
const settingsPanel: HTMLElement = settingsPanelEl;
const calendarPanel: HTMLElement = calendarPanelEl;
const calculatorPanel: HTMLElement = calculatorPanelEl;
const chatHistoryEl: HTMLElement = chatHistoryNode;
const fsm = createPetFsm();

/** 手势 ↔ 表情帧（见 docs/pet-gesture-mapping.md） */
const FRAME_BY_STATE: Record<PetState, string> = {
  idle: "./assets/pet/frame-04.png",
  wave: "./assets/pet/frame-04.png",
  drag: "./assets/pet/frame-01.png",
  click: "./assets/pet/frame-03.png",
  happy: "./assets/pet/frame-02.png",
  think: "./assets/pet/frame-04.png",
  talk: "./assets/pet/frame-02.png",
};

let sfxEnabled = false;
let dragArmed = false;
let dragging = false;
let lastX = 0;
let lastY = 0;
let downX = 0;
let downY = 0;
let lastTapAt = 0;
let singleTapTimer: number | null = null;
let chatting = false;
let streamingEl: HTMLElement | null = null;

const DRAG_THRESHOLD = 12;
const DOUBLE_TAP_MS = 320;

const STATE_CLASS: PetState[] = [
  "idle",
  "drag",
  "click",
  "happy",
  "think",
  "talk",
  "wave",
];

function applyState(state: PetState): void {
  pet.dataset.state = state;
  for (const name of STATE_CLASS) {
    pet.classList.toggle(`is-${name}`, name === state);
  }
  const nextSrc = FRAME_BY_STATE[state];
  if (sprite.getAttribute("src") !== nextSrc) {
    sprite.src = nextSrc;
  }
  pet.style.animation = "none";
  void pet.offsetWidth;
  pet.style.animation = "";
}

function showToast(message: string): void {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.dataset.visible = "true";
  window.clearTimeout(Number(toastEl.dataset.timer ?? 0));
  const timer = window.setTimeout(() => {
    toastEl.dataset.visible = "false";
  }, 2400);
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
    osc.frequency.value = kind === "happy" ? 880 : kind === "drag" ? 220 : 520;
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

function setLayoutMode(mode: LayoutMode): void {
  app.classList.remove(
    "mode-compact",
    "mode-chat",
    "mode-settings",
    "mode-guidance",
    "mode-calendar",
    "mode-calculator",
  );
  app.classList.add(`mode-${mode}`);
  chatPanel.hidden = mode !== "chat";
  settingsPanel.hidden = mode !== "settings";
  calendarPanel.hidden = mode !== "calendar";
  calculatorPanel.hidden = mode !== "calculator";
  if (mode !== "guidance") hideGuidance();
  if (mode === "calendar") renderCalendar();
}

async function openChat(): Promise<void> {
  await api.setLayout("chat");
  setLayoutMode("chat");
  chatInput?.focus();
}

async function openSettings(): Promise<void> {
  await api.setLayout("settings");
  setLayoutMode("settings");
  await fillSettingsForm();
}

async function openCalendar(): Promise<void> {
  await api.setLayout("calendar");
  setLayoutMode("calendar");
}

async function openCalculator(): Promise<void> {
  await api.setLayout("calculator");
  setLayoutMode("calculator");
}

async function closePanels(): Promise<void> {
  await api.setLayout("compact");
  setLayoutMode("compact");
}

function appendBubble(role: "user" | "assistant" | "error", text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `chat-bubble ${role}`;
  el.textContent = text;
  chatHistoryEl.appendChild(el);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  return el;
}

function renderHistory(turns: ChatTurn[]): void {
  chatHistoryEl.innerHTML = "";
  for (const turn of turns) {
    appendBubble(turn.role, turn.content);
  }
}

function setChatBusy(busy: boolean): void {
  chatting = busy;
  if (chatSend) chatSend.disabled = busy;
  if (chatInput) chatInput.disabled = busy;
  if (chatStatus) {
    chatStatus.hidden = !busy;
    chatStatus.textContent = busy ? "正在回复…" : "";
  }
}

async function fillSettingsForm(): Promise<void> {
  const s = await api.getSettings();
  const keyInput = document.getElementById("set-api-key") as HTMLInputElement | null;
  const baseInput = document.getElementById("set-base-url") as HTMLInputElement | null;
  const modelInput = document.getElementById("set-model") as HTMLInputElement | null;
  const tempInput = document.getElementById("set-temperature") as HTMLInputElement | null;
  const tempValue = document.getElementById("temp-value");
  const shortcutAction = document.getElementById("set-shortcut-action") as HTMLInputElement | null;
  const shortcutSummarize = document.getElementById(
    "set-shortcut-summarize",
  ) as HTMLInputElement | null;
  const shortcutTranslate = document.getElementById(
    "set-shortcut-translate",
  ) as HTMLInputElement | null;
  const simulateCopy = document.getElementById("set-simulate-copy") as HTMLInputElement | null;
  const openAtLogin = document.getElementById("set-open-at-login") as HTMLInputElement | null;
  if (keyInput) keyInput.value = s.llm.apiKey;
  if (baseInput) baseInput.value = s.llm.baseURL;
  if (modelInput) modelInput.value = s.llm.model;
  if (tempInput) tempInput.value = String(s.llm.temperature);
  if (tempValue) tempValue.textContent = String(s.llm.temperature);
  if (shortcutAction) shortcutAction.value = s.selection.shortcutAction;
  if (shortcutSummarize) shortcutSummarize.value = s.selection.shortcutSummarize;
  if (shortcutTranslate) shortcutTranslate.value = s.selection.shortcutTranslate;
  if (simulateCopy) simulateCopy.checked = s.selection.simulateCopy;
  if (openAtLogin) openAtLogin.checked = s.openAtLogin;
}

function showGuidance(): void {
  const overlay = document.getElementById("guidance-overlay");
  if (overlay) overlay.hidden = false;
}

function hideGuidance(): void {
  const overlay = document.getElementById("guidance-overlay");
  if (overlay) overlay.hidden = true;
}

/* —— 日历 —— */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based

function renderCalendar(): void {
  const title = document.getElementById("cal-title");
  const grid = document.getElementById("cal-grid");
  if (!title || !grid) return;
  title.textContent = `${calYear}年${calMonth + 1}月`;
  grid.innerHTML = "";

  const first = new Date(calYear, calMonth, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-cell";
    let dayNum: number;
    let muted = false;
    let cellYear = calYear;
    let cellMonth = calMonth;

    if (i < startPad) {
      dayNum = prevDays - startPad + i + 1;
      muted = true;
      cellMonth = calMonth - 1;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
    } else if (i >= startPad + daysInMonth) {
      dayNum = i - startPad - daysInMonth + 1;
      muted = true;
      cellMonth = calMonth + 1;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
    } else {
      dayNum = i - startPad + 1;
    }

    cell.textContent = String(dayNum);
    if (muted) cell.classList.add("muted");
    if (
      cellYear === today.getFullYear() &&
      cellMonth === today.getMonth() &&
      dayNum === today.getDate() &&
      !muted
    ) {
      cell.classList.add("today");
    }
    grid.appendChild(cell);
  }
}

document.getElementById("cal-prev")?.addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 0) {
    calMonth = 11;
    calYear -= 1;
  }
  renderCalendar();
});

document.getElementById("cal-next")?.addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 11) {
    calMonth = 0;
    calYear += 1;
  }
  renderCalendar();
});

document.getElementById("cal-today")?.addEventListener("click", () => {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
});

/* —— 计算器 —— */
type CalcOp = "+" | "−" | "×" | "÷" | null;
let calcDisplay = "0";
let calcAcc: number | null = null;
let calcOp: CalcOp = null;
let calcFresh = false;

const calcDisplayEl = document.getElementById("calc-display");

function syncCalcDisplay(): void {
  if (calcDisplayEl) calcDisplayEl.textContent = calcDisplay;
}

function calcApplyOp(a: number, b: number, op: CalcOp): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function formatCalc(n: number): string {
  if (!Number.isFinite(n)) return "错误";
  const rounded = Math.round(n * 1e10) / 1e10;
  const s = String(rounded);
  return s.length > 14 ? rounded.toPrecision(10).replace(/\.?0+$/, "") : s;
}

function onCalcDigit(d: string): void {
  if (calcDisplay === "错误" || calcFresh) {
    calcDisplay = d;
    calcFresh = false;
  } else if (calcDisplay === "0") {
    calcDisplay = d;
  } else if (calcDisplay === "-0") {
    calcDisplay = `-${d}`;
  } else if (calcDisplay.replace("-", "").length < 14) {
    calcDisplay += d;
  }
  syncCalcDisplay();
}

function onCalcDot(): void {
  if (calcDisplay === "错误" || calcFresh) {
    calcDisplay = "0.";
    calcFresh = false;
  } else if (!calcDisplay.includes(".")) {
    calcDisplay += ".";
  }
  syncCalcDisplay();
}

function onCalcOp(op: CalcOp): void {
  const cur = Number(calcDisplay);
  if (calcDisplay === "错误" || !Number.isFinite(cur)) {
    calcDisplay = "0";
    calcAcc = null;
    calcOp = op;
    calcFresh = true;
    syncCalcDisplay();
    return;
  }
  if (calcAcc !== null && calcOp && !calcFresh) {
    const result = calcApplyOp(calcAcc, cur, calcOp);
    calcDisplay = formatCalc(result);
    calcAcc = Number.isFinite(result) ? result : null;
  } else {
    calcAcc = cur;
  }
  calcOp = op;
  calcFresh = true;
  syncCalcDisplay();
}

function onCalcEq(): void {
  if (calcOp === null || calcAcc === null) return;
  const cur = Number(calcDisplay);
  const result = calcApplyOp(calcAcc, cur, calcOp);
  calcDisplay = formatCalc(result);
  calcAcc = null;
  calcOp = null;
  calcFresh = true;
  syncCalcDisplay();
}

function onCalcClear(): void {
  calcDisplay = "0";
  calcAcc = null;
  calcOp = null;
  calcFresh = false;
  syncCalcDisplay();
}

function onCalcSign(): void {
  if (calcDisplay === "错误") return;
  if (calcDisplay.startsWith("-")) calcDisplay = calcDisplay.slice(1) || "0";
  else if (calcDisplay !== "0") calcDisplay = `-${calcDisplay}`;
  syncCalcDisplay();
}

function onCalcPercent(): void {
  const cur = Number(calcDisplay);
  if (!Number.isFinite(cur)) return;
  calcDisplay = formatCalc(cur / 100);
  calcFresh = true;
  syncCalcDisplay();
}

document.querySelector(".calc-keys")?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest("button[data-calc]") as HTMLButtonElement | null;
  if (!btn) return;
  const kind = btn.dataset.calc;
  if (kind === "digit") onCalcDigit(btn.dataset.digit ?? "0");
  else if (kind === "dot") onCalcDot();
  else if (kind === "op") onCalcOp((btn.dataset.op as CalcOp) ?? null);
  else if (kind === "eq") onCalcEq();
  else if (kind === "clear") onCalcClear();
  else if (kind === "sign") onCalcSign();
  else if (kind === "percent") onCalcPercent();
});

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

void api.getChatHistory().then(renderHistory);

api.onSettingsChanged((s) => {
  sfxEnabled = s.sfxEnabled;
});

api.onToast((message) => showToast(message));
api.onOpenChat(() => {
  void openChat();
});
api.onOpenSettings(() => {
  void openSettings();
});
api.onOpenCalendar(() => {
  void openCalendar();
});
api.onOpenCalculator(() => {
  void openCalculator();
});
api.onLayout((mode) => setLayoutMode(mode));
api.onShowGuidance(() => {
  void api.setLayout("guidance").then(() => {
    setLayoutMode("guidance");
    showGuidance();
  });
});

document.getElementById("guidance-ack")?.addEventListener("click", () => {
  void api.ackGuidance().then(() => {
    hideGuidance();
    void api.setLayout("compact").then(() => setLayoutMode("compact"));
    showToast("已确认选区说明");
  });
});

api.onChatUser((text) => {
  appendBubble("user", text);
});

api.onChatAssistantStart(() => {
  fsm.dispatch("THINK_START");
  streamingEl = appendBubble("assistant", "");
  setChatBusy(true);
});

api.onChatChunk((token) => {
  if (fsm.state === "think") fsm.dispatch("TALK_START");
  if (!streamingEl) streamingEl = appendBubble("assistant", "");
  streamingEl.textContent = (streamingEl.textContent ?? "") + token;
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
});

api.onChatDone((text) => {
  if (streamingEl) streamingEl.textContent = text;
  streamingEl = null;
  setChatBusy(false);
  fsm.dispatch("REPLY_END");
});

api.onChatError((message) => {
  if (streamingEl) {
    streamingEl.remove();
    streamingEl = null;
  }
  appendBubble("error", message);
  setChatBusy(false);
  fsm.dispatch("REPLY_END");
  showToast(message);
});

petHit.addEventListener("mousedown", (event) => {
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

petHit.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  clearSingleTapTimer();
  lastTapAt = 0;
  fsm.dispatch("CONTEXT");
  api.showContextMenu();
});

petHit.addEventListener("dblclick", (event) => event.preventDefault());

document.getElementById("chat-close")?.addEventListener("click", () => {
  void closePanels();
});
document.getElementById("settings-close")?.addEventListener("click", () => {
  void closePanels();
});
document.getElementById("calendar-close")?.addEventListener("click", () => {
  void closePanels();
});
document.getElementById("calculator-close")?.addEventListener("click", () => {
  void closePanels();
});
document.getElementById("chat-to-settings")?.addEventListener("click", () => {
  void openSettings();
});
document.getElementById("settings-to-chat")?.addEventListener("click", () => {
  void openChat();
});
document.getElementById("chat-clear")?.addEventListener("click", () => {
  void api.clearChat().then(renderHistory);
  showToast("已清空会话");
});

const tempInput = document.getElementById("set-temperature") as HTMLInputElement | null;
tempInput?.addEventListener("input", () => {
  const tempValue = document.getElementById("temp-value");
  if (tempValue && tempInput) tempValue.textContent = tempInput.value;
});

document.getElementById("settings-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const keyInput = document.getElementById("set-api-key") as HTMLInputElement;
  const baseInput = document.getElementById("set-base-url") as HTMLInputElement;
  const modelInput = document.getElementById("set-model") as HTMLInputElement;
  const shortcutAction = document.getElementById("set-shortcut-action") as HTMLInputElement;
  const shortcutSummarize = document.getElementById(
    "set-shortcut-summarize",
  ) as HTMLInputElement;
  const shortcutTranslate = document.getElementById(
    "set-shortcut-translate",
  ) as HTMLInputElement;
  const simulateCopy = document.getElementById("set-simulate-copy") as HTMLInputElement;
  const openAtLogin = document.getElementById("set-open-at-login") as HTMLInputElement;
  void Promise.all([
    api.saveLlm({
      apiKey: keyInput.value.trim(),
      baseURL: baseInput.value.trim() || "https://api.deepseek.com/v1",
      model: modelInput.value.trim() || "deepseek-chat",
      temperature: Number(tempInput?.value ?? 0.7),
    }),
    api.saveSelection({
      shortcutAction: shortcutAction.value.trim() || "CommandOrControl+Shift+D",
      shortcutSummarize: shortcutSummarize.value.trim() || "CommandOrControl+Shift+S",
      shortcutTranslate: shortcutTranslate.value.trim() || "CommandOrControl+Shift+T",
      simulateCopy: simulateCopy.checked,
    }),
    api.setOpenAtLogin(openAtLogin.checked),
  ]).then(() => {
    showToast("设置已保存");
  });
});

window.addEventListener("error", (event) => {
  void api.log({
    level: "error",
    message: event.message,
    meta: { source: event.filename, line: event.lineno },
  });
});

window.addEventListener("unhandledrejection", (event) => {
  void api.log({
    level: "error",
    message: "unhandledrejection",
    meta: String(event.reason),
  });
});

console.info("[桌面宠物] P3 立绘手势 + 日历/计算器已加载");

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (chatting || !chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  void api.sendChat(text).then((result) => {
    if (!result.ok) {
      showToast(result.error);
    }
  });
});
