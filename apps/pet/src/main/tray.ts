import { Tray, Menu, nativeImage, BrowserWindow, app } from "electron";
import path from "node:path";
import fs from "node:fs";

export type TrayHandlers = {
  getWindow: () => BrowserWindow | null;
  onShow: () => void;
  onHide: () => void;
  onQuit: () => void;
};

let tray: Tray | null = null;

function resolveTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(app.getAppPath(), "assets", "tray.png"),
    path.join(__dirname, "../../assets/tray.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    }
  }
  // 16x16 橙色占位（无文件时兜底）
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVQ4T2NkYGD4z0ABYBxVSF+FAAh6Af/hXZkXAAAAAElFTkSuQmCC";
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
}

export function createTray(handlers: TrayHandlers): Tray {
  if (tray) return tray;

  tray = new Tray(resolveTrayIcon());
  tray.setToolTip("桌面宠物");

  const rebuild = () => {
    const win = handlers.getWindow();
    const visible = win?.isVisible() ?? false;
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? "隐藏宠物" : "显示宠物",
        click: () => {
          if (visible) handlers.onHide();
          else handlers.onShow();
          rebuild();
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => handlers.onQuit(),
      },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuild();

  tray.on("click", () => {
    const win = handlers.getWindow();
    if (!win) return;
    if (win.isVisible()) handlers.onHide();
    else handlers.onShow();
    rebuild();
  });

  return tray;
}
