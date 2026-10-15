export {};

declare global {
  type LlmSettings = {
    apiKey: string;
    baseURL: string;
    model: string;
    temperature: number;
    apiKeyMasked?: string;
  };

  type SelectionSettings = {
    shortcutAction: string;
    shortcutSummarize: string;
    shortcutTranslate: string;
    simulateCopy: boolean;
    guidanceSeen: boolean;
  };

  type PetSettings = {
    alwaysOnTop: boolean;
    sfxEnabled: boolean;
    llm: LlmSettings;
    selection: SelectionSettings;
  };

  type LayoutMode = "compact" | "chat" | "settings" | "guidance";

  type ChatTurn = { role: "user" | "assistant"; content: string };

  type ChatResult = { ok: true; content: string } | { ok: false; error: string };

  interface Window {
    desktopPet?: {
      phase: string;
      locale: string;
      moveBy: (dx: number, dy: number) => Promise<void>;
      getSettings: () => Promise<PetSettings>;
      setAlwaysOnTop: (enabled: boolean) => Promise<PetSettings>;
      setSfx: (enabled: boolean) => Promise<PetSettings>;
      saveLlm: (llm: Partial<LlmSettings>) => Promise<PetSettings>;
      saveSelection: (selection: Partial<SelectionSettings>) => Promise<PetSettings>;
      ackGuidance: () => Promise<PetSettings>;
      setLayout: (mode: LayoutMode) => Promise<LayoutMode>;
      getLayout: () => Promise<LayoutMode>;
      quit: () => Promise<void>;
      showContextMenu: () => void;
      getChatHistory: () => Promise<ChatTurn[]>;
      clearChat: () => Promise<ChatTurn[]>;
      abortChat: () => Promise<void>;
      sendChat: (text: string) => Promise<ChatResult>;
      runSelection: (
        action: "summarize" | "translate",
      ) => Promise<{ ok: true } | { ok: false; error: string; needGuidance?: boolean }>;
      onToast: (handler: (message: string) => void) => () => void;
      onSettingsChanged: (handler: (settings: PetSettings) => void) => () => void;
      onOpenChat: (handler: () => void) => () => void;
      onOpenSettings: (handler: () => void) => () => void;
      onLayout: (handler: (mode: LayoutMode) => void) => () => void;
      onShowGuidance: (handler: () => void) => () => void;
      onChatUser: (handler: (text: string) => void) => () => void;
      onChatAssistantStart: (handler: () => void) => () => void;
      onChatChunk: (handler: (token: string) => void) => () => void;
      onChatDone: (handler: (text: string) => void) => () => void;
      onChatError: (handler: (message: string) => void) => () => void;
    };
  }
}
