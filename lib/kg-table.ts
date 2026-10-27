import type { Plan, PlanEntity } from "./kg-plan"
import { soften } from "./soften"
import { freshnessRowValue } from "./freshness"

// 제품 사양표는 모델이 아니라 서버가 만든다(2026-10-22). 모델은 표 값을 옮기다 반올림·누락·단위 오류를 내고(검증 경고의 주된 원인),
// 출력이 길어져 느려진다. 서버는 엔터티 속성(수집 원문 표)을 그대로 표로 렌더링하고, 모델은 해설만 쓴다.
const SCALAR_LABEL: Record<string, string> = {
  weight_g: "무게(g)", capacity_mah: "용량(mAh)", cells_s: "셀 수(S)", nominal_v: "공칭 전압(V)", continuous_a: "연속 전류(A)", peak_a: "최대 전류(A)", platform: "플랫폼",
}
const STOP = new Set(["사양", "스펙", "규격", "정보", "알려줘", "알려", "얼마", "무엇", "어떻게", "자세히", "정리", "설명", "제품", "모델", "공식", "수치", "값"])

function questionTokens(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9가-힣]{2,}/g) ?? []).map((t) => t.replace(/(은|는|이|가|을|를|의|과|와|도|만|은요|는요|이야|인가요|인가|이에요|예요)$/, "")).filter((t) => t.length >= 2 && !STOP.has(t))
}

function rowsOf(e: PlanEntity): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = []
  for (const [k, label] of Object.entries(SCALAR_LABEL)) {
    const v = e.attributes[k]
    if (v !== undefined && v !== null && v !== "") rows.push({ k: label, v: String(v) })
  }
  const nj = e.attributes.numeric_json
  if (typeof nj === "string") {
    try {
      const o = JSON.parse(nj) as Record<string, unknown>
      for (const [k, v] of Object.entries(o)) if (v !== null && v !== "") rows.push({ k, v: String(v) })
    } catch { /* 형식이 깨졌으면 스칼라만 쓴다 */ }
  }
  return rows
}

const cell = (s: string, max = 260) => {
  const t = soften(s).replace(/\|/g, "/").replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max)}… (전체는 출처 원문)` : t
}

export function renderEntityTables(plan: Plan, maxEntities = 2): string {
  const qt0 = questionTokens(plan.question)
  const out: string[] = []
  for (const e of plan.entities) {
    if (out.length >= maxEntities) break
    const label = e.label.toLowerCase()
    const qt = qt0.filter((t) => !label.includes(t) && !e.alias.toLowerCase().includes(t)) // 제품명 낱말은 모든 행에 걸리므로 관련 행 선별에서 뺀다
    const all = rowsOf(e)
    if (all.length < 2) continue // 속성이 거의 없는 개체(제조사 등)는 표를 만들지 않는다
    const hit = all.filter((r) => qt.some((t) => r.k.toLowerCase().includes(t) || r.v.toLowerCase().includes(t)))
    const rows = (hit.length >= 1 && hit.length < all.length && qt.length ? hit : all).slice(0, 14)
    const more = all.length > rows.length ? " · 질문과 관련된 항목만 표시" : "" // 기준일 행을 붙이기 전에 판정해야 행 수가 어긋나지 않는다
    // 수집 기준일 행은 질문 관련 행 선별과 상관없이 항상 마지막에 붙인다(KG_FRESHNESS=1이고 제품 속성에 신선도가 있을 때만).
    if (e.attributes.freshness !== undefined) rows.push({ k: "수집 기준일", v: freshnessRowValue(e.attributes.as_of, e.attributes.freshness, e.attributes.age_days) })
    const url = typeof e.attributes.url === "string" ? e.attributes.url.split(/\s*;\s*/)[0] : ""
    out.push([
      `**${soften(e.label)}** — 제품 사양표${more}`,
      "",
      "| 항목 | 값 |",
      "|---|---|",
      ...rows.map((r) => `| ${cell(r.k, 60)} | ${cell(r.v)} |`),
      "",
      `<sub>서버가 지식그래프 제품 속성(수집 원문 표)을 그대로 표로 만든 것입니다${url ? ` · 출처 ${url}` : ""}</sub>`,
    ].join("\n"))
  }
  return out.join("\n\n")
}
