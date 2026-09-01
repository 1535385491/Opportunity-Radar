/**
 * DeepSeek provider — OpenAI-compatible endpoint via api.deepseek.com.
 *
 * Env vars:
 *   DEEPSEEK_API_KEY  - API key
 *   DEEPSEEK_MODEL    - model name (default: deepseek-chat)
 */

import { OpenAICompatibleProvider } from "./openai-compatible.ts";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly name = "deepseek";

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env["DEEPSEEK_API_KEY"];
    if (!apiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY for DeepSeek provider");
    }

    super({
      apiKey,
      baseURL: DEEPSEEK_BASE_URL,
      model: opts?.model ?? process.env["DEEPSEEK_MODEL"] ?? "deepseek-chat",
    });
  }
}
