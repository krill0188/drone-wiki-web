import claimsFile from "../data/ontology/claims.json"
import { soften } from "./soften"
import { firmwareSelection, type Plan } from "./kg-plan"

// 펌웨어(PX4·ArduPilot) 선택·비교 질문의 비교표를 서버가 결정론적으로 만든다(설계: docs/firmware-selection-claims.md §8~9).
// 배경: 모델(fast)이 비교표의 빈 칸을 추측으로 채우거나 claim 을 엉뚱한 칸에 인용하는 문제가 운영에서 확인됐다.
// 호환 표(compatTable)·제품 사양표(renderEntityTables)와 같은 원칙 — 모델이 옮겨 쓰다 틀리기 쉬운 부분은 코드가 완성본을 만든다.
// 표의 값은 검증된 claim(공식 문서 인용 글자 대조)의 value 를 그대로 쓰고, 근거는 모델 context 와 같은 [C번호]로 단다.
// 분류(facet·side·kind)는 claims.json FW 계열에 있다(정본: scripts/add-firmware-claims.py).

interface FwMeta { id: string; topic?: string; facet?: string; side?: string; kind?: string }
const META = new Map<string, FwMeta>(
  (claimsFile.claims as unknown as FwMeta[]).filter((c) => c.topic === "firmware-selection" && !!c.facet).map((c) => [c.id, c]),
)

// 비교표 행(표시 순서 고정). q 는 질문이 이 항목을 직접 묻는지 판정하는 낱말.
export const COMPARE_ROWS = [
  { facet: "supported", label: "지원 기체 범위" },
  { facet: "multicopter", label: "멀티콥터·헬리콥터" },
  { facet: "fixedwing", label: "고정익" },
  { facet: "vtol", label: "VTOL 방식" },
  { facet: "architecture", label: "코드 구조" },
  { facet: "license", label: "라이선스" },
  { facet: "governance", label: "운영·개방성" },
  { facet: "adoption", label: "상용 채택" },
  { facet: "ros2", label: "ROS 2 연동" },
  { facet: "tuning", label: "튜닝·파라미터" },
] as const
const AIRFRAME_ROWS = [
  { facet: "airframe:multicopter", label: "멀티콥터" },
  { facet: "airframe:helicopter", label: "헬리콥터" },
  { facet: "airframe:fixedwing", label: "고정익" },
  { facet: "airframe:vtol", label: "VTOL" },
] as const

// 질문이 좁은 항목만 묻는 경우(예: 라이선스 차이)에는 그 항목만 보여 준다. 일반적인 선택·유리·비교 질문이거나 어느 항목도 짚지 않으면 전부 보여 준다.
const FACET_Q: { re: RegExp; compare: string[]; airframe: boolean }[] = [
  { re: /라이선스|license|오픈소스|copyleft/i, compare: ["license", "governance"], airframe: false },
  { re: /ros\s*2|dds|zenoh/i, compare: ["ros2"], airframe: false },
  { re: /vtol|브이톨|틸트|테일시터|tailsitter|tiltrotor|quadplane|쿼드플레인/i, compare: ["supported", "vtol"], airframe: true },
  { re: /거버넌스|벤더|종속|커뮤니티|lock-in|상용/i, compare: ["governance", "adoption"], airframe: false },
]
const GENERAL_Q = /유리|적합|선택|추천|기준|성격별|뭐가\s*좋|어느\s*쪽|장단점|각각|기체/i

export function fwFacetsFor(question: string): { compare: Set<string>; airframe: boolean; all: boolean } {
  const hit = FACET_Q.filter((f) => f.re.test(question))
  if (GENERAL_Q.test(question) || !hit.length) return { compare: new Set(COMPARE_ROWS.map((r) => r.facet)), airframe: true, all: true }
  return { compare: new Set(hit.flatMap((h) => h.compare)), airframe: hit.some((h) => h.airframe), all: false }
}

// 표 칸: 소프트닝·파이프 제거·공백 정리(kg-table 의 cell 과 같은 처리). 값은 claim value 를 자르지 않고 그대로 둔다(최대 길이만 방어).
const cell = (s: string, max = 300) => {
  const t = soften(s).replace(/\|/g, "/").replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
export const NO_EVIDENCE = "수집된 근거 없음"

export function renderFirmwareTables(plan: Plan, question: string = plan.question): string {
  if (!firmwareSelection(question)) return ""
  const ref = new Map(plan.claims.map((c, i) => [c.id, `C${i + 1}`])) // buildNimContext 의 cRef 와 같은 번호 규칙
  const byId = new Map(plan.claims.map((c) => [c.id, c]))
  const mine = [...META.values()].filter((m) => byId.has(m.id)).sort((a, b) => a.id.localeCompare(b.id))
  if (!mine.length) return ""
  const sel = fwFacetsFor(question)
  const cite = (m: FwMeta) => `${cell(byId.get(m.id)!.value)} [${ref.get(m.id)}]`
  const out: string[] = []

  if (sel.airframe) {
    const rows = AIRFRAME_ROWS.flatMap((r) => mine.filter((m) => m.facet === r.facet).map((m) => `| ${r.label} | ${m.kind || "특성"} | ${cell(byId.get(m.id)!.value)} | [${ref.get(m.id)}] |`))
    if (rows.length) out.push(["**기체 유형별 특성** — PX4 공식 문서의 서술(기체 유형 자체의 특성이며 펌웨어 고유 특성이 아님)", "", "| 기체 유형 | 구분 | 내용 | 근거 |", "|---|---|---|---|", ...rows].join("\n"))
  }

  const cmp = COMPARE_ROWS.filter((r) => sel.compare.has(r.facet)).map((r) => {
    const side = (s: string) => mine.filter((m) => m.facet === r.facet && m.side === s).map(cite).join("; ") || NO_EVIDENCE
    return { label: r.label, px4: side("PX4"), ap: side("ArduPilot") }
  }).filter((r) => r.px4 !== NO_EVIDENCE || r.ap !== NO_EVIDENCE)
  if (cmp.length) {
    out.push(["**PX4 vs ArduPilot** — 각 프로젝트 공식 문서의 서술 기준(제1자 서술이며 독립 검증이 아님)", "", "| 항목 | PX4 | ArduPilot |", "|---|---|---|", ...cmp.map((r) => `| ${r.label} | ${r.px4} | ${r.ap} |`)].join("\n"))
  }
  if (!out.length) return ""
  out.push(`<sub>서버가 검증된 claim(공식 문서 원문과 글자 단위로 대조한 인용)을 그대로 표로 만든 것입니다 · '${NO_EVIDENCE}'은 기능이 없다는 뜻이 아니라 이 지식에 해당 서술이 없다는 뜻입니다</sub>`)
  return out.join("\n\n")
}
