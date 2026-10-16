import { app, BrowserWindow } from "electron";
import path from "node:path";
import { createPetWindow } from "./window";
import { createTray } from "./tray";
import { registerPetIpc } from "./ipc";
import {
  registerSelectionShortcuts,
  unregisterSelectionShortcuts,
} from "./shortcuts";
import { abortChat } from "./chat";
import { abortSelection } from "./selection";
import { installCrashLogging, logInfo } from "./logger";
import { applyOpenAtLogin } from "./autostart";
import { loadSettings } from "./store";
import { applyAlwaysOnTop } from "./always-on-top";

installCrashLogging();

let petWindow: BrowserWindow | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (petWindow) {
      if (!petWindow.isVisible()) petWindow.show();
      petWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const settings = loadSettings();
    applyOpenAtLogin(settings.openAtLogin);
    logInfo("app ready", { version: app.getVersion(), platform: process.platform });

    registerPetIpc(() => petWindow);
    petWindow = createPetWindow();
    registerSelectionShortcuts(() => petWindow);

    createTray({
      getWindow: () => petWindow,
      onShow: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          applyAlwaysOnTop(petWindow);
          petWindow.show();
          petWindow.focus();
          applyAlwaysOnTop(petWindow);
        }
      },
      onHide: () => {
        petWindow?.hide();
      },
      onQuit: () => {
        abortChat();
        abortSelection();
        app.quit();
      },
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        petWindow = createPetWindow();
        registerSelectionShortcuts(() => petWindow);
      } else if (petWindow && !petWindow.isDestroyed()) {
        applyAlwaysOnTop(petWindow);
        petWindow.show();
        applyAlwaysOnTop(petWindow);
      }
    });
  });
}

app.on("will-quit", () => {
  unregisterSelectionShortcuts();
  abortChat();
  abortSelection();
  logInfo("app will-quit");
});

app.on("window-all-closed", () => {
  // 托盘常驻：关闭窗口不退出
});

export function getAssetPath(...segments: string[]): string {
  return path.join(app.getAppPath(), "assets", ...segments);
}
