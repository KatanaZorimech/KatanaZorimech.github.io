import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { loadSettings } from "./store";

const PET_WIDTH = 190;
const PET_HEIGHT = 220;

export function createPetWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const { x: workX, y: workY } = display.workArea;
  const settings = loadSettings();

  const win = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x: workX + screenW - PET_WIDTH - 48,
    y: workY + screenH - PET_HEIGHT - 48,
    frame: false,
    transparent: true,
    alwaysOnTop: settings.alwaysOnTop,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (settings.alwaysOnTop) {
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const htmlPath = path.join(__dirname, "../renderer/index.html");
  void win.loadFile(htmlPath);

  win.once("ready-to-show", () => {
    win.showInactive();
  });

  return win;
}
