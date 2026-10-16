import type { BrowserWindow } from "electron";
import { createLlmClient, LlmError, type ChatMessage } from "@desktop-pet/llm";
import { captureSelectionText } from "./clipboard";
import { abortChat, appendHistoryTurn, notifyChat } from "./chat";
import { loadSettings, SELECTION_MAX_CHARS } from "./store";

export type SelectionAction = "summarize" | "translate";

const SUMMARIZE_SYSTEM =
  "你是桌面宠物助手。请用简体中文对用户给出的文本做简洁摘要，保留关键信息与要点，不要编造。输出只要摘要正文。";

const TRANSLATE_SYSTEM =
  "你是桌面宠物助手。翻译用户给出的文本：若原文主要为中文则译为英文，否则译为简体中文。只输出译文，不要解释。";

function buildUserPrompt(action: SelectionAction, text: string, truncated: boolean): string {
  const note = truncated
    ? `\n\n（提示：原文过长，已截断至前 ${SELECTION_MAX_CHARS} 字。）`
    : "";
  if (action === "summarize") {
    return `请摘要以下文本：\n\n${text}${note}`;
  }
  return `请翻译以下文本：\n\n${text}${note}`;
}

function labelFor(action: SelectionAction): string {
  return action === "summarize" ? "摘要所选" : "翻译所选";
}

let activeAbort: AbortController | null = null;

export function abortSelection(): void {
  activeAbort?.abort();
  activeAbort = null;
}

export async function runSelectionAction(
  win: BrowserWindow,
  action: SelectionAction,
): Promise<{ ok: true } | { ok: false; error: string; needGuidance?: boolean }> {
  const sender = win.webContents;
  const settings = loadSettings();

  if (!settings.selection.guidanceSeen) {
    if (!sender.isDestroyed()) {
      sender.send("selection:show-guidance");
    }
    return { ok: false, error: "请先阅读权限与隐私说明", needGuidance: true };
  }

  if (!settings.llm.apiKey.trim()) {
    const message = "请先在设置中填写 API Key";
    if (!sender.isDestroyed()) {
      sender.send("pet:open-settings");
      sender.send("chat:error", message);
      sender.send("pet:toast", message);
    }
    return { ok: false, error: message };
  }

  const captured = await captureSelectionText({
    simulateCopy: settings.selection.simulateCopy,
    maxChars: SELECTION_MAX_CHARS,
  });

  if (!captured.text) {
    const message = settings.selection.simulateCopy
      ? "未读到选区文本。请先选中文字；若在 macOS，请在「系统设置 → 隐私与安全性 → 辅助功能」中允许本应用（用于模拟复制）。也可先手动复制后再试。"
      : "剪贴板为空。请先选中并复制文字，或在设置中开启「先模拟复制」。";
    if (!sender.isDestroyed()) {
      sender.send("pet:open-chat");
      sender.send("pet:toast", message);
      sender.send("chat:error", message);
    }
    return { ok: false, error: message };
  }

  if (!sender.isDestroyed()) {
    sender.send("pet:open-chat");
  }

  const displayUser = `【${labelFor(action)}】\n${captured.text}${
    captured.truncated ? `\n…（已截断，原文 ${captured.originalLength} 字）` : ""
  }`;

  abortChat();
  abortSelection();
  activeAbort = new AbortController();

  appendHistoryTurn({ role: "user", content: displayUser });
  notifyChat(sender, "user", displayUser);
  if (!sender.isDestroyed()) sender.send("chat:assistant-start");

  try {
    const client = createLlmClient({
      ...settings.llm,
      temperature: Math.min(settings.llm.temperature, 0.4),
    });
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: action === "summarize" ? SUMMARIZE_SYSTEM : TRANSLATE_SYSTEM,
      },
      {
        role: "user",
        content: buildUserPrompt(action, captured.text, captured.truncated),
      },
    ];

    let assembled = "";
    const content = await client.chat(messages, {
      signal: activeAbort.signal,
      onToken: (token) => {
        assembled += token;
        if (!sender.isDestroyed()) sender.send("chat:chunk", token);
      },
    });

    const finalText = (content || assembled).trim() || "（模型返回为空）";
    appendHistoryTurn({ role: "assistant", content: finalText });
    if (!sender.isDestroyed()) sender.send("chat:done", finalText);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof LlmError
        ? err.message
        : err instanceof Error
          ? err.message
          : "未知错误";
    if (!sender.isDestroyed()) sender.send("chat:error", message);
    return { ok: false, error: message };
  } finally {
    activeAbort = null;
  }
}
