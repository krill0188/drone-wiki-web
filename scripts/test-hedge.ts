// 지연 헤징 시험(모의 fetch): 느린 첫 모델 대신 두 번째 모델이 이기는지, 빠른 첫 모델은 헤징하지 않는지, 둘 다 실패하면 다음으로 넘어가는지.
// 실행: NVIDIA_NIM_API_KEY=x NVIDIA_NIM_CHAIN=m-slow,m-fast,m-last NVIDIA_NIM_HEDGE_CHAT_MS=150 npx tsx scripts/test-hedge.ts
process.env.NVIDIA_NIM_CHAIN = "m-slow,m-fast,m-last"
process.env.NVIDIA_NIM_HEDGE_CHAT_MS = "150"
process.env.OPENROUTER_API_KEY = "test-key"

const calls: string[] = []
let aborted: string[] = []
const sse = (txt: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: txt } }] })}\n\ndata: [DONE]\n\n`
const delays: Record<string, number> = { "m-slow": 1500, "m-fast": 20, "m-last": 20 }
let failModels = new Set<string>()

let orFail = false
globalThis.fetch = (async (url: unknown, init: RequestInit) => {
  const model = JSON.parse(String(init.body)).model as string
  calls.push(String(url).includes("openrouter") ? `OR:${model}` : model)
  if (String(url).includes("openrouter")) {
    if (orFail) return new Response("err", { status: 429 })
    return new Response(sse(`from OR ${model}`), { status: 200, headers: { "content-type": "text/event-stream" } })
  }
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, delays[model] ?? 20)
    init.signal?.addEventListener("abort", () => { clearTimeout(t); aborted.push(model); reject(new Error("aborted")) })
  })
  if (failModels.has(model)) return new Response("err", { status: 500 })
  return new Response(sse(`from ${model}`), { status: 200, headers: { "content-type": "text/event-stream" } })
}) as typeof fetch

type R = { name: string; ok: boolean; note: string }
const out: R[] = []
const t = async (name: string, fn: () => Promise<string>) => { try { out.push({ name, ok: true, note: await fn() }) } catch (e) { out.push({ name, ok: false, note: e instanceof Error ? e.message : String(e) }) } }
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m) }

async function main() {
  const { makeChainFetch } = await import("../lib/ai-model")
  const body = JSON.stringify({ messages: [{ role: "user", content: "hi" }], stream: true })
  const run = async () => {
    const t0 = Date.now()
    const r = await makeChainFetch("chat")("https://x/y", { method: "POST", body })
    const txt = await r.text()
    return { txt, ms: Date.now() - t0 }
  }
  await t("H1 느린 첫 모델은 헤징 시간 뒤 두 번째 모델이 이기고 느린 쪽은 취소된다", async () => {
    calls.length = 0; aborted = []
    const { txt, ms } = await run()
    ok(txt.includes("m-fast"), `승자=${txt}`)
    ok(ms < 700, `지연 ${ms}ms (직렬이면 1500ms 이상)`)
    ok(calls[0] === "m-slow" && calls[1] === "m-fast", `호출 순서 ${calls}`)
    ok(aborted.includes("m-slow"), "느린 시도가 취소되지 않음")
    return `${ms}ms`
  })
  await t("H2 첫 모델이 빠르면 헤징하지 않는다", async () => {
    delays["m-slow"] = 20
    calls.length = 0
    const { txt } = await run()
    ok(txt.includes("m-slow") && calls.length === 1, `호출 ${calls}`)
    return "추가 호출 없음"
  })
  await t("H3 헤징 비율이 상한(25%)을 넘으면 헤징을 멈추고 직렬 폴백만 쓴다", async () => {
    delays["m-slow"] = 400
    let hedged = 0
    for (let i = 0; i < 12; i++) { calls.length = 0; await run(); if (calls.length > 1 && calls[1] === "m-fast") hedged++ }
    ok(hedged <= 5, `12회 중 헤징 ${hedged}회`)
    return `12회 중 ${hedged}회`
  })
  await t("H4 두 시도가 모두 실패하면 세 번째 모델로 넘어간다", async () => {
    delays["m-slow"] = 400; failModels = new Set(["m-slow", "m-fast"])
    // 헤징 상한에 걸려 있을 수 있으므로 직렬 경로도 결과가 같아야 한다
    calls.length = 0
    const { txt } = await run()
    ok(txt.includes("m-last"), `승자=${txt} 호출=${calls}`)
    return `호출 ${calls.join(">")}`
  })
  await t("H5 NIM 체인이 모두 실패하면 OpenRouter :free 같은 계열 모델로 넘어간다", async () => {
    failModels = new Set(["m-slow", "m-fast", "m-last"]); delays["m-slow"] = 20; orFail = false
    calls.length = 0
    const { txt } = await run()
    ok(txt.includes("from OR nvidia/") || txt.includes("from OR"), `승자=${txt}`)
    ok(calls.some((c) => c.startsWith("OR:")), `호출 ${calls}`)
    return `호출 ${calls.join(">")}`
  })
  await t("H6 OpenRouter까지 실패하면 스트림 오류 → 근거만 보여 주는 대체 답변으로 바뀐다", async () => {
    failModels = new Set(["m-slow", "m-fast", "m-last"]); orFail = true
    const { streamText } = await import("ai")
    const { wikiModel } = await import("../lib/ai-model")
    const { degradeOnError } = await import("../lib/soften")
    const r = streamText({ model: wikiModel("chat"), prompt: "hi", maxRetries: 0 })
    const rs = r.stream.pipeThrough(degradeOnError(() => "DEGRADED-ANSWER") as unknown as TransformStream<any, any>)
    let text = "", sawError = false
    for await (const p of rs as unknown as AsyncIterable<any>) { if (p.type === "text-delta") text += p.text; if (p.type === "error") sawError = true }
    ok(text.includes("DEGRADED-ANSWER") && !sawError, `text=${text} error=${sawError}`)
    return "오류 대신 대체 답변"
  })
  for (const r of out) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} — ${r.note}`)
  const f = out.filter((r) => !r.ok).length
  console.log(`\nPASS ${out.length - f} · FAIL ${f}`)
  process.exit(f ? 1 : 0)
}
main()
