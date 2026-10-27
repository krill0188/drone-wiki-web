import { NextRequest } from "next/server"
import { requireConsent } from "@/lib/consent"
import { generalTier, generalTierEnabled } from "@/lib/general-tier"

export const maxDuration = 60

// 라벨된 일반 공학 설명(KG_GENERAL=1). 본문 답변과 분리된 호출이며, 자격(차단 목록·질문 유형·계획기 상태)은 여기서 서버가 다시 판정한다 —
// 클라이언트가 보낸 '자격 있음' 표시를 믿지 않는다. 질문 원문은 로그에 남기지 않는다.
const HOUR = 3600_000, CAP = 30
const hits = new Map<string, number[]>()
function allowed(key: string, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < HOUR)
  if (arr.length >= CAP) { hits.set(key, arr); return false }
  arr.push(now); hits.set(key, arr); return true
}

export async function POST(req: NextRequest) {
  const denied = requireConsent(req)
  if (denied) return denied
  if (!generalTierEnabled()) return Response.json({ status: "skipped", reason: "disabled" })
  const body = (await req.json().catch(() => ({}))) as { question?: unknown }
  const question = typeof body.question === "string" ? body.question.trim() : ""
  if (!question || question.length > 300) return Response.json({ status: "skipped", reason: "invalid question" }, { status: 400 })
  const key = req.cookies.get("dw_sid")?.value || req.headers.get("x-forwarded-for") || "anon"
  if (!allowed(key)) return Response.json({ status: "skipped", reason: "rate limited" }, { status: 429 })
  const r = await generalTier(question)
  return Response.json({ status: r.status, reason: r.reason, kind: r.kind, text: r.status === "shown" ? r.text : undefined, ms: r.ms })
}
