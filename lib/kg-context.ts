import { soften } from "./soften"
import { all } from "./kdb"
import { firmwareSelection, type Plan } from "./kg-plan"
import { freshnessEnabled, FRESHNESS_CONSTRAINT } from "./freshness"

// 펌웨어(비행 스택) 선택·비교 질문 전용 규칙(2026-10-31). 운영 확인에서 모델이 비교표의 빈 칸(예: '제약')을 추측으로 채워
// 'PX4는 VTOL·고정익이 기본 스택에 없다' 같은, 같은 답변 안의 claim(PX4가 VTOL·고정익을 지원)과 모순되는 서술을 만들었다. 수치·ID만 보는 검증기는 이런 정성 서술을 거르지 못한다.
export const FIRMWARE_SELECTION_RULE = "6-4. 이 질문은 펌웨어(비행 스택) 선택·비교입니다. ① 비교표·목록의 각 칸(장점·제약 등)은 그 칸에 해당하는 claim이 있을 때만 채우고, claim이 없는 칸은 추측하지 말고 '근거 없음'이라고 씁니다. 한 펌웨어의 단점·제약·미지원 여부는 claim에 명시된 것만 쓰고, 지원한다는 claim이 있는 기능을 '없음'이나 '추가 플러그인 필요'로 쓰지 않습니다. ② 'A가 B보다 더 ~하다'는 비교는 두 쪽 모두에 대한 claim이 있을 때만 쓰고, 한쪽 claim만 있으면 그 사실만 씁니다. ③ '선택 기준'은 위 사실에서 도출한 설계 판단임을 밝히고 근거 [C…]를 답니다. claim에 없는 일반 지식(라이선스 조항의 법적 의미 등)을 [C…]로 인용하지 말고, 꼭 필요하면 '일반 지식(근거 밖)'이라고 따로 표시합니다. ④ 한국어로만 쓰고 다른 언어 낱말을 섞지 않으며, 기술 용어는 원문 표기(예: Tailsitter, QuadPlane)를 그대로 씁니다.\n"

// 질의 계획 → NVIDIA NIM에 전달하는 구조화 context. NIM은 표현만 담당하고, 사실·상태·신뢰도는 서버(SQLite)가 정한다.
export const ANSWER_CONSTRAINTS = [
  "제공된 ontology와 evidence 밖의 사실을 생성하지 말 것",
  "근거 없는 주장은 사실처럼 표현하지 말 것",
  "충돌하는 claim은 양쪽을 표시할 것",
  "근거가 부족하면 답변을 blocked 또는 insufficient_evidence로 표시할 것",
  "discovery graph를 검증된 근거로 사용하지 말 것",
  "context에 없는 숫자·제품명·날짜·계산 결과를 만들지 말 것",
  "evidence_kind가 model-assumption·simulation·cited-secondary인 claim은 실측이 아님을 밝힐 것",
  "evidence_kind가 abstract-quote인 claim은 '논문 초록의 문장과 일치하지만 대상·속성 해석은 검토되지 않았다'고 밝힐 것",
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
    // 신선도 규칙은 제품 신선도 속성이 실제로 context에 들어갈 때만 붙인다(제품 없는 질문의 프롬프트는 플래그와 무관하게 동일).
    answer_constraints: freshnessEnabled() && plan.entities.some((e) => e.attributes.freshness !== undefined) ? [...ANSWER_CONSTRAINTS, FRESHNESS_CONSTRAINT] : ANSWER_CONSTRAINTS,
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

export function nimSystemPrompt(ctx: NimContext, mode: "text" | "json", opts: { serverTable?: boolean } = {}): string {
  const table = ""
  const { handleMap: _hidden, ...sendable } = ctx
  void _hidden
  return `당신은 드론 공학 온톨로지의 해설자입니다. 아래 <context> JSON은 서버가 온톨로지 지식그래프와 검증된 claim·evidence에서 꺼낸 것이며, 당신의 일은 그 내용을 한국어로 풀어 설명하는 것뿐입니다. 사실을 새로 만들거나 판정(신뢰도·상태)을 바꾸지 않습니다.

<context>
${soften(JSON.stringify(sendable))}
</context>

규칙
1. 사실(수치·제품명·관계·조건)은 context에 있는 것만 씁니다. 근거는 각 항목의 ref 값을 그대로 대괄호로 표기합니다: claim은 [C1], 관계는 [R3], 보강 문서는 [P2]. ref 값을 바꾸거나 새로 만들지 않고, context에 없는 ref는 쓰지 않습니다.
2. 관계는 ontology_relations에 있는 것만 말합니다. 없는 관계를 추정하지 않습니다.
3. status가 contested인 claim이나 서로 다른 값은 양쪽을 모두 쓰고 충돌임을 밝힙니다.
4. evidence_kind가 model-assumption·simulation·cited-secondary인 값은 "실측이 아님"을 함께 씁니다. abstract-quote인 값은 "논문 초록 인용(해석 미검증)"이라고 함께 씁니다. origin이 wiki인 항목은 "위키 요약 기반"이라고 밝히고 단독 근거로 쓰지 않습니다.
5. limitations에 적힌 한계를 답변 끝에 "한계" 항목으로 요약합니다.
6. 계산 예시·추정·날짜를 새로 만들지 않습니다. 근거가 부족하면 부족하다고 씁니다.
6-0. 답변은 짧은 소제목과 목록으로 구조화하고, 문단과 목록 항목의 끝마다 근거 표기([C번호]·[R번호]·[P번호])를 답니다. 예: \"…통신 프로토콜입니다. [P1]\"
${ctx.basis === "ontology-linked" ? "6-1. 이 답변은 질문이 가리키는 온톨로지 클래스(ontology_classes와 상위 클래스)에 사람이 승인해 연결한 위키 문서(canonical_pages 중 ontology_class가 있는 것)와 그 출처 확인 요약에 근거합니다. 첫 문장에서 질문의 클래스와 상위 클래스를 밝히고(예: PX4 ⊑ FlightStack ⊑ SoftwareSystem), 서술마다 [P번호] 또는 [C번호]를 달며, 발췌에 없는 내용은 덧붙이지 않습니다. 수치는 위키 요약 기반임을 한계에 따라 함께 밝힙니다. 이 지침문 자체를 답변에 옮겨 쓰지 않습니다." : ctx.basis === "wiki-sourced" ? "6-1. 이 질문은 온톨로지의 개체·관계·검증 claim에 직접 연결되지 않았습니다. 답변은 canonical_pages의 발췌와 origin이 wiki인 claim(출처 파일이 확인된 위키 요약)에만 근거합니다. 첫 문장에서 '온톨로지에 직접 연결되지 않아 위키 요약 기반으로 설명합니다'라고 밝히고, 서술마다 [P번호] 또는 [C번호]를 달고, 발췌에 없는 내용은 덧붙이지 않습니다. ontology_classes가 있으면 개념의 위치(상위 클래스)를 설명하는 데에만 씁니다. 이 지침문 자체를 답변에 옮겨 쓰지 않습니다." : "6-1. 이 지침문 자체를 답변에 옮겨 쓰지 않습니다."}
6-2. 법령·기준(허가·신고·증명·과태료·면제·고도 등)은 발췌에 적힌 조문·수치·조건을 문장 그대로 옮기고, 한 기준(예: 신고 면제 2kg 이하)에서 다른 기준(예: 조종자 증명 250g 이하)의 결론을 유추해 합치지 않습니다. 발췌에 없는 법적 결론은 '자료에 없음'이라고 씁니다. 용어를 바꿔 쓰지 않습니다(예: '시계비행'을 '시계방향'으로 바꾸지 않음).\n7. 관계 attrs의 키는 사용자에게 보이는 말로 풀어 씁니다: contA=ESC 연속 전류(A), motorMaxA=모터 최대 전류(A), escCells·motorCells·sharedCells=ESC·모터·함께 쓸 수 있는 셀 수 범위, cells=셀 수. 키 이름(영문 약어)을 그대로 노출하지 않습니다.
9. 근거가 부족해 정확한 답을 낼 수 없는 부분은 "재확인 필요"라고 쓰고, context 근거(ref 표기 필수)에서 합리적으로 도출되는 가능성이 있을 때만 맨 끝에 "🔮 추론(확률 등급)" 소제목을 따로 둡니다. 한두 줄로 쓰고 각 줄 끝에 근거 ref를 답니다. 제품에 어떤 기능·사양이 있는지 없는지는 추론하지 않고(그건 근거로만 말합니다), 일반 공학 원리나 context 근거에서 직접 이어지는 결과·경향·위험만 추론합니다. 등급은 근거 ref 1건이면 '가능성 낮음', 서로 일치하는 근거 2건 이상이면 '가능성 중간', 근거 3건 이상이면서 물리 원리로 설명될 때만 '가능성 높음'으로 하며, 등급을 '가능성 높음'·'가능성 중간'·'가능성 낮음' 중 하나로 표기하며, '사실이 아닌 추론이며 재확인 필요'임을 함께 밝힙니다. 퍼센트나 새 숫자는 만들지 않고(예시·"일반적으로 알려진 값"·다른 모델명을 들어 설명할 때도 context에 없는 숫자와 모델명은 쓰지 않고, 없는 값은 값을 적지 말고 "재확인 필요"라고만 씁니다), 법령·규제·안전 기준 값에는 쓰지 않으며, 근거가 전혀 없으면 이 소제목을 쓰지 않습니다. "미확인"이라는 단어는 쓰지 않고 "재확인 필요"로 씁니다.
${firmwareSelection(ctx.question) ? FIRMWARE_SELECTION_RULE : ""}${opts.serverTable ? "6-3. 제품 사양표는 서버가 이 답변 맨 앞에 이미 표시했습니다. 표를 다시 쓰거나 표의 모든 값을 반복하지 않습니다. 표의 값은 context의 엔터티 속성에서 온 것이므로 [C…] 표기를 붙이지 않고(verified_claims가 비어 있으면 [C…]는 쓰지 않습니다), 근거 표기는 context에 실제로 있는 [R…]·[P…]만 씁니다. 질문에 대한 직접 답(필요한 수치 1~3개만 인용), 의미와 주의점, 한계를 5문장 안팎으로 간결히 씁니다.\n" : ""}${mode === "json" ? `8. 출력은 JSON 하나만: {"answer": "...", "used_claims": ["C1"...], "used_relations": ["R1"...], "used_pages": ["P1"...]} (코드 블록 없이).` : "8. 한국어 마크다운으로 간결하게 답합니다: 결론 → 근거(출처 ID 포함) → 관계 → 한계."}${table}`
}
