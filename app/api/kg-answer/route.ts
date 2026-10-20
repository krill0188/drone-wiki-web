import { NextRequest } from "next/server"
import { answerQuestion } from "@/lib/kg-answer"
import { kdbInfo } from "@/lib/kdb"
import { planQuery } from "@/lib/kg-plan"

export const maxDuration = 120

// 온톨로지 지식그래프 기반 답변 API (JSON 계약). 신규 엔드포인트라 기존 화면·API에 영향이 없다.
//  POST { question, domain?: string[], strict?: boolean(기본 true), dry_run?: boolean }
//  dry_run=true 이면 NIM을 호출하지 않고 질의 계획(개체·관계·claim·근거·한계)만 돌려준다.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { question?: string; domain?: string[]; strict?: boolean; dry_run?: boolean }
  const question = body.question?.trim()
  if (!question) return Response.json({ error: "question required" }, { status: 400 })
  const info = kdbInfo()
  if (!info.ok) return Response.json({ error: "knowledge db unavailable", detail: info.error }, { status: 503 })
  if (body.dry_run) {
    const plan = planQuery(question, { domains: body.domain })
    return Response.json({ dry_run: true, status: plan.status, confidence: plan.confidence, contested: plan.contested, plan })
  }
  try {
    return Response.json(await answerQuestion(question, { domains: body.domain, strict: body.strict }))
  } catch (e) {
    return Response.json({ error: "answer failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET() {
  const info = kdbInfo()
  return Response.json({ ok: info.ok, ...(info.ok ? { fingerprint: info.fingerprint, loadMs: info.loadMs } : { error: info.error }) })
}
