import type { NimContext } from "./kg-context"

// 답변 후검증(결정론). NIM이 context 밖의 근거·숫자를 만들었는지 확인한다.
//  V1 인용 ID는 모두 context 화이트리스트 안
//  V2 답변의 숫자는 모두 context(또는 질문)에 있는 숫자
//  V3 충돌(contested) claim이 있으면 충돌을 언급
//  V4 insufficient 판정이면 사실 진술 금지(호출부에서 처리)
export interface Violation { code: "unknown_id" | "unsupported_number" | "contested_not_flagged" | "empty_answer" | "missing_citation"; detail: string }
export interface VerifyResult { ok: boolean; violations: Violation[]; citedClaims: string[]; citedRelations: string[]; citedPages: string[] }

// 핸들 인용: [C1] [R3] [P2]  (구형 [C:id] 형식도 인식해 화이트리스트에 없으면 위반 처리)
const CITE = /\[(C|R|P|E|KG)(?::([^\]]+)|(\d+))\]/g
const NUM = /\d+(?:[.,]\d+)*(?:e[+-]?\d+)?/gi

const norm = (n: string) => {
  const v = parseFloat(n.replace(/,/g, ""))
  return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : n
}

function numbersIn(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(NUM)) out.add(norm(m[0]))
  return out
}


// 답변 속 숫자 중 context(또는 질문)에 없는 것. 스트리밍 가드가 추론 문단 검사에도 쓴다.
export function unsupportedNumbers(answer: string, ctx: NimContext): Set<string> {
  // 천 단위 공백 표기("1 892 ch")는 한 숫자(1892)로 본다 — 문서의 "1,892"를 풀어 쓴 것이다.
  const stripped = answer.replace(/(\d) (\d{3})(?!\d)/g, "$1$2").replace(CITE, " ").replace(/^\s*\d+[.)]\s/gm, " ")
  const allowed = numbersIn(JSON.stringify({ ...ctx, answer_constraints: [] }) + " " + ctx.question)
  // 표기 차이 허용: 문서의 "RTCM34"를 답변이 "RTCM 3.4"로 풀어 쓴 경우(마운트포인트·규격 버전 표기)
  for (const m of JSON.stringify(ctx).matchAll(/RTCM[-_ ]?(\d)(\d)(?!\d)/gi)) allowed.add(norm(`${m[1]}.${m[2]}`))
  const unsupported = new Set<string>()
  for (const m of stripped.matchAll(NUM)) {
    const raw = m[0]
    if (/^\d$/.test(raw)) continue // 한 자리 정수(순번·개수 표현)
    if (allowed.has(norm(raw))) continue
    if (derivedFromAllowed(raw, allowed)) continue
    unsupported.add(raw)
  }
  return unsupported
}

// 근거 숫자의 반올림(98.63→98.6)과 단위 환산(10 cm→0.10 m, 892 mm→0.892 m)은 새 사실이 아니므로 허용한다(2026-10-22 운영 평가: 거짓 경고 감소).
// 반올림은 근거가 소수일 때만(정수는 다른 정수로 둔갑할 수 있어 제외), 오차 5% 이내. 환산은 ×100·×1000 계열만.
const RATIOS = [0.01, 100, 0.001, 1000]
function derivedFromAllowed(raw: string, allowed: Set<string>): boolean {
  const v = parseFloat(raw.replace(/,/g, ""))
  if (!Number.isFinite(v) || v === 0) return false
  const dec = (raw.split(".")[1] ?? "").length
  for (const a of allowed) {
    const f = parseFloat(a)
    if (!Number.isFinite(f) || f === 0) continue
    if (!Number.isInteger(f) && Math.abs(v - f) / Math.abs(f) <= 0.05 && norm(f.toFixed(dec)) === norm(raw)) return true
    for (const r of RATIOS) if (Math.abs(v - f * r) <= Math.abs(v) * 1e-9 + 1e-12) return true
  }
  return false
}

// externalCitations: JSON 모드에서 모델이 used_claims·used_relations·used_pages 필드로 명시한 근거 수(화이트리스트로 따로 검증됨)
export function verifyAnswer(answer: string, ctx: NimContext, externalCitations = 0): VerifyResult {
  const violations: Violation[] = []
  if (!answer.trim()) return { ok: false, violations: [{ code: "empty_answer", detail: "답변이 비어 있음" }], citedClaims: [], citedRelations: [], citedPages: [] }

  // V1 인용 ID
  const allowC = new Set(ctx.ids.claims), allowR = new Set(ctx.ids.relations), allowE = new Set(ctx.ids.evidence), allowP = new Set(ctx.ids.pages)
  const citedClaims: string[] = [], citedRelations: string[] = [], citedPages: string[] = []
  for (const m of answer.matchAll(CITE)) {
    const [, kind, rawLong, rawNum] = m
    const id = kind === "E" || kind === "KG" || rawLong ? `${kind}:${(rawLong ?? rawNum).trim()}` : `${kind}${rawNum}`
    if (kind === "C" && !rawLong) { citedClaims.push(id); if (!allowC.has(id)) violations.push({ code: "unknown_id", detail: `claim ${id}` }) }
    else if (kind === "R" && !rawLong) { citedRelations.push(id); if (!allowR.has(id)) violations.push({ code: "unknown_id", detail: `relation ${id}` }) }
    else if (kind === "E") { if (!allowE.has(id.slice(2))) violations.push({ code: "unknown_id", detail: `evidence ${id}` }) }
    else if (kind === "P" && !rawLong) { citedPages.push(id); if (!allowP.has(id)) violations.push({ code: "unknown_id", detail: `page ${id}` }) }
    else if (rawLong && (kind === "C" || kind === "R" || kind === "P")) { violations.push({ code: "unknown_id", detail: `구형 표기 ${kind}:${rawLong} — 핸들(C1·R2·P3)만 허용` }) }
    else if (kind === "KG") { if (!ctx.ontology_entities.some((e) => `KG:${e.id}` === id) && !Object.values(ctx.handleMap).includes(id.slice(3))) violations.push({ code: "unknown_id", detail: id }) }
  }

  // V2 숫자: 인용 표기를 지우고, 목록 번호와 한 자리 정수(순번 표현)는 제외
  const unsupported = unsupportedNumbers(answer, ctx)
  for (const u of unsupported) violations.push({ code: "unsupported_number", detail: u })

  // V2b 인용 누락: 근거가 context에 있는데 답변에 근거 표기([C1]·[R2]·[P3])가 하나도 없으면 어디서 온 내용인지 확인할 수 없다
  // 위키 요약 기반 답변에만 강제한다: 온톨로지 답변은 계약 응답(claims·evidence·ontology.relations)이 근거를 따로 싣는다.
  if ((ctx.basis === "wiki-sourced" || ctx.basis === "ontology-linked") && (ctx.ids.claims.length || ctx.ids.relations.length || ctx.ids.pages.length) && !violations.some((x) => x.code === "unknown_id") && citedClaims.length + citedRelations.length + citedPages.length + externalCitations === 0)
    violations.push({ code: "missing_citation", detail: "근거 표기 없음" })

  // V3 충돌
  if (ctx.verified_claims.some((c) => c.contested) && !/충돌|상이|서로 다른|contested|엇갈/.test(answer)) violations.push({ code: "contested_not_flagged", detail: "충돌 claim이 있는데 답변이 충돌을 언급하지 않음" })

  return { ok: violations.length === 0, violations, citedClaims, citedRelations, citedPages }
}
