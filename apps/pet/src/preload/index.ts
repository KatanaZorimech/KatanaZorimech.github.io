import { contextBridge, ipcRenderer } from "electron";

export type LlmSettings = {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
  apiKeyMasked?: string;
};

export type SelectionSettings = {
  shortcutAction: string;
  shortcutSummarize: string;
  shortcutTranslate: string;
  simulateCopy: boolean;
  guidanceSeen: boolean;
};

export type PetSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
  openAtLogin: boolean;
  llm: LlmSettings;
  selection: SelectionSettings;
};

export type LayoutMode = "compact" | "chat" | "settings" | "guidance";

export type ChatTurn = { role: "user" | "assistant"; content: string };

contextBridge.exposeInMainWorld("desktopPet", {
  phase: "E",
  locale: "zh-CN",
  moveBy: (dx: number, dy: number) => ipcRenderer.invoke("pet:move-by", dx, dy),
  getSettings: (): Promise<PetSettings> => ipcRenderer.invoke("pet:get-settings"),
  setAlwaysOnTop: (enabled: boolean): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:set-always-on-top", enabled),
  setSfx: (enabled: boolean): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:set-sfx", enabled),
  setOpenAtLogin: (enabled: boolean): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:set-open-at-login", enabled),
  saveLlm: (llm: Partial<LlmSettings>): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:save-llm", llm),
  saveSelection: (selection: Partial<SelectionSettings>): Promise<PetSettings> =>
    ipcRenderer.invoke("pet:save-selection", selection),
  ackGuidance: (): Promise<PetSettings> => ipcRenderer.invoke("pet:ack-guidance"),
  log: (payload: { level?: string; message: string; meta?: unknown }) =>
    ipcRenderer.invoke("pet:log", payload),
  getLogsDir: (): Promise<string> => ipcRenderer.invoke("pet:get-logs-dir"),
  setLayout: (mode: LayoutMode): Promise<LayoutMode> =>
    ipcRenderer.invoke("pet:set-layout", mode),
  getLayout: (): Promise<LayoutMode> => ipcRenderer.invoke("pet:get-layout"),
  quit: () => ipcRenderer.invoke("pet:quit"),
  showContextMenu: () => ipcRenderer.send("pet:show-context-menu"),
  getChatHistory: (): Promise<ChatTurn[]> => ipcRenderer.invoke("chat:history"),
  clearChat: (): Promise<ChatTurn[]> => ipcRenderer.invoke("chat:clear"),
  abortChat: () => ipcRenderer.invoke("chat:abort"),
  sendChat: (
    text: string,
  ): Promise<{ ok: true; content: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke("chat:send", text),
  runSelection: (
    action: "summarize" | "translate",
  ): Promise<{ ok: true } | { ok: false; error: string; needGuidance?: boolean }> =>
    ipcRenderer.invoke("selection:run", action),
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
  onOpenChat: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on("pet:open-chat", listener);
    return () => ipcRenderer.removeListener("pet:open-chat", listener);
  },
  onOpenSettings: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on("pet:open-settings", listener);
    return () => ipcRenderer.removeListener("pet:open-settings", listener);
  },
  onLayout: (handler: (mode: LayoutMode) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: LayoutMode) => {
      handler(mode);
    };
    ipcRenderer.on("pet:layout", listener);
    return () => ipcRenderer.removeListener("pet:layout", listener);
  },
  onShowGuidance: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on("selection:show-guidance", listener);
    return () => ipcRenderer.removeListener("selection:show-guidance", listener);
  },
  onChatUser: (handler: (text: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, text: string) => handler(text);
    ipcRenderer.on("chat:user", listener);
    return () => ipcRenderer.removeListener("chat:user", listener);
  },
  onChatAssistantStart: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on("chat:assistant-start", listener);
    return () => ipcRenderer.removeListener("chat:assistant-start", listener);
  },
  onChatChunk: (handler: (token: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, token: string) => handler(token);
    ipcRenderer.on("chat:chunk", listener);
    return () => ipcRenderer.removeListener("chat:chunk", listener);
  },
  onChatDone: (handler: (text: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, text: string) => handler(text);
    ipcRenderer.on("chat:done", listener);
    return () => ipcRenderer.removeListener("chat:done", listener);
  },
  onChatError: (handler: (message: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, message: string) => handler(message);
    ipcRenderer.on("chat:error", listener);
    return () => ipcRenderer.removeListener("chat:error", listener);
  },
});
