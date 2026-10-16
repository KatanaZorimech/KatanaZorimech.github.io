import { BrowserWindow, Menu, app, ipcMain, screen } from "electron";
import {
  abortChat,
  clearChatHistory,
  getChatHistory,
  sendChatMessage,
} from "./chat";
import { abortSelection, runSelectionAction } from "./selection";
import { registerSelectionShortcuts } from "./shortcuts";
import {
  DEFAULT_PANEL_SIZES,
  getPublicSettings,
  loadSettings,
  saveSettings,
  type LlmSettings,
  type PanelSizes,
  type SelectionSettings,
} from "./store";
import { moveWindowBy } from "./bounds";
import { applyOpenAtLogin } from "./autostart";
import { getLogsDirectory, logError, logInfo } from "./logger";
import { applyAlwaysOnTop, alwaysOnTopLevel } from "./always-on-top";
import { PET_HEIGHT, PET_WIDTH } from "./sizes";

export type LayoutMode =
  | "compact"
  | "chat"
  | "settings"
  | "guidance"
  | "calendar"
  | "calculator";

type PanelLayoutMode = Exclude<LayoutMode, "compact">;

const PANEL_MIN = { width: 280, height: 320 };
const PANEL_MAX = { width: 720, height: 900 };

const FIXED_COMPACT = { width: PET_WIDTH, height: PET_HEIGHT };

let layoutMode: LayoutMode = "compact";
/** 当前布局应有的窗口尺寸；拖拽时强制使用，避免 DPI/WM 污染 getBounds 宽高后越拖越大 */
let lockedSize: { width: number; height: number } = { ...FIXED_COMPACT };
let getWindowRef: (() => BrowserWindow | null) | null = null;
let resizeWired = false;

function isPanelMode(mode: LayoutMode): mode is PanelLayoutMode {
  return mode !== "compact";
}

function sizeForMode(mode: LayoutMode): { width: number; height: number } {
  if (mode === "compact") return { ...FIXED_COMPACT };
  const sizes = loadSettings().panelSizes;
  const saved = sizes[mode as keyof PanelSizes] ?? DEFAULT_PANEL_SIZES[mode as keyof PanelSizes];
  return {
    width: clamp(saved.width, PANEL_MIN.width, PANEL_MAX.width),
    height: clamp(saved.height, PANEL_MIN.height, PANEL_MAX.height),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function applyLayout(win: BrowserWindow, mode: LayoutMode): void {
  layoutMode = mode;
  const size = sizeForMode(mode);
  lockedSize = { width: size.width, height: size.height };
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const work = display.workArea;
  let nextX = bounds.x + bounds.width - size.width;
  let nextY = bounds.y + bounds.height - size.height;
  nextX = Math.min(Math.max(work.x + 8, nextX), work.x + work.width - size.width - 8);
  nextY = Math.min(Math.max(work.y + 8, nextY), work.y + work.height - size.height - 8);

  if (isPanelMode(mode)) {
    win.setResizable(true);
    win.setMinimumSize(PANEL_MIN.width, PANEL_MIN.height);
    win.setMaximumSize(PANEL_MAX.width, PANEL_MAX.height);
  } else {
    win.setResizable(false);
    // 紧凑模式：放开 max 以免与 WM 外框像素冲突，靠 lockedSize + setBounds 锁死
    win.setMinimumSize(1, 1);
    win.setMaximumSize(0, 0);
  }

  win.setBounds({
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: size.width,
    height: size.height,
  }, false);
  // 再强制一次，防止部分平台 setBounds 后尺寸漂移
  const after = win.getBounds();
  if (after.width !== size.width || after.height !== size.height) {
    win.setSize(size.width, size.height);
  }
  win.webContents.send("pet:layout", mode);
}

function persistCurrentPanelSize(win: BrowserWindow): void {
  if (!isPanelMode(layoutMode) || win.isDestroyed()) return;
  const b = win.getBounds();
  const width = clamp(b.width, PANEL_MIN.width, PANEL_MAX.width);
  const height = clamp(b.height, PANEL_MIN.height, PANEL_MAX.height);
  lockedSize = { width, height };
  saveSettings({
    panelSizes: {
      [layoutMode]: { width, height },
    },
  });
}

function wireResizePersistence(getWindow: () => BrowserWindow | null): void {
  if (resizeWired) return;
  resizeWired = true;
  // 延迟绑定：窗口可能尚未创建
  const tryBind = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return false;
    win.on("resized", () => {
      persistCurrentPanelSize(win);
    });
    return true;
  };
  if (!tryBind()) {
    const timer = setInterval(() => {
      if (tryBind()) clearInterval(timer);
    }, 200);
    setTimeout(() => clearInterval(timer), 10000);
  }
}

export function getSettings() {
  return getPublicSettings();
}

function ensureChatOpen(win: BrowserWindow): void {
  applyLayout(win, "chat");
  win.webContents.send("pet:open-chat");
}

function openPanel(
  win: BrowserWindow,
  mode: "calendar" | "calculator",
  eventName: "pet:open-calendar" | "pet:open-calculator",
): void {
  applyLayout(win, mode);
  win.webContents.send(eventName);
}

export function registerPetIpc(getWindow: () => BrowserWindow | null): void {
  getWindowRef = getWindow;
  wireResizePersistence(getWindow);

  ipcMain.handle("pet:get-settings", () => getSettings());

  ipcMain.handle("pet:move-by", (_event, dx: number, dy: number) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    // 用布局锁定尺寸平移，避免 Windows DPI / WM 导致聊天面板越拖越大
    moveWindowBy(win, dx, dy, lockedSize);
  });

  ipcMain.handle("pet:set-always-on-top", (_event, enabled: boolean) => {
    const win = getWindow();
    saveSettings({ alwaysOnTop: enabled });
    if (win && !win.isDestroyed()) {
      applyAlwaysOnTop(win, enabled);
    }
    return getSettings();
  });

  ipcMain.handle("pet:set-sfx", (_event, enabled: boolean) => {
    saveSettings({ sfxEnabled: enabled });
    return getSettings();
  });

  ipcMain.handle("pet:set-open-at-login", (_event, enabled: boolean) => {
    saveSettings({ openAtLogin: enabled });
    applyOpenAtLogin(enabled);
    return getSettings();
  });

  ipcMain.handle("pet:log", (_event, payload: { level?: string; message: string; meta?: unknown }) => {
    if (payload.level === "error") logError(`renderer: ${payload.message}`, payload.meta);
    else logInfo(`renderer: ${payload.message}`, payload.meta);
  });

  ipcMain.handle("pet:get-logs-dir", () => getLogsDirectory());

  ipcMain.handle("pet:save-llm", (_event, llm: Partial<LlmSettings>) => {
    saveSettings({ llm });
    return getSettings();
  });

  ipcMain.handle(
    "pet:save-selection",
    (_event, selection: Partial<SelectionSettings>) => {
      saveSettings({ selection });
      registerSelectionShortcuts(getWindow);
      return getSettings();
    },
  );

  ipcMain.handle("pet:ack-guidance", () => {
    saveSettings({ selection: { guidanceSeen: true } });
    return getSettings();
  });

  ipcMain.handle("pet:set-layout", (_event, mode: LayoutMode) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return layoutMode;
    if (
      mode === "compact" ||
      mode === "chat" ||
      mode === "settings" ||
      mode === "guidance" ||
      mode === "calendar" ||
      mode === "calculator"
    ) {
      applyLayout(win, mode);
    }
    return layoutMode;
  });

  ipcMain.handle("pet:get-layout", () => layoutMode);

  ipcMain.handle("pet:save-panel-size", (_event, mode: PanelLayoutMode, size: { width: number; height: number }) => {
    if (!isPanelMode(mode)) return getSettings();
    saveSettings({
      panelSizes: {
        [mode]: {
          width: clamp(size.width, PANEL_MIN.width, PANEL_MAX.width),
          height: clamp(size.height, PANEL_MIN.height, PANEL_MAX.height),
        },
      },
    });
    return getSettings();
  });

  ipcMain.handle("chat:history", () => getChatHistory());

  ipcMain.handle("chat:clear", () => {
    clearChatHistory();
    return getChatHistory();
  });

  ipcMain.handle("chat:abort", () => {
    abortChat();
    abortSelection();
  });

  ipcMain.handle("chat:send", async (event, userText: string) => {
    return sendChatMessage(event.sender, userText);
  });

  ipcMain.handle("selection:run", async (_event, action: "summarize" | "translate") => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return { ok: false, error: "窗口不可用" };
    ensureChatOpen(win);
    return runSelectionAction(win, action);
  });

  ipcMain.handle("pet:quit", () => {
    abortChat();
    abortSelection();
    app.quit();
  });

  ipcMain.on("pet:show-context-menu", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (!win || win.isDestroyed()) return;
    const settings = loadSettings();
    // 菜单勾选与真实置顶状态对齐
    const actuallyOnTop = win.isAlwaysOnTop() && settings.alwaysOnTop;

    const menu = Menu.buildFromTemplate([
      {
        label: "置顶",
        type: "checkbox",
        checked: actuallyOnTop,
        click: (item) => {
          saveSettings({ alwaysOnTop: item.checked });
          applyAlwaysOnTop(win, item.checked);
          if (item.checked) {
            // 立即再断言一次，避免菜单关闭后被盖住
            win.setAlwaysOnTop(true, alwaysOnTopLevel());
          }
          event.sender.send("pet:settings-changed", getSettings());
          event.sender.send(
            "pet:toast",
            item.checked ? "已开启置顶" : "已关闭置顶",
          );
        },
      },
      { type: "separator" },
      {
        label: "打开聊天",
        click: () => {
          ensureChatOpen(win);
        },
      },
      {
        label: "日历",
        click: () => {
          openPanel(win, "calendar", "pet:open-calendar");
        },
      },
      {
        label: "计算器",
        click: () => {
          openPanel(win, "calculator", "pet:open-calculator");
        },
      },
      {
        label: "摘要所选",
        click: () => {
          ensureChatOpen(win);
          void runSelectionAction(win, "summarize");
        },
      },
      {
        label: "翻译所选",
        click: () => {
          ensureChatOpen(win);
          void runSelectionAction(win, "translate");
        },
      },
      {
        label: "设置",
        click: () => {
          applyLayout(win, "settings");
          event.sender.send("pet:open-settings");
        },
      },
      { type: "separator" },
      {
        label: "音效",
        type: "checkbox",
        checked: settings.sfxEnabled,
        click: (item) => {
          saveSettings({ sfxEnabled: item.checked });
          event.sender.send("pet:settings-changed", getSettings());
          event.sender.send(
            "pet:toast",
            item.checked ? "音效已开启" : "音效已关闭",
          );
        },
      },
      {
        label: "开机自启",
        type: "checkbox",
        checked: settings.openAtLogin,
        click: (item) => {
          saveSettings({ openAtLogin: item.checked });
          applyOpenAtLogin(item.checked);
          event.sender.send("pet:settings-changed", getSettings());
          event.sender.send(
            "pet:toast",
            item.checked ? "已开启开机自启" : "已关闭开机自启",
          );
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          abortChat();
          abortSelection();
          app.quit();
        },
      },
    ]);

    menu.popup({ window: win });
  });
}

export function getWindowGetter(): (() => BrowserWindow | null) | null {
  return getWindowRef;
}
