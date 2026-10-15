import path from "node:path";
import { app } from "electron";
import { logInfo, logWarn } from "./logger";

/**
 * 开机自启（Electron login item）。macOS / Windows 可用；Linux 视桌面环境而定。
 */
export function applyOpenAtLogin(enabled: boolean): void {
  try {
    const settings: Electron.Settings = {
      openAtLogin: enabled,
      openAsHidden: true,
    };

    if (!app.isPackaged) {
      // 开发态：指向 electron 可执行文件 + 应用路径
      settings.path = process.execPath;
      settings.args = [path.resolve(app.getAppPath())];
    }

    app.setLoginItemSettings(settings);
    logInfo("openAtLogin updated", { enabled, packaged: app.isPackaged });
  } catch (err) {
    logWarn("openAtLogin failed", err);
  }
}

export function readOpenAtLogin(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}
