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
  getPublicSettings,
  loadSettings,
  saveSettings,
  type LlmSettings,
  type SelectionSettings,
} from "./store";
import { clampWindowToVisibleDisplays } from "./bounds";
import { applyOpenAtLogin } from "./autostart";
import { getLogsDirectory, logError, logInfo } from "./logger";

export type LayoutMode = "compact" | "chat" | "settings" | "guidance";

const LAYOUT: Record<LayoutMode, { width: number; height: number }> = {
  compact: { width: 190, height: 220 },
  chat: { width: 420, height: 480 },
  settings: { width: 400, height: 620 },
  guidance: { width: 400, height: 480 },
};

let layoutMode: LayoutMode = "compact";
let getWindowRef: (() => BrowserWindow | null) | null = null;

function applyLayout(win: BrowserWindow, mode: LayoutMode): void {
  layoutMode = mode;
  const size = LAYOUT[mode];
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const work = display.workArea;
  let nextX = bounds.x + bounds.width - size.width;
  let nextY = bounds.y + bounds.height - size.height;
  nextX = Math.min(Math.max(work.x + 8, nextX), work.x + work.width - size.width - 8);
  nextY = Math.min(Math.max(work.y + 8, nextY), work.y + work.height - size.height - 8);
  win.setBounds({
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: size.width,
    height: size.height,
  });
  win.webContents.send("pet:layout", mode);
}

export function getSettings() {
  return getPublicSettings();
}

function ensureChatOpen(win: BrowserWindow): void {
  applyLayout(win, "chat");
  win.webContents.send("pet:open-chat");
}

export function registerPetIpc(getWindow: () => BrowserWindow | null): void {
  getWindowRef = getWindow;

  ipcMain.handle("pet:get-settings", () => getSettings());

  ipcMain.handle("pet:move-by", (_event, dx: number, dy: number) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
    clampWindowToVisibleDisplays(win);
  });

  ipcMain.handle("pet:set-always-on-top", (_event, enabled: boolean) => {
    const win = getWindow();
    saveSettings({ alwaysOnTop: enabled });
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(enabled, enabled ? "floating" : "normal");
      if (enabled) {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      }
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
      mode === "guidance"
    ) {
      applyLayout(win, mode);
    }
    return layoutMode;
  });

  ipcMain.handle("pet:get-layout", () => layoutMode);

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

    const menu = Menu.buildFromTemplate([
      {
        label: "置顶",
        type: "checkbox",
        checked: settings.alwaysOnTop,
        click: (item) => {
          saveSettings({ alwaysOnTop: item.checked });
          win.setAlwaysOnTop(item.checked, item.checked ? "floating" : "normal");
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
