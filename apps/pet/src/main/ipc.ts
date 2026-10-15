import { BrowserWindow, Menu, app, ipcMain } from "electron";

export type PetSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
};

const settings: PetSettings = {
  alwaysOnTop: true,
  sfxEnabled: false,
};

export function getSettings(): PetSettings {
  return { ...settings };
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
    settings.alwaysOnTop = enabled;
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(enabled, enabled ? "floating" : "normal");
      if (enabled) {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      }
    }
    return getSettings();
  });

  ipcMain.handle("pet:set-sfx", (_event, enabled: boolean) => {
    settings.sfxEnabled = enabled;
    return getSettings();
  });

  ipcMain.handle("pet:quit", () => {
    app.quit();
  });

  ipcMain.on("pet:show-context-menu", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (!win || win.isDestroyed()) return;

    const menu = Menu.buildFromTemplate([
      {
        label: "置顶",
        type: "checkbox",
        checked: settings.alwaysOnTop,
        click: (item) => {
          settings.alwaysOnTop = item.checked;
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
          event.sender.send("pet:toast", "聊天将在阶段 C 开放");
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
          event.sender.send("pet:toast", "设置页将在阶段 C 开放");
        },
      },
      { type: "separator" },
      {
        label: "音效",
        type: "checkbox",
        checked: settings.sfxEnabled,
        click: (item) => {
          settings.sfxEnabled = item.checked;
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
        click: () => app.quit(),
      },
    ]);

    menu.popup({ window: win });
  });
}
