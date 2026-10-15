import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { openrouter } from "@openrouter/ai-sdk-provider"

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_NVIDIA_MODEL = "deepseek-ai/deepseek-v4.1-flash"
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5"

/**
 * Selects NVIDIA API Catalog when NVIDIA_NIM_API_KEY is configured.
 * OpenRouter remains the safe fallback for local development and rollback.
 */
// deepseek 계열은 추론(thinking)을 켠 채 긴 RAG 프롬프트를 받으면 응답이 20~60초까지 늘어
// maxDuration(60s)에서 잘린다. 기본은 thinking OFF, NVIDIA_NIM_THINKING=on 이면 켠다.
const thinkingOff: typeof fetch = (input, init) => {
  if (process.env.NVIDIA_NIM_THINKING !== "on" && typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body)
      body.chat_template_kwargs = { thinking: false, ...body.chat_template_kwargs }
      return fetch(input, { ...init, body: JSON.stringify(body) })
    } catch {
      // JSON이 아니면 그대로 전달
    }
  }
  return fetch(input, init)
}

export function wikiModel() {
  const apiKey = process.env.NVIDIA_NIM_API_KEY
  if (apiKey) {
    const nvidia = createOpenAICompatible({
      name: "nvidia-nim",
      baseURL: process.env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL,
      apiKey,
      fetch: thinkingOff,
    })
    return nvidia(process.env.NVIDIA_NIM_MODEL || DEFAULT_NVIDIA_MODEL)
  }

  return openrouter(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL)
}
