import { NextRequest, NextResponse } from "next/server"
import { gzipSync } from "zlib"
import { createHash } from "crypto"
import { consentMode, hasConsent, isTestTraffic, CONSENT_VERSION } from "@/lib/consent"
import { getBackend } from "@/lib/exp-log"
import { maskText } from "@/lib/mask"
import { parseSpec } from "@/lib/design-gate"
import { parseFinalSpec } from "@/lib/final-spec"

// 완성(또는 종료)한 설계 사례 저장(2026-10-25). 동의한 사용자만, 마스킹 후, 구조화된 요약 + 압축 마크다운으로 저장한다.
// '완성'은 승인된 설계일 뿐 실기 비행 검증이 아니다 — outcome과 verification 필드로 구분한다.
export const maxDuration = 20
type StageIn = { status?: string; text?: string; rejections?: { reason?: string }[] }
const KEYS = ["proposal", "hw", "sw", "techspec", "architecture", "implementation"] as const

export async function POST(req: NextRequest) {
  if (consentMode() === "off" || !hasConsent(req.cookies)) return NextResponse.json({ ok: false, stored: false, reason: "no_consent" })
  const sid = req.cookies.get("dw_sid")?.value ?? ""
  if (!sid) return NextResponse.json({ ok: false, stored: false, reason: "no_session" })
  const body = (await req.json().catch(() => null)) as { concept?: string; stages?: Record<string, StageIn>; closedAt?: string | null; outcome?: string } | null
  if (!body?.concept || !body.stages) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 })

  const stages = body.stages
  const approved = KEYS.filter((k) => stages[k]?.status === "approved" && stages[k]?.text)
  if (!approved.length) return NextResponse.json({ ok: false, stored: false, reason: "nothing_approved" })

  const concept = maskText(body.concept, 800)
  const md = approved.map((k) => `## ${k}\n\n${maskText(stages[k]!.text!, 20000).slice(0, 20000)}`).join("\n\n")
  const spec = parseSpec(body.concept)
  const fin = parseFinalSpec(stages.techspec?.text ?? "")
  const gateText = `${stages.hw?.text ?? ""}\n${stages.techspec?.text ?? ""}`
  const gate = { fail: (gateText.match(/🔴 불합격/g) ?? []).length, review: (gateText.match(/🟡 확인 필요/g) ?? []).length, pass: (gateText.match(/🟢 통과/g) ?? []).length }
  const rejections = KEYS.flatMap((k) => (stages[k]?.rejections ?? []).map((r) => ({ stage: k, reason: maskText(r.reason ?? "", 300) }))).filter((r) => r.reason)
  const outcome = ["final", "closed", "rejected_end"].includes(body.outcome ?? "") ? body.outcome! : "final"
  const runHash = createHash("sha256").update(`${sid}|${concept}|${stages.proposal?.text?.slice(0, 200) ?? ""}`).digest("hex").slice(0, 32)

  const row = {
    session_id: sid, run_hash: runHash, concept, inputs: { payloadKg: spec.payloadKg ?? null, rangeKm: spec.rangeKm ?? null, sizeMm: spec.sizeMm ?? null, flightMin: spec.flightMin ?? null, rotors: spec.rotors, platform: spec.platform },
    final_spec: fin.fields, gate_summary: gate, approved_stages: approved, closed_at: body.closedAt ?? null, outcome,
    rejections, verification: "analytic-gates-only", markdown_gz_b64: gzipSync(Buffer.from(md, "utf8")).toString("base64"), md_chars: md.length,
    is_test: isTestTraffic(req), consent_version: CONSENT_VERSION,
  }
  try { await getBackend().insert("exp_design_cases", row, { upsertOn: "session_id,run_hash" }) } catch { return NextResponse.json({ ok: true, stored: false, reason: "backend_error" }) }
  return NextResponse.json({ ok: true, stored: true })
}
