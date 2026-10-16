/**
 * OpenAI 兼容 HTTP 客户端（阶段 C）。
 * 支持 chat/completions 流式与非流式；失败可读中文错误 + 有限重试。
 */

export type LlmConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamHandlers = {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
};

export class LlmError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { code: string; status?: number; retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "LlmError";
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export type LlmClient = {
  chat: (messages: ChatMessage[], handlers?: StreamHandlers) => Promise<string>;
};

const DEFAULT_SYSTEM =
  "你是一只可爱的中文桌面宠物助手。回答简洁、友好、口语化，默认使用简体中文。";

function normalizeBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, "");
  if (!trimmed) return "https://api.deepseek.com/v1";
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function mapHttpError(status: number, bodyText: string): LlmError {
  let detail = bodyText.slice(0, 240).trim();
  try {
    const json = JSON.parse(bodyText) as { error?: { message?: string } };
    if (json.error?.message) detail = json.error.message;
  } catch {
    // keep raw
  }

  if (status === 401 || status === 403) {
    return new LlmError(`API Key 无效或无权限：${detail || status}`, {
      code: "auth",
      status,
      retryable: false,
    });
  }
  if (status === 429) {
    return new LlmError(`请求过于频繁，请稍后再试：${detail || status}`, {
      code: "rate_limit",
      status,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new LlmError(`服务暂时不可用（${status}）：${detail || "服务器错误"}`, {
      code: "server",
      status,
      retryable: true,
    });
  }
  return new LlmError(`请求失败（${status}）：${detail || "未知错误"}`, {
    code: "http",
    status,
    retryable: status >= 500,
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LlmError("已取消请求", { code: "aborted", retryable: false }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new LlmError("已取消请求", { code: "aborted", retryable: false }));
      },
      { once: true },
    );
  });
}

function mergeAbortSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });

  if (external?.aborted) controller.abort();

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new LlmError("已取消请求", { code: "aborted", retryable: false });
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const token =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.message?.content ??
            "";
          if (token) {
            full += token;
            onToken?.(token);
          }
        } catch {
          // skip malformed chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return full;
}

export function createLlmClient(config: LlmConfig): LlmClient {
  const apiKey = config.apiKey.trim();
  const baseURL = normalizeBaseURL(config.baseURL || "https://api.deepseek.com/v1");
  const model = (config.model || "deepseek-chat").trim();
  const temperature = config.temperature ?? 0.7;

  if (!apiKey) {
    throw new LlmError("请先在设置中填写 API Key", {
      code: "missing_key",
      retryable: false,
    });
  }

  const chatOnce = async (
    messages: ChatMessage[],
    handlers: StreamHandlers | undefined,
    stream: boolean,
  ): Promise<string> => {
    const url = `${baseURL}/chat/completions`;
    const payload = {
      model,
      temperature,
      stream,
      messages: [
        { role: "system", content: DEFAULT_SYSTEM },
        ...messages.filter((m) => m.role !== "system"),
      ],
    };

    const REQUEST_TIMEOUT_MS = 20_000;
    const { signal, cleanup } = mergeAbortSignals(handlers?.signal, REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      cleanup();
      if (handlers?.signal?.aborted) {
        throw new LlmError("已取消请求", { code: "aborted", retryable: false });
      }
      if (signal.aborted) {
        throw new LlmError("请求超时，请检查网络、Base URL 或 API Key", {
          code: "timeout",
          retryable: true,
          cause: err,
        });
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new LlmError(`网络错误，请检查网络或 baseURL：${msg}`, {
        code: "network",
        retryable: true,
        cause: err,
      });
    }
    cleanup();

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw mapHttpError(response.status, text);
    }

    if (stream && response.body) {
      const full = await parseSseStream(response.body, handlers?.onToken, handlers?.signal);
      if (full) return full;
      // 部分代理声称 stream 却无正文 → 回退非流式
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (content && handlers?.onToken) handlers.onToken(content);
    return content;
  };

  return {
    async chat(messages, handlers) {
      // 超时/鉴权失败不反复重试，避免长时间挂起
      const maxAttempts = 2;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          try {
            return await chatOnce(messages, handlers, true);
          } catch (err) {
            // 流式不被支持时回退
            if (
              err instanceof LlmError &&
              err.status === 400 &&
              /stream/i.test(err.message)
            ) {
              return await chatOnce(messages, handlers, false);
            }
            throw err;
          }
        } catch (err) {
          lastError = err;
          const retryable =
            err instanceof LlmError
              ? err.retryable && err.code !== "timeout" && err.code !== "auth"
              : true;
          if (!retryable || attempt === maxAttempts) break;
          await sleep(400 * attempt, handlers?.signal);
        }
      }

      if (lastError instanceof LlmError) throw lastError;
      throw new LlmError(
        `调用失败：${lastError instanceof Error ? lastError.message : String(lastError)}`,
        { code: "unknown", retryable: false, cause: lastError },
      );
    },
  };
}

export function maskApiKey(key: string): string {
  const t = key.trim();
  if (t.length <= 8) return t ? "••••" : "";
  return `${t.slice(0, 3)}…${t.slice(-4)}`;
}
