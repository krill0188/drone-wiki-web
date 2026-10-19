import relationsFile from "@/data/ontology/relations.json"
import { getAncestors } from "./ontology"
import { K } from "./rules"

// 온톨로지 추론 엔진(2026-10-17): LLM이 "알아서 추론"하게 두지 않고, 질문에서 뽑은 사실(fact)에
// 규칙(rule)을 고정점까지 전방 적용해 결론·판정·근거 체인을 결정론적으로 만든다.
// 규칙은 두 종류만 쓴다 — 물리법칙(law)과 설계 경험칙(heuristic). 제품별 수치는 규칙에 넣지 않는다
// (그건 위키 근거 문서에서만 인용). 경험칙은 결과에 "경험칙"으로 명시해 단정하지 않는다.

type Kind = "law" | "heuristic"
export type Verdict = "PASS" | "WARN" | "FAIL"

type Facts = Record<string, number>

interface Rule {
  id: string
  kind: Kind
  classes: string[] // 이 규칙이 다루는 온톨로지 클래스
  needs: string[] // 필요 사실
  unless?: string[] // 이 사실이 이미 있으면 적용하지 않음(더 정확한 입력 우선)
  gives?: string // 새로 도출하는 사실 키
  label: string // 사실/판정 설명
  unit?: string
  // 도출 규칙: 값 반환 / 검사 규칙: verdict 반환
  derive?: (f: Facts) => number
  check?: (f: Facts) => { verdict: Verdict; note: string }
  why: string // 근거(왜 이 규칙인가)
}

const G = 9.80665
const MACH07 = 240 // m/s, 팁속도 상한(≈Mach 0.7) — 이후 효율 급락·소음

const f0 = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "?")

const RULES: Rule[] = [
  // ── 전원계 ──
  {
    id: "R-V1", kind: "law", classes: ["Battery"], needs: ["cells"], gives: "vNom",
    label: "팩 공칭전압", unit: "V", derive: (f) => f.cells * 3.7,
    why: "LiPo/Li-ion 셀 공칭 3.7V × 직렬 수",
  },
  {
    id: "R-V2", kind: "law", classes: ["Battery"], needs: ["cells"], gives: "vMax",
    label: "팩 만충전압", unit: "V", derive: (f) => f.cells * 4.2,
    why: "LiPo 만충 4.2V/셀 × 직렬 수 — ESC·모터 내압 검토 기준",
  },
  {
    id: "R-V3", kind: "heuristic", classes: ["Battery"], needs: ["cells"], gives: "vMin",
    label: "팩 하한(부하 시 컷오프)", unit: "V", derive: (f) => f.cells * 3.3,
    why: "과방전 방지 셀당 3.3V 컷오프(부하 상태 경험칙)",
  },
  {
    id: "R-E1", kind: "law", classes: ["Battery"], needs: ["vNom", "capMah"], gives: "energyWh",
    label: "배터리 에너지", unit: "Wh", derive: (f) => f.vNom * (f.capMah / 1000),
    why: "E = V × Ah",
  },
  {
    id: "R-E2", kind: "heuristic", classes: ["Battery", "Frame"], needs: ["energyWh"], gives: "batMassG",
    label: "배터리 추정 질량", unit: "g", derive: (f) => (f.energyWh / K("R05", "e_pack_cons_Wh_kg")) * 1000,
    why: `카탈로그 배터리 40개 실측 중앙값 ${K("R05", "e_pack_cons_Wh_kg")}Wh/kg 적용(rules.json R05, 제품별 상이)`,
  },
  {
    id: "R-E3", kind: "heuristic", classes: ["Battery", "Frame"], needs: ["batMassG", "auwKg"],
    label: "배터리 중량비",
    check: (f) => {
      const r = f.batMassG / (f.auwKg * 1000)
      const v: Verdict = r > 0.6 ? "FAIL" : r > 0.5 ? "WARN" : "PASS"
      return { verdict: v, note: `추정 배터리 질량 ${f0(f.batMassG)}g = 총중량의 ${f0(r * 100)}% (권장 상한 50% — 초과 시 나머지 질량 예산 부족)` }
    },
    why: "배터리가 총중량의 과반이면 나머지 구성품 질량 예산이 성립하지 않음",
  },
  // ── 구동계: 전압→회전수→팁속도 ──
  {
    id: "R-M1", kind: "law", classes: ["Motor", "Battery"], needs: ["kv", "vMax"], gives: "rpmMax",
    label: "무부하 최대 회전수(만충)", unit: "rpm", derive: (f) => f.kv * f.vMax,
    why: "BLDC 무부하 회전수 ≈ kV × 전압",
  },
  {
    id: "R-M2", kind: "heuristic", classes: ["Motor", "Battery"], needs: ["kv", "vNom"], gives: "rpmLoaded",
    label: "부하 시 회전수 추정(공칭)", unit: "rpm", derive: (f) => f.kv * f.vNom * 0.8,
    why: "프로펠러 부하 시 무부하의 약 75~85%로 감소(경험칙 0.8)",
  },
  {
    id: "R-P1", kind: "law", classes: ["Propeller", "Motor"], needs: ["propIn", "rpmMax"], gives: "tipMs",
    label: "프로펠러 팁속도(만충·부하 0.8 보정)", unit: "m/s",
    derive: (f) => (Math.PI * f.propIn * 0.0254 * f.rpmMax * 0.8) / 60,
    why: "v = π·D·rpm/60, 부하 시 회전수는 무부하의 약 80%(경험칙 보정)",
  },
  {
    id: "R-P2", kind: "law", classes: ["Propeller", "Motor"], needs: ["tipMs"],
    label: "팁속도 한계 검사",
    check: (f) => {
      const v: Verdict = f.tipMs > MACH07 ? "FAIL" : f.tipMs > 200 ? "WARN" : "PASS"
      return {
        verdict: v,
        note: `팁속도 ${f0(f.tipMs)}m/s (Mach 0.7≈${MACH07}m/s 초과 시 효율 급락·소음; 만충·부하 0.8 보정 기준, 200 초과는 한계 근접)`,
      }
    },
    why: "팁이 천음속에 근접하면 압축성 항력으로 추력 효율이 급락",
  },
  // ── 추력 예산 ──
  {
    id: "R-T1", kind: "law", classes: ["Motor", "Frame"], needs: ["auwKg", "motors"], gives: "hoverGPerMotor",
    label: "모터 1개당 호버링 필요 추력", unit: "g", derive: (f) => (f.auwKg * 1000) / f.motors,
    why: "호버링: 총추력 = 총중량(T = m·g)",
  },
  {
    id: "R-T2", kind: "heuristic", classes: ["Motor"], needs: ["hoverGPerMotor"], gives: "reqGPerMotor",
    label: "모터 1개당 권장 최대추력(추력중량비 2:1)", unit: "g", derive: (f) => f.hoverGPerMotor * 2,
    why: "멀티콥터 제어 여유·돌풍 대응을 위해 추력중량비(TWR) ≥ 2 권장(경험칙; 기동·방제 등은 2~3)",
  },
  {
    id: "R-T3", kind: "law", classes: ["Motor", "Propeller"], needs: ["reqGPerMotor", "thrustMaxG"],
    label: "모터 최대추력 충족 검사",
    check: (f) => {
      const v: Verdict = f.thrustMaxG < f.hoverGPerMotor ? "FAIL" : f.thrustMaxG < f.reqGPerMotor ? "WARN" : "PASS"
      return {
        verdict: v,
        note: `모터 최대추력 ${f0(f.thrustMaxG)}g vs 호버링 ${f0(f.hoverGPerMotor)}g / 권장 ${f0(f.reqGPerMotor)}g`,
      }
    },
    why: "최대추력이 호버링 추력 미만이면 이륙 불가, 권장치 미만이면 제어 여유 부족",
  },
  // ── 기하(프레임↔프로펠러) ──
  {
    id: "R-G1", kind: "law", classes: ["Frame", "Propeller"], needs: ["wheelbaseMm", "motors"], gives: "adjMm",
    label: "인접 모터 간 거리(동일 평면 배치)", unit: "mm",
    derive: (f) => f.wheelbaseMm * Math.sin(Math.PI / f.motors),
    why: "정N각형 배치에서 인접 모터 거리 = 축거 × sin(π/N)",
  },
  {
    id: "R-G2", kind: "law", classes: ["Frame", "Propeller"], needs: ["adjMm", "propIn"],
    label: "프로펠러 간섭 검사",
    check: (f) => {
      const d = f.propIn * 25.4
      const v: Verdict = d > f.adjMm ? "FAIL" : d > f.adjMm * 0.95 ? "WARN" : "PASS"
      return { verdict: v, note: `프로펠러 지름 ${f0(d)}mm vs 인접 모터 간 거리 ${f0(f.adjMm)}mm (동일 평면, 겹치면 추력 손실·충돌)` }
    },
    why: "인접 프로펠러 디스크가 겹치지 않아야 함(동축·오프셋 배치는 예외)",
  },
  // ── 전기: ESC·배터리 호환 ──
  {
    id: "R-C1", kind: "law", classes: ["ESC", "Battery"], needs: ["escMaxS", "cells"],
    label: "ESC 전압(S) 호환 검사",
    check: (f) => ({
      verdict: f.escMaxS >= f.cells ? "PASS" : "FAIL",
      note: `ESC 지원 ${f0(f.escMaxS)}S vs 배터리 ${f0(f.cells)}S`,
    }),
    why: "ESC 내압을 초과한 S수는 소손 위험",
  },
  {
    id: "R-C2", kind: "heuristic", classes: ["ESC", "Motor"], needs: ["escContA", "motorMaxA"],
    label: "ESC 전류 여유 검사",
    check: (f) => {
      const r = f.escContA / f.motorMaxA
      const v: Verdict = r < 1 ? "FAIL" : r < 1.25 ? "WARN" : "PASS"
      return { verdict: v, note: `ESC 연속 ${f0(f.escContA)}A / 모터 최대 ${f0(f.motorMaxA)}A = ${r.toFixed(2)}배 (권장 ≥1.25~1.5)` }
    },
    why: "ESC 연속전류는 모터 최대전류에 25~50% 여유를 두는 것이 통례(경험칙)",
  },
  // ── 비행시간 ──
  {
    id: "R-F0", kind: "heuristic", classes: ["Motor", "Propeller", "Battery"], needs: ["auwKg", "propIn", "motors"], unless: ["effGPerW"], gives: "hoverW",
    label: "호버링 총 소비전력(운동량 이론 추정)", unit: "W",
    derive: (f) => {
      const T = (f.auwKg * G) / f.motors // 로터 1개당 추력(N)
      const A = Math.PI * (f.propIn * 0.0254 / 2) ** 2
      return (f.motors * T ** 1.5) / Math.sqrt(2 * 1.225 * A) / (0.6 * 0.8)
    },
    why: "이상 호버링 전력 P=T^1.5/√(2ρA), 성능지수 FM 0.6 × 구동효율(모터·ESC) 0.8 가정 — 제조사 시험표 없이도 쓰는 보수적 추정",
  },
  {
    id: "R-F1", kind: "law", classes: ["Motor", "Battery"], needs: ["auwKg", "effGPerW"], gives: "hoverW",
    label: "호버링 총 소비전력", unit: "W", derive: (f) => (f.auwKg * 1000) / f.effGPerW,
    why: "P = 총중량(g) ÷ 추력효율(g/W) — 효율은 해당 모터·프로펠러 시험표 값을 사용",
  },
  {
    id: "R-F2", kind: "law", classes: ["Battery", "ESC"], needs: ["hoverW", "vNom"], gives: "hoverA",
    label: "호버링 평균 전류", unit: "A", derive: (f) => f.hoverW / f.vNom,
    why: "I = P / V",
  },
  {
    id: "R-F3", kind: "heuristic", classes: ["Battery"], needs: ["hoverA", "capMah"], gives: "flightMinEst",
    label: "호버링 비행시간 추정", unit: "분", derive: (f) => ((f.capMah / 1000) * 0.8 / f.hoverA) * 60,
    why: "사용 가능 용량 80%(DoD) 가정, 호버링 평균전류 기준(전진비행·바람·페이로드 변동 제외)",
  },
  {
    id: "R-F4", kind: "heuristic", classes: ["Battery"], needs: ["hoverA", "flightMin"], gives: "capReqMah",
    label: "목표 비행시간 필요 용량", unit: "mAh", derive: (f) => (f.hoverA * (f.flightMin / 60) / 0.8) * 1000,
    why: "필요 용량 = 호버링 전류 × 시간 ÷ 0.8(DoD)",
  },
  {
    id: "R-F5", kind: "law", classes: ["Battery"], needs: ["cRate", "capMah", "motorMaxA", "motors"],
    label: "배터리 방전율(C) 검사",
    check: (f) => {
      const cap = (f.cRate * f.capMah) / 1000
      const peak = f.motorMaxA * f.motors
      const v: Verdict = cap < peak ? "FAIL" : cap < peak * 1.2 ? "WARN" : "PASS"
      return { verdict: v, note: `배터리 허용 ${f0(cap)}A(=${f0(f.cRate)}C×${f0(f.capMah)}mAh) vs 전체 최대 ${f0(peak)}A (${f0(f.motorMaxA)}A×${f0(f.motors)})` }
    },
    why: "최대 방전전류 = C율 × 용량, 모터 합산 최대전류를 감당해야 함",
  },
]

// 입력 사실의 표시 이름 — "필요 입력" 안내용
const FACT_LABEL: Record<string, string> = {
  cells: "배터리 S수(예: 6S)", capMah: "배터리 용량(mAh)", kv: "모터 kV", propIn: "프로펠러 지름(인치)",
  auwKg: "총이륙중량(kg)", motors: "모터 수(쿼드=4 등)", wheelbaseMm: "프레임 축거(mm)",
  thrustMaxG: "모터 최대추력(g, 시험표)", effGPerW: "호버링 추력효율(g/W, 시험표)", flightMin: "목표 비행시간(분)",
  escMaxS: "ESC 지원 S수", escContA: "ESC 연속전류(A)", motorMaxA: "모터 최대전류(A)", cRate: "배터리 C율",
}

// ── 질문 → 사실 추출 ──
export function extractFacts(raw: string): Facts {
  const q = raw.replace(/(\d),(\d{3})/g, "$1$2") // 5,000mAh → 5000mAh
  const f: Facts = {}
  const num = (rx: RegExp) => {
    const m = q.match(rx)
    return m ? parseFloat(m[1]) : undefined
  }
  const s = num(/\b(\d{1,2})\s*s(?:\s*\d{1,2}p)?\b/i)
  if (s && s >= 1 && s <= 14) f.cells = s
  const kv = num(/(\d{3,5})\s*kv/i) ?? num(/\bkv\s*[:=]?\s*(\d{3,5})/i)
  if (kv) f.kv = kv
  const prop = num(/(\d{1,2}(?:\.\d+)?)\s*(?:inch|in\b|인치|")/i)
  if (prop) f.propIn = prop
  const mah = num(/(\d{3,6})\s*mah/i)
  if (mah) f.capMah = mah
  const ah = num(/(\d+(?:\.\d+)?)\s*ah\b/i)
  if (!f.capMah && ah) f.capMah = ah * 1000
  const wb = num(/(?:축거|휠베이스|wheel.?base|대각)\D{0,6}(\d{2,4})\s*mm/i) ?? num(/(\d{2,4})\s*mm\s*(?:축거|휠베이스|프레임)/i)
  if (wb) f.wheelbaseMm = wb
  // 페이로드 kg를 총중량으로 오인하지 않도록, 페이로드 언급이 있으면 키워드로 명시된 값만 쓴다.
  const hasPayloadWord = /페이로드|탑재|payload|적재|화물|살포|배송/i.test(q)
  const kg = num(/(?:총중량|이륙중량|auw|mtow|기체\s*중량|기체\s*무게|총\s*무게)\D{0,6}(\d+(?:\.\d+)?)\s*kg/i) ?? (hasPayloadWord ? undefined : num(/(\d+(?:\.\d+)?)\s*kg/i))
  if (kg) f.auwKg = kg
  else {
    const g = num(/(?:총중량|이륙중량|auw|mtow|기체\s*중량|기체\s*무게)\D{0,6}(\d{3,6})\s*g\b/i)
    if (g) f.auwKg = g / 1000
  }
  if (/쿼드|quad|4\s*발|x4/i.test(q)) f.motors = 4
  else if (/헥사|hexa|6\s*발/i.test(q)) f.motors = 6
  else if (/옥타|octo|8\s*발/i.test(q)) f.motors = 8
  const eff = num(/(\d+(?:\.\d+)?)\s*g\s*\/\s*w/i)
  if (eff) f.effGPerW = eff
  const fm = num(/(\d{1,3})\s*(?:분|min)/i)
  if (fm) f.flightMin = fm
  const thr = num(/(?:최대\s*추력|max\s*thrust)\D{0,6}(\d{3,6})\s*g\b/i)
  if (thr) f.thrustMaxG = thr
  const ea = num(/esc\D{0,12}(\d{2,3})\s*a\b/i)
  if (ea) f.escContA = ea
  const em = num(/esc\D{0,12}(\d{1,2})\s*s\b/i)
  if (em) f.escMaxS = em
  const ma = num(/(?:모터|motor)\D{0,10}(?:최대)?\D{0,4}(\d{2,3})\s*a\b/i)
  if (ma) f.motorMaxA = ma
  const c = num(/(\d{2,3})\s*c\b(?!\w)/i)
  if (c && c >= 5 && c <= 200) f.cRate = c
  return f
}

export const physics = { G, MACH07 }

export interface Derivation {
  id: string
  kind: Kind
  line: string
  verdict?: Verdict
}

export interface InferenceResult {
  facts: Facts
  derivations: Derivation[]
  verdicts: { id: string; verdict: Verdict }[]
  missing: { fact: string; unlocks: string[] }[]
}

// ── 전방 추론(고정점) ──
export function infer(question: string, classes: string[]): InferenceResult {
  const facts = extractFacts(question)
  const given = { ...facts }
  const rel = new Set(classes)
  // 관련 규칙: 질문 클래스와 겹치거나, 질문에 수치 사실이 있으면 그 사실이 연결되는 규칙 전체
  const hasNumbers = Object.keys(given).length >= 2
  const active = RULES.filter((r) => hasNumbers || r.classes.some((c) => rel.has(c)))

  const fired = new Set<string>()
  const derivations: Derivation[] = []
  let changed = true
  let guard = 0
  while (changed && guard++ < 20) {
    changed = false
    for (const r of active) {
      if (fired.has(r.id)) continue
      if (r.unless?.some((k) => k in given)) continue
      if (!r.needs.every((k) => k in facts)) continue
      fired.add(r.id)
      changed = true
      const premise = r.needs.map((k) => `${FACT_LABEL[k] ?? factName(k)}=${f0(facts[k], facts[k] < 10 ? 2 : 0)}`).join(", ")
      if (r.derive && r.gives) {
        const v = r.derive(facts)
        facts[r.gives] = v
        derivations.push({
          id: r.id,
          kind: r.kind,
          line: `전제[${premise}] ⇒ ${r.label} = ${f0(v, v < 10 ? 2 : 0)}${r.unit ?? ""}  (${r.why})`,
        })
      } else if (r.check) {
        const res = r.check(facts)
        derivations.push({ id: r.id, kind: r.kind, verdict: res.verdict, line: `${r.label}: ${res.verdict} — ${res.note}  (${r.why})` })
      }
    }
  }

  // 목표 지향: 아직 못 도는 규칙이 요구하는 사실 중 "입력 가능한 것"만 모아, 풀어 주는 결론 수로 정렬
  const inputKeys = new Set(Object.keys(FACT_LABEL))
  const unlock = new Map<string, Set<string>>()
  for (const r of active) {
    if (fired.has(r.id)) continue
    const lack = r.needs.filter((k) => !(k in facts))
    // 도출 가능한 사실은 입력 요구에서 제외(다른 규칙이 채워 줌)
    const lackInput = lack.filter((k) => inputKeys.has(k))
    if (lackInput.length === 0 || lackInput.length !== lack.length) continue
    for (const k of lackInput) {
      if (!unlock.has(k)) unlock.set(k, new Set())
      unlock.get(k)!.add(r.label)
    }
  }
  const missing = [...unlock.entries()]
    .map(([fact, s]) => ({ fact, unlocks: [...s] }))
    .sort((a, b) => b.unlocks.length - a.unlocks.length)
    .slice(0, 6)

  const verdicts = derivations.filter((d) => d.verdict).map((d) => ({ id: d.id, verdict: d.verdict! }))
  return { facts: given, derivations, verdicts, missing }
}

function factName(k: string) {
  const m: Record<string, string> = {
    vNom: "공칭전압", vMax: "만충전압", vMin: "하한전압", rpmMax: "최대rpm", tipMs: "팁속도", energyWh: "에너지",
    batMassG: "배터리질량", hoverGPerMotor: "호버추력/모터", reqGPerMotor: "권장추력/모터", adjMm: "인접거리", hoverW: "호버전력",
    hoverA: "호버전류", rpmLoaded: "부하rpm",
  }
  return m[k] ?? k
}

// ── 구조 추론: 변경 파급(영향 전파) + 클래스 간 최단 경로 ──
interface Rel { rel: string; label: string; domain: string; range: string; source: string }
const RELS = (relationsFile as { relations: Rel[] }).relations

// 설계 의존 간선만 사용(소유·탑재 계열 제외 → 노이즈 방지)
const DESIGN_RELS = new Set(["drivenBy", "spins", "poweredBy", "commandedBy", "compatibleWith", "feeds"])

function neighbors(cls: string, hierarchy: Record<string, string | null>): { to: string; via: string }[] {
  const out: { to: string; via: string }[] = []
  const lineage = new Set([cls, ...getAncestors(cls, hierarchy)])
  for (const r of RELS) {
    if (!DESIGN_RELS.has(r.rel)) continue
    if (lineage.has(r.domain)) out.push({ to: r.range, via: `${cls} -${r.rel}→ ${r.range}` })
    if (lineage.has(r.range)) out.push({ to: r.domain, via: `${cls} ←${r.rel}- ${r.domain}` })
  }
  return out
}

// 구체 하위클래스(Motor, ESC…)가 아니라 추상 상위(Actuator, Sensor)로 번지는 걸 막기 위해, 질문 클래스 주변 구체 클래스만 따라간다.
const CONCRETE = new Set(["Motor", "ESC", "Propeller", "Battery", "FlightController", "Frame", "Payload", "GNSS", "IMU", "Barometer", "Magnetometer", "Camera", "LiDAR", "Gimbal", "CompanionComputer", "Datalink"])

export function impactOf(cls: string, hierarchy: Record<string, string | null>, depth = 2) {
  const seen = new Map<string, { hops: number; path: string }>()
  seen.set(cls, { hops: 0, path: cls })
  let frontier = [cls]
  for (let h = 1; h <= depth; h++) {
    const next: string[] = []
    for (const c of frontier) {
      for (const n of neighbors(c, hierarchy)) {
        if (!CONCRETE.has(n.to) || seen.has(n.to)) continue
        seen.set(n.to, { hops: h, path: `${seen.get(c)!.path} → ${n.to}` })
        next.push(n.to)
      }
    }
    frontier = next
  }
  seen.delete(cls)
  return [...seen.entries()].map(([to, v]) => ({ to, ...v }))
}

export function reasoningBlock(question: string, classes: string[], hierarchy: Record<string, string | null>): string {
  const concrete = classes.filter((c) => CONCRETE.has(c))
  const inf = infer(question, classes)
  const parts: string[] = []

  if (inf.derivations.length) {
    const lines = inf.derivations.map((d) => `- [${d.id}|${d.kind === "law" ? "물리법칙" : "설계 경험칙"}] ${d.line}`)
    parts.push(`규칙 적용 결과(질문 속 수치 → 전방 추론):\n${lines.join("\n")}`)
    const bad = inf.verdicts.filter((v) => v.verdict !== "PASS")
    parts.push(
      bad.length
        ? `종합 판정: ${bad.map((v) => `${v.id}=${v.verdict}`).join(", ")} 항목이 문제 — 반드시 답변에서 먼저 지적할 것.`
        : inf.verdicts.length
          ? `종합 판정: 검사 ${inf.verdicts.length}건 모두 PASS(경험칙 포함).`
          : ""
    )
  }

  // 파급 분석: 질문의 구체 클래스 각각에 대해 "바꾸면 다시 봐야 할 것"
  const impacts = concrete.slice(0, 3).map((c) => {
    const im = impactOf(c, hierarchy)
    if (!im.length) return ""
    return `- ${c}을(를) 바꾸면 재검토: ${im.map((x) => `${x.to}(${x.hops}단계: ${x.path})`).join(", ")}`
  }).filter(Boolean)
  if (impacts.length) parts.push(`변경 파급(관계 그래프 전파):\n${impacts.join("\n")}`)

  if (inf.missing.length) {
    const hints = inf.missing.map((m) => `- ${FACT_LABEL[m.fact] ?? m.fact} → ${m.unlocks.slice(0, 4).join(", ")} 판정 가능`)
    parts.push(`추가 입력이 있으면 더 강한 결론 가능(사용자에게 물어볼 것):\n${hints.join("\n")}`)
  }

  const body = parts.filter(Boolean).join("\n")
  if (!body) return ""
  return `<inference>
아래는 규칙 엔진이 결정론적으로 계산한 추론 결과다. 수치·PASS/WARN/FAIL 판정은 그대로 인용하고 임의로 바꾸거나 모순되게 말하지 말 것.
'설계 경험칙'은 통례일 뿐 제품·용도에 따라 달라질 수 있음을 한 번 밝히고, '물리법칙'은 단정해도 된다. 제품 고유 수치(최대추력·효율·전류)는 위키 근거 문서에서만 인용하고, 없으면 "확인 필요".
${body}
</inference>`
}
