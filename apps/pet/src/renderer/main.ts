/**
 * 阶段 C：宠物交互 + 旁侧聊天气泡 / 设置面板 + think/talk 联动。
 */
import { createPetFsm, type PetState } from "./fsm.js";

const apiRef = window.desktopPet;
const appEl = document.getElementById("app");
const petHitEl = document.getElementById("pet-hit");
const petEl = document.querySelector<HTMLElement>(".pet");
const hint = document.querySelector<HTMLParagraphElement>(".pet-hint");
const toastEl = document.getElementById("pet-toast");
const chatPanelEl = document.getElementById("chat-panel");
const settingsPanelEl = document.getElementById("settings-panel");
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
  !chatPanelEl ||
  !settingsPanelEl ||
  !chatHistoryNode
) {
  throw new Error("桌面宠物渲染层初始化失败");
}

const api = apiRef;
const app: HTMLElement = appEl;
const petHit: HTMLElement = petHitEl;
const pet: HTMLElement = petEl;
const chatPanel: HTMLElement = chatPanelEl;
const settingsPanel: HTMLElement = settingsPanelEl;
const chatHistoryEl: HTMLElement = chatHistoryNode;
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
let chatting = false;
let streamingEl: HTMLElement | null = null;

const DRAG_THRESHOLD = 12;
const DOUBLE_TAP_MS = 320;

const STATE_HINT: Record<PetState, string> = {
  idle: "单击 / 拖动 / 右键",
  drag: "拖动中…",
  click: "嘿～",
  happy: "超级开心！",
  think: "思考中…",
  talk: "说话中…",
};

function applyState(state: PetState): void {
  pet.dataset.state = state;
  pet.classList.remove(
    "is-idle",
    "is-drag",
    "is-click",
    "is-happy",
    "is-think",
    "is-talk",
  );
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
  app.classList.remove("mode-compact", "mode-chat", "mode-settings", "mode-guidance");
  app.classList.add(`mode-${mode}`);
  chatPanel.hidden = mode !== "chat";
  settingsPanel.hidden = mode !== "settings";
  if (mode !== "guidance") hideGuidance();
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
      baseURL: baseInput.value.trim() || "https://api.openai.com/v1",
      model: modelInput.value.trim() || "gpt-4o-mini",
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

console.info("[桌面宠物] 阶段 E 已加载");

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (chatting || !chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  void api.sendChat(text).then((result) => {
    if (!result.ok) {
      // error bubble also arrives via chat:error; ensure UX if invoke returns first
      showToast(result.error);
    }
  });
});
