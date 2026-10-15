import { app, BrowserWindow } from "electron";
import path from "node:path";
import { createPetWindow } from "./window";
import { createTray } from "./tray";

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
    petWindow = createPetWindow();
    createTray({
      getWindow: () => petWindow,
      onShow: () => {
        petWindow?.show();
        petWindow?.focus();
      },
      onHide: () => {
        petWindow?.hide();
      },
      onQuit: () => {
        app.quit();
      },
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        petWindow = createPetWindow();
      } else {
        petWindow?.show();
      }
    });
  });
}

app.on("window-all-closed", () => {
  // 托盘常驻：关闭窗口不退出（macOS / Windows 均保留托盘）
  if (process.platform !== "darwin") {
    // Windows：仍由托盘「退出」结束进程；此处不主动 quit
  }
});

export function getAssetPath(...segments: string[]): string {
  return path.join(app.getAppPath(), "assets", ...segments);
}
