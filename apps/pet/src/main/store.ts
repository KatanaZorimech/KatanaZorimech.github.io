import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type LlmSettings = {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
};

export type AppSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
  llm: LlmSettings;
};

const DEFAULTS: AppSettings = {
  alwaysOnTop: true,
  sfxEnabled: false,
  llm: {
    apiKey: "",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.7,
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
      llm: {
        ...DEFAULTS.llm,
        ...(parsed.llm ?? {}),
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
  llm?: Partial<LlmSettings>;
}): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    alwaysOnTop: patch.alwaysOnTop ?? current.alwaysOnTop,
    sfxEnabled: patch.sfxEnabled ?? current.sfxEnabled,
    llm: {
      ...current.llm,
      ...(patch.llm ?? {}),
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

export function getPublicSettings(): AppSettings & { llm: LlmSettings & { apiKeyMasked: string } } {
  const s = loadSettings();
  const key = s.llm.apiKey;
  const apiKeyMasked =
    key.length === 0 ? "" : key.length <= 8 ? "••••" : `${key.slice(0, 3)}…${key.slice(-4)}`;
  return {
    ...s,
    llm: {
      ...s.llm,
      // 回传完整 key 以便设置页编辑；另附 masked 供展示
      apiKeyMasked,
    },
  };
}
