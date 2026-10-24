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
// reason: 추론이 꼭 필요한 호출 전용(2026-10-23 실측: minimax-m3.1-flash 4~8초·4/4 정답, ultra 추론켬 7~33초, glm-5.3-flash 17~47초). 추론 글자가 먼저 나오므로 첫 답변 글자 대기·전체 예산을 길게 둔다.
export type ModelProfile = "chat" | "builder" | "reason"
const REASON_DEFAULT_CHAIN: ModelSpec[] = [
  spec("minimaxai/minimax-m3.1-flash"),
  { id: "nvidia/nemotron-3-ultra-550b-a55b", extra: { chat_template_kwargs: { enable_thinking: true } } },
  spec("z-ai/glm-5.3-flash"),
]
const BUILDER_DEFAULT_CHAIN: ModelSpec[] = [spec("nvidia/nemotron-3-ultra-550b-a55b"), spec("nvidia/nemotron-3.5-lightning-30b-a3b"), spec("openai/gpt-oss-20b")]

function modelChain(profile: ModelProfile = "chat"): ModelSpec[] {
  const envKey = profile === "builder" ? "NVIDIA_NIM_BUILDER_CHAIN" : profile === "reason" ? "NVIDIA_NIM_REASON_CHAIN" : "NVIDIA_NIM_CHAIN"
  const ids = (process.env[envKey] ?? "").split(",").map((m) => m.trim()).filter(Boolean)
  if (!ids.length) return profile === "builder" ? BUILDER_DEFAULT_CHAIN : profile === "reason" ? REASON_DEFAULT_CHAIN : DEFAULT_CHAIN
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
  onStatus?: (status: number) => void,
): Promise<Response | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const outer = init.signal
  const onOuterAbort = () => ctrl.abort()
  outer?.addEventListener("abort", onOuterAbort)
  try {
    const res = await fetch(input, { ...init, body, signal: ctrl.signal })
    onStatus?.(res.status)
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

// 키 풀(2026-10-24): 한 서비스에 키를 여러 개 등록해 두면(NVIDIA_NIM_API_KEYS / OPENROUTER_API_KEYS, 쉼표 구분)
// 한 키가 한도(429)·인증 오류(401/403)·크레딧 소진(402)으로 거절될 때 같은 요청을 다음 키로 다시 보낸다. 거절된 키는 잠시 쉰다.
// 키가 하나뿐이면 예전과 똑같이 동작한다. 키 값은 로그·응답에 남기지 않는다.
const coolUntil = new Map<string, number>()
const splitKeys = (...vals: (string | undefined)[]) => [...new Set(vals.flatMap((v) => (v ?? "").split(",")).map((k) => k.trim()).filter(Boolean))]
const nimKeys = () => splitKeys(process.env.NVIDIA_NIM_API_KEY, process.env.NVIDIA_NIM_API_KEYS)
const orKeys = () => splitKeys(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_API_KEYS)
const isCooling = (k: string) => (coolUntil.get(k) ?? 0) > Date.now()
const coolKey = (k: string, status: number) => coolUntil.set(k, Date.now() + (status === 429 ? 60_000 : 3_600_000))
const keyRejected = (status: number) => status === 429 || status === 401 || status === 402 || status === 403
export const keyPoolSize = () => ({ nim: nimKeys().length, openrouter: orKeys().length })
export const keyPoolStat = { nimRotations: 0, orRotations: 0 }

// 키 풀로 한 번 시도한다. keys가 1개 이하면 헤더를 건드리지 않고 한 번만 보낸다.
async function firstAnswerPooled(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  body: string,
  timeoutMs: number,
  keys: string[],
  kind: "nim" | "or",
): Promise<Response | null> {
  if (keys.length <= 1 && kind === "nim") return firstAnswerOrNull(input, init, body, timeoutMs)
  const order = [...keys.filter((k) => !isCooling(k)), ...keys.filter(isCooling)]
  for (let n = 0; n < order.length; n++) {
    const key = order[n]
    if (n > 0 && isCooling(key)) break // 쉬는 키는 다른 키가 모두 거절된 뒤에도 쓰지 않는다
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${key}`)
    let status = 0
    const res = await firstAnswerOrNull(input, { ...init, headers }, body, timeoutMs, (st) => (status = st))
    if (res) return res
    if (!keyRejected(status)) return null
    coolKey(key, status)
    if (kind === "nim") keyPoolStat.nimRotations++
    else keyPoolStat.orRotations++
    console.warn(`[ai-model] ${kind === "nim" ? "NIM" : "OpenRouter"} 키 거절(status ${status}) → 다음 키 (${n + 1}/${order.length})`)
  }
  return null
}

// 지연 헤징(2026-10-22): 첫 모델이 HEDGE_MS 안에 '첫 답변 글자'를 못 내면 다음 모델을 병렬로 시작해 먼저 글자를 내는 쪽을 쓴다.
// 사용자가 보는 지연은 두 시도의 합이 아니라 min이다. 비용 폭주를 막으려고 한 인스턴스에서 헤징을 (2회 + 요청의 25%)로 제한한다.
// 판정은 응답 헤더가 아니라 첫 답변 글자(content) 기준이다 — 추론 서버는 글자 전에 200 헤더를 먼저 보낸다.
const HEDGE_MS: Record<ModelProfile, number> = { chat: Number(process.env.NVIDIA_NIM_HEDGE_CHAT_MS) || 4000, builder: Number(process.env.NVIDIA_NIM_HEDGE_BUILDER_MS) || 12000, reason: Number(process.env.NVIDIA_NIM_HEDGE_REASON_MS) || 9000 }
const hedgeStat = { requests: 0, hedges: 0 }
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const OPENROUTER_FALLBACK = ["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3.5-lightning:free", "openrouter/free"]
export const fallbackStat = { openrouter: 0, exhausted: 0 } // /api/health에서 폴백 사용 횟수를 본다(인스턴스 단위)
const hedgeAllowed = () => hedgeStat.hedges < 2 + 0.25 * hedgeStat.requests // 토큰 버킷: 처음 2회 여유 + 요청의 25%

export const makeChainFetch = (profile: ModelProfile): typeof fetch => async (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(init.body)
  } catch {
    return fetch(input, init)
  }
  const chain = modelChain(profile)
  const started = Date.now()
  hedgeStat.requests++
  type Attempt = { idx: number; ctrl: AbortController; p: Promise<Response | null> }
  const launch = (idx: number, timeoutMs: number): Attempt => {
    const ctrl = new AbortController()
    const signal = init.signal ? AbortSignal.any([init.signal, ctrl.signal]) : ctrl.signal
    const t0 = Date.now()
    const p = firstAnswerPooled(input, { ...init, signal }, withModel(parsed, chain[idx]), timeoutMs, nimKeys(), "nim")
    // 관측성: 모델별 첫 답변 글자까지의 시간(Vercel 로그에서 체인 순서·헤징 시간을 데이터로 조정한다)
    p.then((r) => console.info(`[ai-model] ttfc model=${chain[idx].id} profile=${profile} ms=${Date.now() - t0} ok=${!!r}`)).catch(() => {})
    return { idx, ctrl, p }
  }
  const budget = (idx: number) => {
    const total = profile === "reason" ? 90000 : TOTAL_BUDGET_MS
    const first = profile === "reason" ? 30000 : FIRST_CONTENT_MS
    const left = total - (Date.now() - started)
    return { left, ms: idx === chain.length - 1 ? left : Math.min(first, left) }
  }
  let i = 0
  while (i < chain.length) {
    const b = budget(i)
    if (b.left <= 1000) break
    const primary = launch(i, b.ms)
    const canHedge = i + 1 < chain.length && hedgeAllowed()
    if (canHedge) {
      const early = await Promise.race([primary.p.then((r) => ({ r })), new Promise<null>((ok) => setTimeout(() => ok(null), HEDGE_MS[profile]))])
      if (early) {
        if (early.r) return early.r
        console.warn(`[ai-model] ${chain[i].id} no answer / error → next`)
        i++
        continue
      }
      // 헤징: 다음 모델을 병렬로 시작한다
      hedgeStat.hedges++
      const hb = budget(i + 1)
      const hedge = launch(i + 1, hb.ms)
      const winner = await new Promise<{ a: Attempt; res: Response } | null>((resolve) => {
        let pending = 2
        for (const a of [primary, hedge]) a.p.then((res) => { if (res) resolve({ a, res }); else if (--pending === 0) resolve(null) })
      })
      if (winner) {
        const loser = winner.a === primary ? hedge : primary
        loser.ctrl.abort()
        loser.p.then((r) => r?.body?.cancel().catch(() => {})).catch(() => {})
        console.warn(`[ai-model] hedge winner → ${chain[winner.a.idx].id}`)
        return winner.res
      }
      i += 2
      continue
    }
    const res = await primary.p
    if (res) {
      if (i > 0) console.warn(`[ai-model] fallback → ${chain[i].id} (attempt ${i + 1})`)
      return res
    }
    console.warn(`[ai-model] ${chain[i].id} no answer / error → next`)
    i++
  }
  // NIM 체인 소진 → OpenRouter 무료(:free) 같은 계열 모델로 마지막 시도(2026-10-23). 같은 모델을 다른 경로·다른 한도 풀로 쓴다.
  // 계정 공통 한도(분당 20회, 크레딧 없으면 일 50회)라 비상용이다. 키가 없거나 이것도 실패하면 호출부의 '모델 없는 근거 답변'이 받는다.
  const orKeyList = orKeys()
  if (orKeyList.length > 0) {
    for (const m of OPENROUTER_FALLBACK) {
      const body = JSON.stringify({ ...parsed, model: m })
      const res = await firstAnswerPooled(OPENROUTER_URL, init, body, 25000, orKeyList, "or")
      if (res) { console.warn(`[ai-model] OpenRouter 폴백 사용 → ${m}`); fallbackStat.openrouter++; return res }
      console.warn(`[ai-model] OpenRouter ${m} no answer / error`)
    }
  }
  fallbackStat.exhausted++
  throw new Error("모든 AI 모델이 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.")
}

export function wikiModel(profile: ModelProfile = "chat") {
  const apiKey = nimKeys()[0]
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
