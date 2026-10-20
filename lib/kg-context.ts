import { all } from "./kdb"
import type { Plan } from "./kg-plan"

// 질의 계획 → NVIDIA NIM에 전달하는 구조화 context. NIM은 표현만 담당하고, 사실·상태·신뢰도는 서버(SQLite)가 정한다.
export const ANSWER_CONSTRAINTS = [
  "제공된 ontology와 evidence 밖의 사실을 생성하지 말 것",
  "근거 없는 주장은 사실처럼 표현하지 말 것",
  "충돌하는 claim은 양쪽을 표시할 것",
  "근거가 부족하면 답변을 blocked 또는 insufficient_evidence로 표시할 것",
  "discovery graph를 검증된 근거로 사용하지 말 것",
  "context에 없는 숫자·제품명·날짜·계산 결과를 만들지 말 것",
  "evidence_kind가 model-assumption·simulation·cited-secondary인 claim은 실측이 아님을 밝힐 것",
  "위키 요약(canonical_pages, origin=wiki)은 보강 자료일 뿐 단독 근거가 아님",
] as const

export interface NimContext {
  question: string
  basis: Plan["basis"]
  domain_filter: string[]
  ontology_classes: { name: string; ancestors: string[] }[]
  ontology_entities: { id: string; label: string; class: string; attributes: Record<string, unknown> }[]
  ontology_relations: { ref: string; id: string; subject: string; predicate: string; object: string; status: string; confidence: string; attrs: Record<string, unknown> }[]
  verified_claims: { ref: string; id: string; subject: string; predicate: string; value: string; unit: string | null; conditions: string | null; origin: string; status: string; confidence: string; contested: boolean; evidence_kind: string; rules: string[] }[]
  evidence: { id: string; claim_id: string; claim_ref: string; source_path: string; source_url: string; locator: string; quote: string; verified: boolean; method: string }[]
  canonical_pages: { ref: string; path: string; title: string; domain: string | null; excerpt: string; role: "supplementary" }[]
  limitations: string[]
  answer_constraints: readonly string[]
  ids: { claims: string[]; relations: string[]; evidence: string[]; pages: string[] } // 모델이 인용할 수 있는 핸들(C1·R2·P3…)
  handleMap: Record<string, string> // 핸들 → 실제 ID(모델에는 보내지 않음)
}

function ancestors(cls: string): string[] {
  const out: string[] = []
  let cur: string | null = cls
  for (let i = 0; i < 10 && cur; i++) {
    const r: { parent: string | null } | undefined = all<{ parent: string | null }>("SELECT parent FROM ontology_classes WHERE name = ?", cur)[0]
    if (!r?.parent) break
    out.push(r.parent); cur = r.parent
  }
  return out
}

export function buildNimContext(plan: Plan): NimContext {
  // 모델이 긴 ID를 옮겨 적다 틀리는 문제(2026-10-20 실NIM 시험에서 rel:003211 → 003018)를 막기 위해 짧은 핸들을 쓰고 서버가 되돌린다.
  const handleMap: Record<string, string> = {}
  const cRef = new Map(plan.claims.map((c, i) => [c.id, `C${i + 1}`]))
  const rRef = new Map(plan.relations.map((r, i) => [r.id, `R${i + 1}`]))
  const pRef = new Map(plan.pages.map((p, i) => [p.path, `P${i + 1}`]))
  for (const [id, h] of cRef) handleMap[h] = id
  for (const [id, h] of rRef) handleMap[h] = id
  for (const [id, h] of pRef) handleMap[h] = id
  return {
    question: plan.question,
    basis: plan.basis,
    domain_filter: plan.domainFilter,
    ontology_classes: plan.classes.map((name) => ({ name, ancestors: ancestors(name) })),
    ontology_entities: plan.entities.map((e) => ({ id: e.id, label: e.label, class: e.cls, attributes: e.attributes })),
    ontology_relations: plan.relations.map((r) => ({ ref: rRef.get(r.id)!, id: r.id, subject: r.subjectLabel, predicate: r.predicate, object: r.objectLabel, status: r.status, confidence: r.confidence, attrs: r.attrs })),
    verified_claims: plan.claims.map((c) => ({ ref: cRef.get(c.id)!, id: c.id, subject: c.subjectText || c.subject, predicate: c.predicate, value: c.value, unit: c.unit, conditions: c.conditions, origin: c.origin, status: c.status, confidence: c.confidence, contested: c.contested, evidence_kind: c.evidenceKind, rules: c.rules })),
    evidence: plan.evidence.map((e) => ({ id: e.id, claim_id: e.claimId, claim_ref: cRef.get(e.claimId) ?? "", source_path: e.sourcePath, source_url: e.sourceUrl, locator: e.locator, quote: e.quote, verified: e.verified, method: e.method })),
    canonical_pages: plan.pages.map((p) => ({ ref: pRef.get(p.path)!, path: p.path, title: p.title, domain: p.domain, excerpt: p.excerpt, role: "supplementary" as const })),
    limitations: plan.limitations,
    answer_constraints: ANSWER_CONSTRAINTS,
    ids: { claims: [...cRef.values()], relations: [...rRef.values()], evidence: plan.evidence.map((e) => e.id), pages: [...pRef.values()] },
    handleMap,
  }
}

// 호환 표처럼 모델이 옮겨 쓰다 틀리기 쉬운 부분은 코드가 완성본을 만든다(2026-10-19 E2E에서 셀 범위 오기 확인).
const rHandle = (plan: Plan, id: string) => `R${plan.relations.findIndex((r) => r.id === id) + 1}`
export function compatTable(plan: Plan): string {
  const rows = plan.relations.filter((r) => r.predicate === "powersWith")
  if (!rows.length) return ""
  const head = "| 구동 쪽(ESC) | 짝(모터) | ESC 연속전류 | 모터 최대전류 | 함께 쓸 셀 | 관계 ID |\n|---|---|---|---|---|---|"
  const body = rows.slice(0, 20).map((r) => `| ${r.subjectLabel} | ${r.objectLabel} | ${r.attrs.contA ?? "-"}A | ${r.attrs.motorMaxA ?? "-"}A | ${r.attrs.sharedCells ?? "-"} | [${rHandle(plan, r.id)}] |`).join("\n")
  return `${head}\n${body}`
}

export function nimSystemPrompt(ctx: NimContext, mode: "text" | "json"): string {
  const table = ""
  const { handleMap: _hidden, ...sendable } = ctx
  void _hidden
  return `당신은 드론 공학 온톨로지의 해설자입니다. 아래 <context> JSON은 서버가 온톨로지 지식그래프와 검증된 claim·evidence에서 꺼낸 것이며, 당신의 일은 그 내용을 한국어로 풀어 설명하는 것뿐입니다. 사실을 새로 만들거나 판정(신뢰도·상태)을 바꾸지 않습니다.

<context>
${JSON.stringify(sendable)}
</context>

규칙
1. 사실(수치·제품명·관계·조건)은 context에 있는 것만 씁니다. 근거는 각 항목의 ref 값을 그대로 대괄호로 표기합니다: claim은 [C1], 관계는 [R3], 보강 문서는 [P2]. ref 값을 바꾸거나 새로 만들지 않고, context에 없는 ref는 쓰지 않습니다.
2. 관계는 ontology_relations에 있는 것만 말합니다. 없는 관계를 추정하지 않습니다.
3. status가 contested인 claim이나 서로 다른 값은 양쪽을 모두 쓰고 충돌임을 밝힙니다.
4. evidence_kind가 model-assumption·simulation·cited-secondary인 값은 "실측이 아님"을 함께 씁니다. origin이 wiki인 항목은 "위키 요약 기반"이라고 밝히고 단독 근거로 쓰지 않습니다.
5. limitations에 적힌 한계를 답변 끝에 "한계" 항목으로 요약합니다.
6. 계산 예시·추정·날짜를 새로 만들지 않습니다. 근거가 부족하면 부족하다고 씁니다.
6-0. 답변은 짧은 소제목과 목록으로 구조화하고, 문장마다 근거 표기([C번호]·[R번호]·[P번호])를 최소 하나씩 답니다. 근거 표기가 하나도 없는 답변은 서버가 거절합니다.
${ctx.basis === "wiki-sourced" ? "6-1. 이 질문은 온톨로지의 개체·관계·검증 claim에 직접 연결되지 않았습니다. 답변은 canonical_pages의 발췌와 origin이 wiki인 claim(출처 파일이 확인된 위키 요약)에만 근거합니다. 첫 문장에서 '온톨로지에 직접 연결되지 않아 위키 요약 기반으로 설명합니다'라고 밝히고, 서술마다 [P번호] 또는 [C번호]를 달고, 발췌에 없는 내용은 덧붙이지 않습니다. ontology_classes가 있으면 개념의 위치(상위 클래스)를 설명하는 데에만 씁니다. 이 지침문 자체를 답변에 옮겨 쓰지 않습니다." : "6-1. 이 지침문 자체를 답변에 옮겨 쓰지 않습니다."}
7. 관계 attrs의 키는 사용자에게 보이는 말로 풀어 씁니다: contA=ESC 연속 전류(A), motorMaxA=모터 최대 전류(A), escCells·motorCells·sharedCells=ESC·모터·함께 쓸 수 있는 셀 수 범위, cells=셀 수. 키 이름(영문 약어)을 그대로 노출하지 않습니다.
${mode === "json" ? `8. 출력은 JSON 하나만: {"answer": "...", "used_claims": ["C1"...], "used_relations": ["R1"...], "used_pages": ["P1"...]} (코드 블록 없이).` : "8. 한국어 마크다운으로 간결하게 답합니다: 결론 → 근거(출처 ID 포함) → 관계 → 한계."}${table}`
}
