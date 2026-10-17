import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { openrouter } from "@openrouter/ai-sdk-provider"

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_NVIDIA_MODEL = "deepseek-ai/deepseek-v4.1-flash"
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5"

/**
 * Selects NVIDIA API Catalog when NVIDIA_NIM_API_KEY is configured.
 * OpenRouter remains the safe fallback for local development and rollback.
 */
// 모델 체인: 주 모델이 첫 글자를 FIRST_CHUNK_MS 안에 안 보내거나 오류(404/410/5xx)면 다음 모델로 넘긴다.
// (2026-10-17 deepseek-v4.1-flash 무응답으로 60초 상한에서 끊기던 문제 대응)
// 환경변수 NVIDIA_NIM_FALLBACK_MODELS(쉼표 구분)로 교체 가능. 비우면 기본 체인.
const DEFAULT_FALLBACKS = ["nvidia/nemotron-3-super-120b-a12b", "openai/gpt-oss-20b"]
const FIRST_CHUNK_MS = Number(process.env.NVIDIA_NIM_FIRST_CHUNK_MS) || 12000
const TOTAL_BUDGET_MS = 50000

function modelChain(): string[] {
  const primary = process.env.NVIDIA_NIM_MODEL || DEFAULT_NVIDIA_MODEL
  const extra = (process.env.NVIDIA_NIM_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean)
  return [...new Set([primary, ...(extra.length ? extra : DEFAULT_FALLBACKS)])]
}

// deepseek 계열은 추론(thinking)을 켠 채 긴 RAG 프롬프트를 받으면 응답이 20~60초까지 늘어난다.
// 기본은 thinking OFF, NVIDIA_NIM_THINKING=on 이면 켠다. (deepseek 이외 모델에는 넣지 않는다)
function withModel(body: Record<string, unknown>, model: string): string {
  const next: Record<string, unknown> = { ...body, model }
  if (model.includes("deepseek") && process.env.NVIDIA_NIM_THINKING !== "on") {
    next.chat_template_kwargs = { thinking: false, ...(body.chat_template_kwargs as object | undefined) }
  }
  if (model.includes("nemotron")) {
    // nemotron은 추론 글자를 먼저 흘려 첫 청크는 빨라도 실제 답이 ~20초 늦는다. 추론을 끈다.
    next.chat_template_kwargs = { enable_thinking: false, ...(body.chat_template_kwargs as object | undefined) }
  }
  return JSON.stringify(next)
}

// 첫 청크를 timeoutMs 안에 받으면 그 청크를 되돌려 붙인 Response를, 아니면 null을 돌려준다.
async function firstChunkOrNull(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  body: string,
  timeoutMs: number,
): Promise<Response | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const outer = init.signal
  const onOuterAbort = () => ctrl.abort()
  outer?.addEventListener("abort", onOuterAbort)
  try {
    const res = await fetch(input, { ...init, body, signal: ctrl.signal })
    if (!res.ok || !res.body) return null
    const reader = res.body.getReader()
    const first = await reader.read() // 타이머가 abort하면 여기서 throw
    clearTimeout(timer)
    if (first.done) return null
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(first.value)
      },
      async pull(c) {
        const r = await reader.read()
        r.done ? c.close() : c.enqueue(r.value)
      },
      cancel: (reason) => reader.cancel(reason),
    })
    return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener("abort", onOuterAbort)
  }
}

const chainFetch: typeof fetch = async (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(init.body)
  } catch {
    return fetch(input, init)
  }
  const chain = modelChain()
  const started = Date.now()
  for (let i = 0; i < chain.length; i++) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started)
    if (left <= 1000) break
    const last = i === chain.length - 1
    const res = await firstChunkOrNull(input, init, withModel(parsed, chain[i]), last ? left : Math.min(FIRST_CHUNK_MS, left))
    if (res) {
      if (i > 0) console.warn(`[ai-model] fallback → ${chain[i]} (attempt ${i + 1})`)
      return res
    }
    console.warn(`[ai-model] ${chain[i]} no first chunk / error → next`)
  }
  throw new Error("모든 AI 모델이 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.")
}

export function wikiModel() {
  const apiKey = process.env.NVIDIA_NIM_API_KEY
  if (apiKey) {
    const nvidia = createOpenAICompatible({
      name: "nvidia-nim",
      baseURL: process.env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL,
      apiKey,
      fetch: chainFetch,
    })
    return nvidia(process.env.NVIDIA_NIM_MODEL || DEFAULT_NVIDIA_MODEL)
  }

  return openrouter(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL)
}
