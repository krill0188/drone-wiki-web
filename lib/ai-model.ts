import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { openrouter } from "@openrouter/ai-sdk-provider"

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5"

/**
 * Selects NVIDIA API Catalog when NVIDIA_NIM_API_KEY is configured.
 * OpenRouter remains the safe fallback for local development and rollback.
 */
// 모델 체인(2026-10-17 순차 실측 기반): 실제 설계 프롬프트(1.8만 자)에서
//   gpt-oss-20b + reasoning_effort=low → 첫 답 1.7초 / 완료 30초 (추론 짧게 있음)
//   nemotron-3-super + 추론 끔        → 첫 답 1.1초 / 완료 44초
// deepseek-v4.1-flash·glm-5.3-flash·step-5(추론 끔 제외)·laguna 는 무응답/미작동/느림으로 제외.
// 판정 기준은 "추론 글자"가 아니라 "첫 답변 글자(content)" — 추론이 길어지면 다음 모델로 넘긴다.
type ModelSpec = { id: string; extra: Record<string, unknown> }
// 2026-10-20: nvidia/nemotron-3-super-120b-a12b 가 NVIDIA 쪽에서 404("Function not found for account")로 내려갔다(모델 목록에는 남아 있음).
// 같은 NIM의 nemotron-3.5-lightning(0.9초)·nemotron-3-ultra(4초)로 대체하고, 추론은 끈다(켜면 content가 비어 무응답으로 판정됨).
const NO_THINK = { chat_template_kwargs: { enable_thinking: false } }
const KNOWN_EXTRA: Record<string, Record<string, unknown>> = {
  "openai/gpt-oss-20b": { reasoning_effort: "low" },
  "nvidia/nemotron-3.5-lightning-30b-a3b": NO_THINK,
  "nvidia/nemotron-3-ultra-550b-a55b": NO_THINK,
  "nvidia/nemotron-3-super-120b-a12b": NO_THINK,
}
const spec = (id: string): ModelSpec => ({ id, extra: KNOWN_EXTRA[id] ?? {} })
const DEFAULT_CHAIN: ModelSpec[] = [spec("nvidia/nemotron-3.5-lightning-30b-a3b"), spec("nvidia/nemotron-3-ultra-550b-a55b"), spec("openai/gpt-oss-20b")]
const FIRST_CONTENT_MS = Number(process.env.NVIDIA_NIM_FIRST_CONTENT_MS) || 15000
const TOTAL_BUDGET_MS = 50000 // 전환 판단에 쓰는 시간 예산(응답 전체 한도는 라우트 maxDuration 120초)

// NVIDIA_NIM_CHAIN(쉼표 구분 모델 id)을 주면 그 순서로, 없으면 기본 체인. 옛 NVIDIA_NIM_MODEL 값은 무시한다.
// 드론 빌더 전용 체인은 NVIDIA_NIM_BUILDER_CHAIN(없으면 BUILDER_DEFAULT_CHAIN). 빌더는 300초 한도라 느려도 큰 모델을 먼저 쓴다.
export type ModelProfile = "chat" | "builder"
const BUILDER_DEFAULT_CHAIN: ModelSpec[] = [spec("nvidia/nemotron-3-ultra-550b-a55b"), spec("nvidia/nemotron-3.5-lightning-30b-a3b"), spec("openai/gpt-oss-20b")]

function modelChain(profile: ModelProfile = "chat"): ModelSpec[] {
  const envKey = profile === "builder" ? "NVIDIA_NIM_BUILDER_CHAIN" : "NVIDIA_NIM_CHAIN"
  const ids = (process.env[envKey] ?? "").split(",").map((m) => m.trim()).filter(Boolean)
  if (!ids.length) return profile === "builder" ? BUILDER_DEFAULT_CHAIN : DEFAULT_CHAIN
  return ids.map(spec)
}

function withModel(body: Record<string, unknown>, spec: ModelSpec): string {
  return JSON.stringify({ ...body, ...spec.extra, model: spec.id })
}

// SSE 청크에 실제 답변(content) 또는 도구 호출이 들어 있는지 본다. 추론(reasoning) 글자는 세지 않는다.
function hasAnswer(sseText: string): boolean {
  for (const line of sseText.split("\n")) {
    if (!line.startsWith("data:") || line.includes("[DONE]")) continue
    try {
      const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta
      if (delta?.content || delta?.tool_calls) return true
    } catch {
      // 청크 경계에서 잘린 줄은 다음 청크와 합쳐져 다시 검사된다
    }
  }
  return false
}

// 첫 "답변" 글자를 timeoutMs 안에 받으면 지금까지 읽은 청크를 되돌려 붙인 Response를, 아니면 null을 돌려준다.
async function firstAnswerOrNull(
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
    const decoder = new TextDecoder()
    const buffered: Uint8Array[] = []
    let text = ""
    let ended = false
    while (!hasAnswer(text)) {
      const r = await reader.read() // 타이머가 abort하면 여기서 throw
      if (r.done) {
        ended = true
        break
      }
      buffered.push(r.value)
      text += decoder.decode(r.value, { stream: true })
    }
    clearTimeout(timer)
    if (ended && !hasAnswer(text)) return null
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of buffered) c.enqueue(chunk)
        if (ended) c.close()
      },
      async pull(c) {
        if (ended) return
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

const makeChainFetch = (profile: ModelProfile): typeof fetch => async (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(init.body)
  } catch {
    return fetch(input, init)
  }
  const chain = modelChain(profile)
  const started = Date.now()
  for (let i = 0; i < chain.length; i++) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started)
    if (left <= 1000) break
    const last = i === chain.length - 1
    const res = await firstAnswerOrNull(input, init, withModel(parsed, chain[i]), last ? left : Math.min(FIRST_CONTENT_MS, left))
    if (res) {
      if (i > 0) console.warn(`[ai-model] fallback → ${chain[i].id} (attempt ${i + 1})`)
      return res
    }
    console.warn(`[ai-model] ${chain[i].id} no answer / error → next`)
  }
  throw new Error("모든 AI 모델이 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.")
}

export function wikiModel(profile: ModelProfile = "chat") {
  const apiKey = process.env.NVIDIA_NIM_API_KEY
  if (apiKey) {
    const nvidia = createOpenAICompatible({
      name: "nvidia-nim",
      baseURL: process.env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL,
      apiKey,
      fetch: makeChainFetch(profile),
    })
    return nvidia(modelChain(profile)[0].id)
  }

  return openrouter(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL)
}
