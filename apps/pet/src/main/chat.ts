import { createLlmClient, LlmError, type ChatMessage } from "@desktop-pet/llm";
import { loadSettings } from "./store";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const sessionHistory: ChatTurn[] = [];
let activeAbort: AbortController | null = null;

export function getChatHistory(): ChatTurn[] {
  return sessionHistory.map((t) => ({ ...t }));
}

export function clearChatHistory(): void {
  sessionHistory.length = 0;
}

export function appendHistoryTurn(turn: ChatTurn): void {
  sessionHistory.push({ ...turn });
}

export function notifyChat(
  sender: Electron.WebContents,
  kind: "user",
  text: string,
): void {
  if (!sender.isDestroyed()) sender.send("chat:user", text);
}

export function abortChat(): void {
  activeAbort?.abort();
  activeAbort = null;
}

export async function sendChatMessage(
  sender: Electron.WebContents,
  userText: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const text = userText.trim();
  if (!text) {
    return { ok: false, error: "请输入内容" };
  }

  const settings = loadSettings().llm;
  if (!settings.apiKey.trim()) {
    const message = "请先在设置中填写 API Key";
    if (!sender.isDestroyed()) sender.send("chat:error", message);
    return { ok: false, error: message };
  }

  abortChat();
  activeAbort = new AbortController();

  sessionHistory.push({ role: "user", content: text });
  if (!sender.isDestroyed()) {
    sender.send("chat:user", text);
    sender.send("chat:assistant-start");
  }

  try {
    const client = createLlmClient(settings);
    const messages: ChatMessage[] = sessionHistory.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    let assembled = "";
    const content = await client.chat(messages, {
      signal: activeAbort.signal,
      onToken: (token) => {
        assembled += token;
        if (!sender.isDestroyed()) sender.send("chat:chunk", token);
      },
    });

    const finalText = (content || assembled).trim() || "（模型返回为空）";
    sessionHistory.push({ role: "assistant", content: finalText });
    if (!sender.isDestroyed()) sender.send("chat:done", finalText);
    return { ok: true, content: finalText };
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
