import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { openrouter } from "@openrouter/ai-sdk-provider"

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_NVIDIA_MODEL = "deepseek-ai/deepseek-v4.1-flash"
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5"

/**
 * Selects NVIDIA API Catalog when NVIDIA_NIM_API_KEY is configured.
 * OpenRouter remains the safe fallback for local development and rollback.
 */
export function wikiModel() {
  const apiKey = process.env.NVIDIA_NIM_API_KEY
  if (apiKey) {
    const nvidia = createOpenAICompatible({
      name: "nvidia-nim",
      baseURL: process.env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL,
      apiKey,
    })
    return nvidia(process.env.NVIDIA_NIM_MODEL || DEFAULT_NVIDIA_MODEL)
  }

  return openrouter(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL)
}
