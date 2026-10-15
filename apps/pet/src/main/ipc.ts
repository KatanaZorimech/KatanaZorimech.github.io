import { BrowserWindow, Menu, app, ipcMain, screen } from "electron";
import {
  abortChat,
  clearChatHistory,
  getChatHistory,
  sendChatMessage,
} from "./chat";
import { getPublicSettings, loadSettings, saveSettings, type LlmSettings } from "./store";

export type LayoutMode = "compact" | "chat" | "settings";

const LAYOUT: Record<LayoutMode, { width: number; height: number }> = {
  compact: { width: 190, height: 220 },
  chat: { width: 420, height: 480 },
  settings: { width: 380, height: 460 },
};

let layoutMode: LayoutMode = "compact";

function applyLayout(win: BrowserWindow, mode: LayoutMode): void {
  layoutMode = mode;
  const size = LAYOUT[mode];
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const work = display.workArea;
  // 以窗口右下角为锚点向左上展开，并把气泡放在宠物左侧
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

export function registerPetIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("pet:get-settings", () => getSettings());

  ipcMain.handle("pet:move-by", (_event, dx: number, dy: number) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
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

  ipcMain.handle("pet:save-llm", (_event, llm: Partial<LlmSettings>) => {
    saveSettings({ llm });
    return getSettings();
  });

  ipcMain.handle("pet:set-layout", (_event, mode: LayoutMode) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return layoutMode;
    if (mode === "compact" || mode === "chat" || mode === "settings") {
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
  });

  ipcMain.handle("chat:send", async (event, userText: string) => {
    return sendChatMessage(event.sender, userText);
  });

  ipcMain.handle("pet:quit", () => {
    abortChat();
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
          applyLayout(win, "chat");
          event.sender.send("pet:open-chat");
        },
      },
      {
        label: "摘要",
        click: () => {
          event.sender.send("pet:toast", "摘要将在阶段 D 开放");
        },
      },
      {
        label: "翻译",
        click: () => {
          event.sender.send("pet:toast", "翻译将在阶段 D 开放");
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
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          abortChat();
          app.quit();
        },
      },
    ]);

    menu.popup({ window: win });
  });
}
