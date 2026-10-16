import instancesFile from "@/data/ontology/instances.json"
import { extractFacts, physics } from "./ontology-reason"

// 창조형 추론(2026-10-17): 구조화된 제품 개체(instances.json)를 요구에 맞게 조합·합성하고,
// 물리 규칙으로 걸러 점수를 매긴다. 문서에 없는 "새 조합"과 "새 개체(셀→팩 조립)"도 만든다.
// 결과는 후보(가설)이며 실제 시험 전 확정 아님 — 값이 비어 있으면 판정하지 않고 "수집 필요"로 돌려보낸다.

interface Prop { value: number; unit: string; raw: string }
interface Inst { id: string; class: string; name: string; manufacturer: string; doc: string; props: Record<string, Prop>; derived?: boolean }
const ALL = (instancesFile as unknown as { instances: Inst[] }).instances

const v = (i: Inst, k: string) => i.props[k]?.value
const short = (n: string) => n.replace(/\s*\(.*$/, "")

// 셀 → 팩 합성: 직·병렬 조합으로 새 배터리 개체를 만든다(BMS·열관리·보호는 별도 설계 필요).
function synthesizePacks(cells: Inst[], sOptions: number[]): Inst[] {
  const packs: Inst[] = []
  for (const c of cells) {
    const cap = v(c, "capMah")
    const w = v(c, "weightG")
    if (!cap || !w) continue
    for (const s of sOptions) for (const p of [2, 3, 4, 6]) {
      packs.push({
        id: `${c.id}__${s}S${p}P`, class: "Battery", name: `${short(c.name)} ${s}S${p}P 조립팩`, manufacturer: c.manufacturer, doc: c.doc, derived: true,
        props: {
          cells: { value: s, unit: "S", raw: "합성" },
          capMah: { value: cap * p, unit: "mAh", raw: `${p}P × ${cap}mAh` },
          weightG: { value: w * s * p * 1.08, unit: "g", raw: `셀 ${s * p}개 × ${w}g + 배선·홀더 8%` },
          // 고출력 21700 셀의 연속 방전 ~35A/셀(데이터시트 기준 아님 → 보수 20A로 가정)
          cRate: { value: Math.floor((20 * p) / (cap * p / 1000)), unit: "C", raw: "셀당 20A 보수 가정" },
        },
      })
    }
  }
  return packs
}

interface Candidate {
  motor: Inst; esc: Inst; prop: Inst; bat: Inst
  S: number
  flightMin: number
  tipMs: number
  escMargin?: number
  cOk?: boolean
  massKnownG: number
  verdicts: string[]
  unknown: string[]
  novel: boolean
  score: number
}

export interface SynthesisResult { block: string; count: number }

export function synthesisBlock(question: string): SynthesisResult {
  const facts = extractFacts(question)
  const auw = facts.auwKg
  if (!auw) return { block: "", count: 0 }
  const N = facts.motors ?? 4
  const motors = ALL.filter((i) => i.class === "Motor")
  const escs = ALL.filter((i) => i.class === "ESC")
  const props = ALL.filter((i) => i.class === "Propeller" && v(i, "diameterIn"))
  const bats = ALL.filter((i) => i.class === "Battery" && v(i, "cells") && v(i, "capMah"))
  const cells = ALL.filter((i) => i.class === "Battery" && !v(i, "cells") && v(i, "capMah") && v(i, "weightG"))
  const packs = [...bats, ...synthesizePacks(cells, [6, 12])]

  const hover = (auw * 1000) / N // g/모터
  const gaps = new Map<string, Set<string>>()
  const gap = (item: Inst, what: string) => {
    if (!gaps.has(what)) gaps.set(what, new Set())
    gaps.get(what)!.add(short(item.name))
  }
  const rejected: Record<string, number> = {}
  const rej = (why: string) => { rejected[why] = (rejected[why] ?? 0) + 1 }
  const cands: Candidate[] = []

  for (const m of motors) for (const e of escs) for (const p of props) for (const b of packs) {
    const S = v(b, "cells")!
    const verdicts: string[] = []
    const unknown: string[] = []
    // 1) 전압 호환
    const mS = v(m, "maxCells"), eS = v(e, "maxCells")
    if (mS && S > mS) { rej("모터 전압(S) 초과"); continue }
    if (eS && S > eS) { rej("ESC 전압(S) 초과"); continue }
    const rS = v(m, "ratedCells")
    if (rS && S < rS * 0.7) { rej("모터 정격 전압 미달(저전압 운용 시 전류 과다)"); continue }
    if (!mS) { unknown.push("모터 최대 S"); gap(m, "모터 정격/최대 전압(S)") }
    if (!eS) { unknown.push("ESC 최대 S"); gap(e, "ESC 입력 전압(S)") }
    // 2) 팁속도(물리법칙)
    const kv = v(m, "kv")
    if (!kv) { gap(m, "모터 kV"); continue }
    const tip = (Math.PI * v(p, "diameterIn")! * 0.0254 * kv * S * 4.2 * 0.8) / 60
    if (tip > physics.MACH07) { rej("프로펠러 팁속도 초과"); continue }
    // 3) 추력: 모터 최대추력(시험표) ≥ 호버링×2
    const thr = v(m, "maxThrustG")
    if (thr) {
      if (thr < hover * 1.5) { rej("모터 추력 부족"); continue }
      verdicts.push(thr >= hover * 2 ? "추력여유 충족" : "추력여유 빠듯")
    } else { unknown.push("모터 최대추력"); gap(m, "모터 최대추력(g)") }
    // 4) 호버링 전력(운동량 이론) → 전류·비행시간
    const T = (auw * physics.G) / N
    const A = Math.PI * (v(p, "diameterIn")! * 0.0254 / 2) ** 2
    const hoverW = (N * T ** 1.5) / Math.sqrt(2 * 1.225 * A) / (0.6 * 0.8)
    const vNom = S * 3.7
    const Ah = v(b, "capMah")! / 1000
    const flightMin = ((vNom * Ah * 0.8) / hoverW) * 60
    // 5) ESC 전류 여유: TWR 2 시 모터당 전류(전력 ∝ T^1.5 → ×2.83)
    const iPeakMotor = ((hoverW / N) * 2 ** 1.5) / vNom
    const eCont = v(e, "contCurrentA")
    let escMargin: number | undefined
    if (eCont) {
      escMargin = eCont / iPeakMotor
      if (escMargin < 1) { rej("ESC 전류 부족"); continue }
    } else { unknown.push("ESC 연속전류"); gap(e, "ESC 연속전류(A)") }
    const mI = v(m, "maxCurrentA")
    if (mI && iPeakMotor > mI * 1.2) { rej("모터 전류 초과"); continue }
    if (!mI) gap(m, "모터 최대 연속전류(A)")
    // 6) 배터리 방전율
    let cOk: boolean | undefined
    const cr = v(b, "cRate")
    if (cr) {
      cOk = cr * Ah >= iPeakMotor * N
      if (!cOk) { rej("배터리 방전율 부족"); continue }
    } else { unknown.push("배터리 C율"); gap(b, "배터리 방전율(C)") }
    // 7) 질량 예산(알려진 구성품만)
    const known = [v(m, "weightG") ? v(m, "weightG")! * N : 0, v(e, "weightG") ? v(e, "weightG")! * N : 0, v(p, "weightG") ? v(p, "weightG")! * N : 0, v(b, "weightG") ?? 0]
    const massKnownG = known.reduce((a, c) => a + c, 0)
    if (massKnownG > auw * 1000) { rej("구성품 질량이 총중량 초과"); continue }
    if (v(b, "weightG") && v(b, "weightG")! > auw * 1000 * 0.5) { rej("배터리가 총중량 50% 초과"); continue }
    if (flightMin < 5) { rej("비행시간 5분 미만"); continue }

    const novel = !!b.derived
    const score = flightMin * (1 - 0.08 * unknown.length) * (escMargin ? Math.min(escMargin / 1.25, 1.2) : 0.9)
    cands.push({ motor: m, esc: e, prop: p, bat: b, S, flightMin, tipMs: tip, escMargin, cOk, massKnownG, verdicts, unknown, novel, score })
  }

  cands.sort((a, b) => b.score - a.score)
  // 같은 모터·팩 조합의 중복 변형을 줄여 다양성 확보
  const seen = new Set<string>()
  const top: Candidate[] = []
  for (const c of cands) {
    const key = `${c.motor.id}|${c.bat.id}`
    if (seen.has(key)) continue
    seen.add(key)
    top.push(c)
    if (top.length >= 5) break
  }

  const total = Object.values(rejected).reduce((a, c) => a + c, 0) + cands.length
  const rejLines = Object.entries(rejected).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}건`).join(", ")
  const gapLines = [...gaps.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6).map(([w, set]) => `- ${w}: ${[...set].slice(0, 3).join(", ")}`)

  const lines = top.map((c, i) => {
    const flags = [c.novel ? "합성 팩(신규 개체·검증 필요)" : "부품 수치는 문서 기반·조합은 규칙 검증만(실기 미검증)", ...c.verdicts, c.unknown.length ? `미확인: ${c.unknown.join("·")}` : ""].filter(Boolean).join("; ")
    return `${i + 1}. ${short(c.motor.name)} + ${short(c.esc.name)} + ${short(c.prop.name)} + ${c.bat.name} (${c.S}S) → 호버링 비행 추정 ${c.flightMin.toFixed(0)}분, 팁속도 ${c.tipMs.toFixed(0)}m/s${c.escMargin ? `, ESC 여유 ${c.escMargin.toFixed(2)}배` : ""} [${flags}]`
  })

  const block = `<synthesis>
수집된 제품 개체(${ALL.length}종, 제조사 문서 파싱)를 요구(총중량 ${auw}kg, 모터 ${N}개${facts.motors ? "" : " — 미지정이라 4로 가정"})에 맞춰 조합 ${total}건을 평가했다. 이 결과는 물리 규칙 통과 후보(가설)이며 실기 시험 전 확정이 아니다.
탈락 사유 분포: ${rejLines || "없음"}
${top.length ? `상위 후보(점수순):\n${lines.join("\n")}` : "규칙을 통과한 조합이 없다 — 위 탈락 사유가 설계 제약이다. 요구 완화 또는 부품 추가 수집이 필요."}
${gapLines.length ? `판정을 막은 정보 빈틈(수집 우선순위):\n${gapLines.join("\n")}` : ""}
창조 지침: 후보를 그대로 나열하지 말고 ① 왜 이 조합이 성립하는지(물리 규칙) ② 문서에 없는 신규 조합·조립 팩이 가진 위험과 검증 방법 ③ 현재 후보 집합에 없는 다른 설계 방향(예: 프로펠러 직경↑·kV↓로 디스크 하중 낮춰 효율 개선, 병렬 팩, 다른 S수)을 "가설"로 명시해 제안할 것. 근거 없는 제품 수치는 만들지 말 것.
</synthesis>`
  return { block, count: top.length }
}
