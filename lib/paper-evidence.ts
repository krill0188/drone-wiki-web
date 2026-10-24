// 논문 claim 적용 계층(2026-10-25): 온톨로지화된 논문 claim(paper-claims.json 검증분 + auto-claims.json 초록 인용분)을
// 설계 단계에 '서버가 직접' 골라 (1) 모델 프롬프트에 근거로 주입하고 (2) 결과 끝에 출처 표로 붙인다. 모델이 인용하지 않아도 적용 여부가 공개된다.
// 선택은 결정론: 단계별 주제 + 설계 문서 단어 겹침 + 규칙 연결 + 증거 종류(실측 > 시뮬레이션·모델 가정). 관련 claim이 없으면 '없음'이라고 공개한다.
import paperFile from "@/data/ontology/paper-claims.json"
import autoFile from "@/data/ontology/auto-claims.json"
import { planMultirotor, type DesignSpec } from "./design-gate"

interface PClaim {
  id: string; rules?: string[]; subject?: string; attribute?: string; value: string | number; unit?: string; conditions?: string
  sourceId: string; locator?: string; quote?: string; status: string; topic?: string | null; evidenceKind?: string
  paper?: { title?: string }
}
const CLAIMS = [...(paperFile as { claims: PClaim[] }).claims, ...(autoFile as { claims: PClaim[] }).claims]

const STAGE_TOPICS: Record<string, string[]> = {
  hw: ["propulsion", "battery", "energy", "sizing", "build", "structure", "payload"],
  sw: ["companion", "flight-controller", "comms"],
  techspec: ["propulsion", "battery", "energy", "sizing", "forward-flight", "companion"],
  architecture: ["companion", "flight-controller", "comms", "structure"],
}
const TOKEN = /[a-z0-9가-힣]{3,}/g
const STOP = new Set(["the", "and", "with", "for", "drone", "uav", "of", "in", "to", "is", "are", "표", "구성요소", "카탈로그", "후보", "재확인", "필요", "선정안", "핵심", "사양"])
const tokens = (s: string) => new Set((s.toLowerCase().match(TOKEN) ?? []).filter((t) => !STOP.has(t)))

// 규모 적합성: claim의 대상·조건에 적힌 질량(g·kg)이 설계 총중량과 5배 넘게 다르면(예: 750 g 레이싱 쿼드 ↔ 19 kg 방제기) 근거로 쓰지 않는다.
function massRatio(c: PClaim, designKg: number | null): number | null {
  if (!designKg) return null
  const t = `${c.subject ?? ""} ${c.conditions ?? ""} ${c.quote ?? ""}`
  const ms = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)].map((m) => parseFloat(m[1].replace(",", ".")) * (m[2].toLowerCase() === "kg" ? 1 : 0.001)).filter((v) => v > 0.02 && v < 500)
  if (!ms.length) return null
  return Math.min(...ms.map((m) => Math.max(m / designKg, designKg / m)))
}

export interface PickedClaim { c: PClaim; score: number; label: string; scale: string }
export function selectPaperClaims(stage: string, spec: DesignSpec, context: string, k = 6): PickedClaim[] {
  const topics = new Set(STAGE_TOPICS[stage] ?? [])
  if (!topics.size) return []
  const ctx = tokens(`${context} ${spec.purpose ?? ""}`)
  let designKg: number | null = null
  try { designKg = planMultirotor(spec)?.auw ?? null } catch { /* 규모 판단 없이 진행 */ }
  const scored: PickedClaim[] = []
  for (const c of CLAIMS) {
    const topicHit = c.topic ? topics.has(c.topic) : false
    const text = tokens(`${c.subject ?? ""} ${c.attribute ?? ""} ${c.conditions ?? ""} ${c.paper?.title ?? ""}`)
    let overlap = 0
    for (const t of text) if (ctx.has(t)) overlap++
    // 주제 일치 또는 단어 겹침 2개 이상이어야 후보(키워드 한 개 우연 일치 방지)
    if (!topicHit && overlap < 2) continue
    let score = (topicHit ? 2 : 0) + Math.min(overlap, 4) + (c.rules?.length ? 1 : 0)
    if (c.evidenceKind === "reported") score += 1
    else if (c.evidenceKind === "model-assumption" || c.evidenceKind === "simulation" || c.evidenceKind === "cited-secondary") score -= 1
    if (c.evidenceKind === "abstract-quote") score -= 1
    if (spec.platform === "multirotor" && c.topic === "vtol-fixedwing") score -= 2
    const ratio = massRatio(c, designKg)
    if (ratio != null) score += ratio <= 5 ? 1 : -4
    if (score < 3) continue
    const label = c.evidenceKind === "abstract-quote" ? "초록 인용·해석 미검증" : c.evidenceKind === "model-assumption" ? "모델 가정값(실측 아님)" : c.evidenceKind === "simulation" ? "시뮬레이션 결과(실측 아님)" : c.evidenceKind === "cited-secondary" ? "2차 인용" : "원문 인용 검증(실측 보고)"
    const scale = ratio == null ? "규모 미상(설계와 같은 규모라고 보장 못 함)" : ratio <= 2 ? `규모 근접(질량 ${ratio.toFixed(1)}배 이내)` : `규모 차이 ${ratio.toFixed(1)}배`
    scored.push({ c, score, label, scale })
  }
  scored.sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
  const picked: PickedClaim[] = []
  const perPaper = new Map<string, number>()
  for (const s of scored) {
    const n = perPaper.get(s.c.sourceId) ?? 0
    if (n >= 2) continue // 한 논문이 독점하지 않도록
    perPaper.set(s.c.sourceId, n + 1)
    picked.push(s)
    if (picked.length >= k) break
  }
  return picked
}

const line = (p: PickedClaim) => `[${p.c.id}] ${p.c.subject ?? ""} · ${p.c.attribute ?? ""}: ${p.c.value}${p.c.unit ? ` ${p.c.unit}` : ""} (조건: ${(p.c.conditions || "-").slice(0, 120)}; ${p.c.sourceId}${p.c.locator ? `, ${p.c.locator}` : ""}; ${p.label}; ${p.scale})`

// 모델 프롬프트용 근거 블록
export function paperEvidenceBlock(picks: PickedClaim[]): string {
  if (!picks.length) return ""
  return `<paper-evidence>\n서버가 지식그래프에서 고른 논문 claim(수치·조건은 원문 그대로). 설계에 쓸 때는 [claim id]를 붙여 인용하고, 값을 바꾸거나 조건이 다른 값을 같은 조건처럼 쓰지 마라. 시뮬레이션·모델 가정·초록 인용은 그렇게 밝혀라. 우리 설계와 규모·환경이 다르면 "조건이 다르다"고 써라.\n${picks.map((p) => `- ${line(p)}`).join("\n")}\n</paper-evidence>`
}

// 결과 끝에 붙는 공개 표(모델이 인용했는지와 무관하게 코드가 붙인다)
export function paperEvidenceNote(picks: PickedClaim[], output: string): string {
  if (!picks.length) return "\n\n---\n\n## 📚 논문 근거 대조\n\n- 🟡 이 단계의 주제와 직접 맞는 논문 claim을 지식그래프에서 찾지 못했습니다(검증된 논문 claim 331건 중 해당 없음). 이 단계의 수치는 논문 근거 없이 규칙·카탈로그·가정으로만 만들어졌습니다."
  const cited = (id: string) => output.includes(`[${id}]`) || output.includes(id)
  const rows = picks.map((p) => `| ${p.c.id} | ${(p.c.subject ?? "").slice(0, 40)} · ${(p.c.attribute ?? "").slice(0, 40)} | ${p.c.value}${p.c.unit ? ` ${p.c.unit}` : ""} | ${(p.c.conditions || "-").slice(0, 80)} | ${p.c.sourceId}${p.c.locator ? ` (${p.c.locator})` : ""} | ${p.label} | ${p.scale} | ${cited(p.c.id) ? "본문 인용" : "본문 미인용"} |`)
  const used = picks.filter((p) => cited(p.c.id)).length
  return `\n\n---\n\n## 📚 논문 근거 대조 (코드가 지식그래프에서 선택)\n\n> 이 단계와 주제가 맞는 논문 claim ${picks.length}건 중 본문이 인용한 것은 ${used}건입니다. 아래 값은 논문이 보고한 조건에서의 값이며 우리 설계의 규모·환경과 같다고 보장하지 않습니다. 설계값과의 직접 비교는 사람이 판단하세요.\n\n| claim | 대상·속성 | 값 | 조건 | 출처 | 근거 종류 | 규모 대조 | 본문 |\n|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`
}
