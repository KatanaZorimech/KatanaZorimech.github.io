import { BrowserWindow, Menu, globalShortcut } from "electron";
import { loadSettings } from "./store";
import { runSelectionAction, type SelectionAction } from "./selection";

let getWindow: (() => BrowserWindow | null) | null = null;

function openActionPicker(win: BrowserWindow): void {
  const menu = Menu.buildFromTemplate([
    {
      label: "摘要所选",
      click: () => {
        void runSelectionAction(win, "summarize");
      },
    },
    {
      label: "翻译所选",
      click: () => {
        void runSelectionAction(win, "translate");
      },
    },
  ]);
  menu.popup({ window: win });
}

function runOrGuide(action: SelectionAction): void {
  const win = getWindow?.();
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) win.show();
  void runSelectionAction(win, action);
}

function safeRegister(accelerator: string, handler: () => void): boolean {
  const accel = accelerator.trim();
  if (!accel) return false;
  try {
    const ok = globalShortcut.register(accel, handler);
    if (!ok) {
      console.warn(`[shortcuts] 注册失败（可能被占用）: ${accel}`);
    }
    return ok;
  } catch (err) {
    console.warn(`[shortcuts] 注册异常 ${accel}:`, err);
    return false;
  }
}

export function registerSelectionShortcuts(
  getter: () => BrowserWindow | null,
): void {
  getWindow = getter;
  unregisterSelectionShortcuts();

  const { selection } = loadSettings();

  safeRegister(selection.shortcutAction, () => {
    const win = getWindow?.();
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.show();
    openActionPicker(win);
  });

  safeRegister(selection.shortcutSummarize, () => runOrGuide("summarize"));
  safeRegister(selection.shortcutTranslate, () => runOrGuide("translate"));
}

export function unregisterSelectionShortcuts(): void {
  globalShortcut.unregisterAll();
}
