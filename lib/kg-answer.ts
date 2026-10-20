import { streamText } from "ai"
import { wikiModel } from "./ai-model"
import { buildNimContext, nimSystemPrompt, type NimContext } from "./kg-context"
import { planQuery, type Plan } from "./kg-plan"
import { verifyAnswer, type Violation } from "./kg-verify"

// 온톨로지 지식그래프 기반 답변 서비스(JSON 계약). 판정·근거·상태는 서버가 정하고 NIM은 표현만 한다.
export interface KgAnswer {
  answer: string
  domain: string[]
  ontology: {
    classes: string[]
    entities: { id: string; label: string; class: string }[]
    relations: { id: string; subject: string; predicate: string; object: string; status: string; confidence: string }[]
  }
  claims: { id: string; subject: string; predicate: string; value: string; status: string; confidence: string; evidence_kind: string; contested: boolean; origin: string }[]
  evidence: { source_path: string; source_url: string; locator: string; quote: string; claim_id: string; verified: boolean }[]
  canonical_pages: { path: string; title: string; domain: string | null }[]
  confidence: "high" | "medium" | "low"
  contested: boolean
  blocked: boolean
  status: "answered" | "insufficient_evidence" | "unverified"
  limitations: string[]
  verification: { ok: boolean; violations: Violation[]; retried: boolean; json_parsed?: boolean }
  suggestions: string[]
  nim_called: boolean
}

export type Generate = (system: string, prompt: string) => Promise<string>

// 기존 NIM 모델 체인(lib/ai-model.ts)은 SSE 스트림 응답으로 '첫 답변 글자'를 판정하므로 스트리밍으로 호출하고 전체 텍스트를 모은다.
const nimGenerate: Generate = async (system, prompt) => {
  // context가 약 14KB로 크다: 실측(2026-10-20)에서 gpt-oss-20b는 첫 답까지 9~12초(무응답 폴백 시 15초 추가), nemotron은 0.4초라 빌더용 체인(nemotron 우선)을 쓴다.
  const r = streamText({ model: wikiModel("builder"), system, prompt, temperature: 0 })
  return await r.text
}

function parseJson(text: string): { answer: string; used_claims?: string[]; used_relations?: string[]; used_pages?: string[] } | null {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const i = t.indexOf("{"), j = t.lastIndexOf("}")
  if (i < 0 || j <= i) return null
  try {
    const o = JSON.parse(t.slice(i, j + 1))
    return typeof o.answer === "string" ? o : null
  } catch { return null }
}

function contract(plan: Plan, ctx: NimContext | null, answer: string, status: KgAnswer["status"], blocked: boolean, ver: KgAnswer["verification"], used: { claims: string[]; relations: string[]; pages: string[] }, nim: boolean): KgAnswer {
  const wantClaims = used.claims.length ? plan.claims.filter((c) => used.claims.includes(c.id)) : plan.claims.filter((c) => c.origin !== "wiki").slice(0, 8)
  const wantRels = used.relations.length ? plan.relations.filter((r) => used.relations.includes(r.id)) : plan.relations.slice(0, 8)
  const claimIds = new Set(wantClaims.map((c) => c.id))
  const conf: KgAnswer["confidence"] = status === "answered" ? plan.confidence : "low"
  return {
    answer,
    domain: plan.domainFilter,
    ontology: {
      classes: plan.classes,
      entities: plan.entities.map((e) => ({ id: e.id, label: e.label, class: e.cls })),
      relations: wantRels.map((r) => ({ id: r.id, subject: r.subjectLabel, predicate: r.predicate, object: r.objectLabel, status: r.status, confidence: r.confidence })),
    },
    claims: wantClaims.map((c) => ({ id: c.id, subject: c.subjectText || c.subject, predicate: c.predicate, value: c.value, status: c.status, confidence: c.confidence, evidence_kind: c.evidenceKind, contested: c.contested, origin: c.origin })),
    evidence: plan.evidence.filter((e) => claimIds.has(e.claimId)).map((e) => ({ source_path: e.sourcePath, source_url: e.sourceUrl, locator: e.locator, quote: e.quote, claim_id: e.claimId, verified: e.verified })),
    canonical_pages: plan.pages.filter((p) => !used.pages.length || used.pages.includes(p.path)).map((p) => ({ path: p.path, title: p.title, domain: p.domain })),
    confidence: conf,
    contested: plan.contested,
    blocked,
    status,
    limitations: ctx ? ctx.limitations : plan.limitations,
    verification: ver,
    suggestions: plan.suggestions,
    nim_called: nim,
  }
}

export function insufficientMessage(plan: Plan): string {
  const wiki = plan.pages.length ? ` 참고로 관련 위키 문서 ${plan.pages.length}건이 있으나 보강 자료일 뿐이라 확정 답변의 근거로 쓰지 않았습니다(${plan.pages.slice(0, 3).map((p) => p.title).join(", ")}).` : ""
  const sug = plan.suggestions.length ? ` 이런 질문은 답할 수 있습니다: ${plan.suggestions.join(" / ")}` : ""
  return `이 질문은 아직 지식그래프에 검증된 근거가 없습니다.${wiki}${sug}`
}

export async function answerQuestion(question: string, opts: { domains?: string[]; strict?: boolean; generate?: Generate } = {}): Promise<KgAnswer> {
  const strict = opts.strict !== false
  const gen = opts.generate ?? nimGenerate
  const plan = planQuery(question, { domains: opts.domains })
  const none = { claims: [] as string[], relations: [] as string[], pages: [] as string[] }
  if (plan.status !== "ready") {
    return contract(plan, null, insufficientMessage(plan), "insufficient_evidence", false, { ok: true, violations: [], retried: false }, none, false)
  }
  const ctx = buildNimContext(plan)
  const system = nimSystemPrompt(ctx, "json")
  let retried = false
  let text = await gen(system, question)
  let parsed = parseJson(text)
  let answer = parsed?.answer ?? text
  let ver = verifyAnswer(answer, ctx)
  if (!ver.ok) {
    retried = true
    const fix = `\n\n# 서버 검증 위반 (코드가 판정한 사실 — 반드시 고쳐서 다시 쓴다)\n<previous-answer>\n${answer.slice(0, 4000)}\n</previous-answer>\n위반: ${ver.violations.map((v) => `${v.code}(${v.detail})`).join(", ")}\ncontext에 없는 숫자·ID·내용을 모두 빼고, context에 있는 내용으로만 다시 쓴다.`
    text = await gen(system + fix, question)
    parsed = parseJson(text)
    answer = parsed?.answer ?? text
    ver = verifyAnswer(answer, ctx)
  }
  const real = (hs: string[], allow: string[]) => [...new Set(hs)].filter((h) => allow.includes(h)).map((h) => ctx.handleMap[h])
  const used = {
    claims: real([...(parsed?.used_claims ?? []), ...ver.citedClaims], ctx.ids.claims),
    relations: real([...(parsed?.used_relations ?? []), ...ver.citedRelations], ctx.ids.relations),
    pages: real([...(parsed?.used_pages ?? []), ...ver.citedPages], ctx.ids.pages),
  }
  const verification = { ok: ver.ok, violations: ver.violations, retried, json_parsed: parsed !== null }
  if (ver.ok) return contract(plan, ctx, answer, "answered", false, verification, used, true)
  if (strict) {
    const msg = `검증에 실패해 답변을 제공하지 않습니다(근거 밖 내용 감지: ${ver.violations.map((v) => v.code).join(", ")}). 아래 근거 목록만 확인해 주세요.`
    return contract(plan, ctx, msg, "unverified", true, verification, used, true)
  }
  return contract(plan, ctx, answer, "unverified", false, verification, used, true)
}

// 스트리밍 채팅용: 이미 흘려보낸 답변 텍스트를 사후 검증해 JSON 계약 메타를 만든다(차단이 아니라 경고 — 이미 전송된 텍스트는 되돌릴 수 없다).
export function metaForStreamed(plan: Plan, ctx: NimContext, text: string): KgAnswer {
  const ver = verifyAnswer(text, ctx)
  const real = (hs: string[], allow: string[]) => [...new Set(hs)].filter((h) => allow.includes(h)).map((h) => ctx.handleMap[h])
  const used = { claims: real(ver.citedClaims, ctx.ids.claims), relations: real(ver.citedRelations, ctx.ids.relations), pages: real(ver.citedPages, ctx.ids.pages) }
  return contract(plan, ctx, text, ver.ok ? "answered" : "unverified", false, { ok: ver.ok, violations: ver.violations, retried: false }, used, true)
}
