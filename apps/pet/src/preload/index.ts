import { contextBridge, ipcRenderer } from "electron";

export type PetSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
};

contextBridge.exposeInMainWorld("desktopPet", {
  phase: "B",
  locale: "zh-CN",
  moveBy: (dx: number, dy: number) => ipcRenderer.invoke("pet:move-by", dx, dy),
  getSettings: (): Promise<PetSettings> => ipcRenderer.invoke("pet:get-settings"),
  setAlwaysOnTop: (enabled: boolean): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:set-always-on-top", enabled),
  setSfx: (enabled: boolean): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:set-sfx", enabled),
  quit: () => ipcRenderer.invoke("pet:quit"),
  showContextMenu: () => ipcRenderer.send("pet:show-context-menu"),
  onToast: (handler: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      handler(message);
    };
    ipcRenderer.on("pet:toast", listener);
    return () => ipcRenderer.removeListener("pet:toast", listener);
  },
  onSettingsChanged: (handler: (settings: PetSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: PetSettings) => {
      handler(settings);
    };
    ipcRenderer.on("pet:settings-changed", listener);
    return () => ipcRenderer.removeListener("pet:settings-changed", listener);
  },
});
