import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type LlmSettings = {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
};

export type SelectionSettings = {
  /** 弹出「摘要 / 翻译」选择的全局快捷键 */
  shortcutAction: string;
  /** 直接摘要 */
  shortcutSummarize: string;
  /** 直接翻译 */
  shortcutTranslate: string;
  /** 读剪贴板前是否先模拟 Ctrl/Cmd+C（尽力而为） */
  simulateCopy: boolean;
  /** 是否已看过权限/隐私引导 */
  guidanceSeen: boolean;
};

export type AppSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
  openAtLogin: boolean;
  llm: LlmSettings;
  selection: SelectionSettings;
};

const DEFAULTS: AppSettings = {
  alwaysOnTop: true,
  sfxEnabled: false,
  openAtLogin: true,
  llm: {
    apiKey: "",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    temperature: 0.7,
  },
  selection: {
    shortcutAction: "CommandOrControl+Shift+D",
    shortcutSummarize: "CommandOrControl+Shift+S",
    shortcutTranslate: "CommandOrControl+Shift+T",
    simulateCopy: true,
    guidanceSeen: false,
  },
};

function storePath(): string {
  return path.join(app.getPath("userData"), "desktop-pet-settings.json");
}

let cache: AppSettings | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function loadSettings(): AppSettings {
  if (cache) return clone(cache);
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    cache = {
      alwaysOnTop: parsed.alwaysOnTop ?? DEFAULTS.alwaysOnTop,
      sfxEnabled: parsed.sfxEnabled ?? DEFAULTS.sfxEnabled,
      openAtLogin: parsed.openAtLogin ?? DEFAULTS.openAtLogin,
      llm: {
        ...DEFAULTS.llm,
        ...(parsed.llm ?? {}),
      },
      selection: {
        ...DEFAULTS.selection,
        ...(parsed.selection ?? {}),
      },
    };
  } catch {
    cache = clone(DEFAULTS);
  }
  return clone(cache);
}

export function saveSettings(patch: {
  alwaysOnTop?: boolean;
  sfxEnabled?: boolean;
  openAtLogin?: boolean;
  llm?: Partial<LlmSettings>;
  selection?: Partial<SelectionSettings>;
}): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    alwaysOnTop: patch.alwaysOnTop ?? current.alwaysOnTop,
    sfxEnabled: patch.sfxEnabled ?? current.sfxEnabled,
    openAtLogin: patch.openAtLogin ?? current.openAtLogin,
    llm: {
      ...current.llm,
      ...(patch.llm ?? {}),
    },
    selection: {
      ...current.selection,
      ...(patch.selection ?? {}),
    },
  };
  if (typeof next.llm.temperature === "number") {
    next.llm.temperature = Math.min(2, Math.max(0, next.llm.temperature));
  }
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(next, null, 2), "utf8");
  cache = next;
  return clone(next);
}

export function getPublicSettings(): AppSettings & {
  llm: LlmSettings & { apiKeyMasked: string };
} {
  const s = loadSettings();
  const key = s.llm.apiKey;
  const apiKeyMasked =
    key.length === 0 ? "" : key.length <= 8 ? "••••" : `${key.slice(0, 3)}…${key.slice(-4)}`;
  return {
    ...s,
    llm: {
      ...s.llm,
      apiKeyMasked,
    },
  };
}

export const SELECTION_MAX_CHARS = 4000;
