import { kdbInfo } from "@/lib/kdb"
import { fallbackStat, keyPoolSize, keyPoolStat } from "@/lib/ai-model"
import { consentMode } from "@/lib/consent"

// 운영 점검용 상태 확인(읽기 전용, 비밀값 없음). 배포 직후와 정기 점검(scripts/ops-eval.sh)이 호출한다.
// ok=false(지식 DB 적재 실패)면 503을 돌려 모니터가 바로 잡을 수 있게 한다.
export const dynamic = "force-dynamic"

// ?probe=openrouter : 폴백 경로 점검. 서버 환경의 키로 무료 모델에 1토큰짜리 요청을 보내 상태 코드만 알려 준다(키·응답 본문 비노출).
// 무료 한도(일 50회 등)를 아끼려고 결과를 10분간 캐시한다.
let probeCache: { at: number; result: Record<string, unknown> } | null = null
async function probeOpenRouter(): Promise<Record<string, unknown>> {
  if (probeCache && Date.now() - probeCache.at < 600_000) return { ...probeCache.result, cached: true }
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return { ok: false, reason: "OPENROUTER_API_KEY 없음" }
  const t0 = Date.now()
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "nvidia/nemotron-3-ultra-550b-a55b:free", messages: [{ role: "user", content: "1+1=?" }], max_tokens: 200 }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string; code?: number } }
    const result = { ok: r.ok && Boolean(j.choices?.[0]?.message?.content), status: r.status, ms: Date.now() - t0, errorCode: j.error?.code ?? null, errorMessage: j.error?.message ? String(j.error.message).slice(0, 120) : null }
    probeCache = { at: Date.now(), result }
    return result
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 80) : "fetch failed", ms: Date.now() - t0 }
  }
}

// 경험 로그 저장소(무료 Supabase)는 7일 동안 요청이 없으면 자동 정지되므로, 정기 점검이 이 라우트를 부를 때 가벼운 읽기 요청을 한 번 보내 활성 상태를 유지한다.
// 넣기 전용 키라 데이터는 읽지 않고(빈 응답), 상태 코드만 확인한다.
async function expStorePing(): Promise<{ configured: boolean; ok?: boolean; status?: number }> {
  const url = process.env.EXP_SUPABASE_URL, key = process.env.EXP_SUPABASE_KEY
  if (process.env.EXP_LOG_BACKEND !== "supabase" || !url || !key) return { configured: false }
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/exp_turns?select=id&limit=1`, { headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(4000), cache: "no-store" })
    return { configured: true, ok: r.ok, status: r.status }
  } catch { return { configured: true, ok: false } }
}

export async function GET(req: Request) {
  const probe = new URL(req.url).searchParams.get("probe") === "openrouter" ? await probeOpenRouter() : undefined
  const info = kdbInfo()
  const flags = {
    kgBackend: process.env.KG_BACKEND ?? "json",
    kgTier: process.env.KG_TIER ?? "off",
    builderTier: process.env.BUILDER_TIER ?? "off",
    nimConfigured: keyPoolSize().nim > 0, // 키 값은 노출하지 않고 설정 여부·개수만
    openrouterFallback: keyPoolSize().openrouter > 0,
    keyPool: { ...keyPoolSize(), ...keyPoolStat }, // 등록된 키 개수와 이 인스턴스의 키 전환 횟수
    fallbackUsed: { ...fallbackStat }, // 이 인스턴스에서 OpenRouter 폴백을 쓴 횟수·모델 전부 실패 횟수
    consentMode: consentMode(), // strict | optional | off
    expStore: await expStorePing(), // 경험 로그 저장소 연결·활성 유지 확인
  }
  if (!info.ok) return Response.json({ ok: false, error: String(info.error ?? "kdb load failed"), flags }, { status: 503 })
  const c = info.counts as Record<string, string>
  return Response.json({
    ok: true,
    loadMs: info.loadMs,
    fingerprint: info.fingerprint,
    counts: { documents: Number(c.count_documents ?? 0), claims: Number(c.count_claims ?? 0), products: Number(c.count_products ?? 0), ontologyNodes: Number(c.count_ontology_nodes ?? 0) },
    flags,
    ...(probe ? { openrouterProbe: probe } : {}),
    checkedAt: new Date().toISOString(),
  })
}
