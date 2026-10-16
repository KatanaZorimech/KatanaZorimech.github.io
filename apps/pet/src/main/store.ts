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

export type PanelSize = { width: number; height: number };

export type PanelSizes = {
  chat: PanelSize;
  settings: PanelSize;
  calendar: PanelSize;
  calculator: PanelSize;
  guidance: PanelSize;
};

export type AppSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
  openAtLogin: boolean;
  llm: LlmSettings;
  selection: SelectionSettings;
  /** 用户拖边调整后的面板尺寸（紧凑模式不持久化） */
  panelSizes: PanelSizes;
};

export const DEFAULT_PANEL_SIZES: PanelSizes = {
  chat: { width: 400, height: 520 },
  settings: { width: 400, height: 620 },
  calendar: { width: 360, height: 420 },
  calculator: { width: 320, height: 440 },
  guidance: { width: 400, height: 480 },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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
  panelSizes: {
    chat: { ...DEFAULT_PANEL_SIZES.chat },
    settings: { ...DEFAULT_PANEL_SIZES.settings },
    calendar: { ...DEFAULT_PANEL_SIZES.calendar },
    calculator: { ...DEFAULT_PANEL_SIZES.calculator },
    guidance: { ...DEFAULT_PANEL_SIZES.guidance },
  },
};

function storePath(): string {
  return path.join(app.getPath("userData"), "desktop-pet-settings.json");
}

let cache: AppSettings | null = null;

function mergePanelSizes(partial?: Partial<PanelSizes>): PanelSizes {
  const base = clone(DEFAULT_PANEL_SIZES);
  if (!partial) return base;
  for (const key of Object.keys(base) as (keyof PanelSizes)[]) {
    const p = partial[key];
    if (p && typeof p.width === "number" && typeof p.height === "number") {
      base[key] = { width: Math.round(p.width), height: Math.round(p.height) };
    }
  }
  return base;
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
      panelSizes: mergePanelSizes(parsed.panelSizes),
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
  panelSizes?: Partial<PanelSizes>;
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
    panelSizes: patch.panelSizes
      ? mergePanelSizes({ ...current.panelSizes, ...patch.panelSizes })
      : current.panelSizes,
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
