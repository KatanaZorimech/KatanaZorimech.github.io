import { BrowserWindow } from "electron";
import { loadSettings } from "./store";

/** Windows 上 floating 易被抢 z-order；screen-saver 更稳。macOS 用 floating。 */
export function alwaysOnTopLevel():
  | "normal"
  | "floating"
  | "torn-off-menu"
  | "modal-panel"
  | "main-menu"
  | "status"
  | "pop-up-menu"
  | "screen-saver" {
  return process.platform === "darwin" ? "floating" : "screen-saver";
}

/** 按设置施加 / 解除置顶，并在开启时尽量盖住全屏桌面。 */
export function applyAlwaysOnTop(win: BrowserWindow, enabled?: boolean): void {
  if (win.isDestroyed()) return;
  const on = enabled ?? loadSettings().alwaysOnTop;
  if (on) {
    win.setAlwaysOnTop(true, alwaysOnTopLevel());
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(false);
  }
}

/** 在 show / blur 后重新断言置顶，避免 Windows 抢 z-order。 */
export function reassertAlwaysOnTop(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (!loadSettings().alwaysOnTop) return;
  applyAlwaysOnTop(win, true);
}

export function wireAlwaysOnTopGuards(win: BrowserWindow): void {
  const bump = () => reassertAlwaysOnTop(win);
  win.on("show", bump);
  win.on("blur", bump);
  win.on("focus", bump);
  // 部分 Windows 场景下 restore 会丢 z-order；不在 moved 上重断言，避免拖拽闪烁
  win.on("restore", bump);
}
