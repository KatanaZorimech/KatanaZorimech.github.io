/**
 * LLM 客户端占位 — 阶段 C 实现。
 * 计划：用户自备 OpenAI 兼容 API Key + 可配置 baseURL / model。
 */
export type LlmConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

export function createLlmClient(_config: LlmConfig): never {
  throw new Error("LLM 客户端将在阶段 C 实现");
}
