// 설계 질문 게이트(2026-10-17): 드론 설계·구성 질문은 필수 4항목(페이로드·비행가능거리·크기·비행시간)이
// 모두 있어야 답한다. 빠지면 AI를 부르지 않고 서버가 즉시 재질문하고, 4항목이 있어도 물리적으로
// 성립하지 않으면 "추론상 불가"로 답한다. "무조건 만들어 내는" 동작을 구조적으로 막는 층이다.

export const GATE_MARKER = "[설계 입력 필요]"
const G = 9.80665

export interface DesignSpec {
  payloadKg?: number
  rangeKm?: number // 총 비행거리(km). 반경 입력은 왕복(×2)으로 환산
  rangeNote?: string
  sizeMm?: number // 휠베이스(대각 모터 간 거리) 또는 크기
  sizeNote?: string
  flightMin?: number
  rotors: number
  platform: "multirotor" | "fixedwing" | "vtol"
  platformExplicit: boolean
}

export interface GateResult {
  active: boolean
  complete: boolean
  spec: DesignSpec
  missing: string[]
  reply?: string // 서버 즉답(재질문 또는 불가 판정) — 있으면 AI를 호출하지 않는다
  augment?: string // 온톨로지 컨텍스트에 덧붙일 문장(추정 총중량 등)
  block?: string // <design-gate> — AI에게 전달하는 확정 전제·판정
}

const DRONE_NOUN = /드론|기체|콥터|쿼드|헥사|옥타|vtol|고정익|uav|멀티로터/i
const DESIGN_VERB = /설계|구성|제작|만들|조합|추천|선정|스펙 ?(을 )?잡|빌드|짜 ?(줘|주)|구축/i
const KNOWLEDGE_CUE = /원리|개념|차이|이란|란 ?무엇|뭐야|정의|역사|장단점|종류/i

const num = (s: string) => parseFloat(s.replace(/,/g, ""))

function hasDesignIntent(t: string, facts: number): boolean {
  if (!DRONE_NOUN.test(t) || !DESIGN_VERB.test(t)) return false
  if (KNOWLEDGE_CUE.test(t)) return false
  // 이미 부품 사양(6S·kV·프롭 등)을 구체적으로 준 "구성 검증" 질문은 설계 게이트 대상이 아니다.
  if (facts >= 3) return false
  return true
}

function countSpecFacts(t: string): number {
  let n = 0
  if (/\b\d{1,2}\s*s\b/i.test(t)) n++
  if (/\d{3,5}\s*kv/i.test(t)) n++
  if (/\d{1,2}(\.\d+)?\s*(인치|inch|in\b)/i.test(t)) n++
  if (/\d{3,6}\s*mah/i.test(t)) n++
  return n
}

export function parseSpec(text: string): DesignSpec {
  const t = text.replace(/(\d),(\d{3})/g, "$1$2")
  const spec: DesignSpec = { rotors: 4, platform: "multirotor", platformExplicit: false }

  if (/고정익|fixed.?wing/i.test(t)) { spec.platform = "fixedwing"; spec.platformExplicit = true }
  else if (/vtol|틸트/i.test(t)) { spec.platform = "vtol"; spec.platformExplicit = true }
  else if (/헥사/i.test(t)) { spec.rotors = 6; spec.platformExplicit = true }
  else if (/옥타/i.test(t)) { spec.rotors = 8; spec.platformExplicit = true }
  else if (/쿼드|멀티콥터|멀티로터/i.test(t)) spec.platformExplicit = true

  // 1) 페이로드
  if (/(페이로드|탑재(물|중량)?|적재)\D{0,6}(없|0\s*kg)|무탑재|페이로드 ?없/i.test(t)) spec.payloadKg = 0
  const pk = t.match(/(?:페이로드|탑재(?:물|중량)?|적재(?:량)?|화물|투하물|운반|살포량)\D{0,8}(\d+(?:\.\d+)?)\s*(kg|킬로|g\b)/i)
  const pk2 = t.match(/(\d+(?:\.\d+)?)\s*(kg|킬로|g)\s*(?:의\s*)?(?:페이로드|탑재|적재|화물|투하물|운반)/i)
  const pm = pk ?? pk2
  if (pm) { const v = num(pm[1]); spec.payloadKg = /g$/i.test(pm[2]) && !/kg/i.test(pm[2]) ? v / 1000 : v }

  // 2) 비행가능거리
  const rk = t.match(/(?:비행 ?(?:가능 ?)?거리|항속 ?거리|운용 ?거리|작전 ?거리|통달 ?거리|왕복)\D{0,8}(\d+(?:\.\d+)?)\s*(km|㎞|킬로|m\b)/i)
  const rk2 = t.match(/(\d+(?:\.\d+)?)\s*(km|㎞|킬로)\s*(?:까지|를|을)?\s*(?:비행|왕복|운용|이동)/i)
  const rad = t.match(/(?:반경|운용 ?반경|작전 ?반경)\D{0,6}(\d+(?:\.\d+)?)\s*(km|㎞|킬로|m\b)/i)
  if (rk || rk2) { const m = (rk ?? rk2)!; const v = num(m[1]); spec.rangeKm = /^m$/i.test(m[2]) ? v / 1000 : v }
  else if (rad) { const v = num(rad[1]); spec.rangeKm = (/^m$/i.test(rad[2]) ? v / 1000 : v) * 2; spec.rangeNote = `반경 ${v}${rad[2]} → 왕복 환산` }

  // 3) 크기
  const sz = t.match(/(?:크기|휠베이스|축거|대각|wheel.?base|사이즈|전폭|날개 ?폭|스팬|기체 ?(?:크기|길이))\D{0,8}(\d+(?:\.\d+)?)\s*(mm|cm|m\b|인치|inch)/i)
  if (sz) {
    const v = num(sz[1]); const u = sz[2].toLowerCase()
    spec.sizeMm = u === "mm" ? v : u === "cm" ? v * 10 : u === "m" ? v * 1000 : v * 25.4
  } else {
    const cls: [RegExp, number, string][] = [[/초소형|마이크로/, 250, "초소형(≈250mm)"], [/소형/, 450, "소형(≈450mm)"], [/중형/, 900, "중형(≈900mm)"], [/대형/, 1600, "대형(≈1600mm)"]]
    const hit = cls.find(([r]) => r.test(t))
    if (hit) { spec.sizeMm = hit[1]; spec.sizeNote = `${hit[2]} 등급으로 해석` }
    else { const lone = t.match(/(\d{3,4})\s*mm/i); if (lone) spec.sizeMm = num(lone[1]) }
  }

  // 4) 비행시간
  const ft = t.match(/(?:비행 ?시간|체공(?: ?시간)?|운용 ?시간|지속 ?시간|endurance)\D{0,8}(\d+(?:\.\d+)?)\s*(분|min|시간|h\b|hr)/i)
  const ft2 = t.match(/(\d+(?:\.\d+)?)\s*(분|min|시간|hr)\s*(?:이상|정도|간|동안)?\s*(?:비행|체공)/i)
  const fm = ft ?? ft2
  if (fm) { const v = num(fm[1]); spec.flightMin = /시간|h|hr/i.test(fm[2]) ? v * 60 : v }

  // 라벨 없는 단독 단위 보정(재질문 후 "2kg, 10km, 600mm, 30분"처럼 답하는 경우)
  if (spec.payloadKg === undefined) {
    const m = [...t.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)].find((x) => !/(총중량|이륙중량|자체|기체|auw|mtow)\D{0,6}$/i.test(t.slice(Math.max(0, x.index! - 10), x.index!)))
    if (m) spec.payloadKg = num(m[1])
  }
  if (spec.rangeKm === undefined) { const m = t.match(/(\d+(?:\.\d+)?)\s*(?:km|㎞)/i); if (m) spec.rangeKm = num(m[1]) }
  if (spec.flightMin === undefined) { const m = t.match(/(\d+(?:\.\d+)?)\s*(?:분|min)/i); if (m) spec.flightMin = num(m[1]) }
  return spec
}

// ── 실현 가능성(물리 한계 추론) ──
interface Assump { ef: number; rho: number; fm: number; eta: number; dod: number; vmax: number; ld: number; etaP: number; vtolExtra: number }
const CONS: Assump = { ef: 0.45, rho: 180, fm: 0.6, eta: 0.8, dod: 0.8, vmax: 15, ld: 9, etaP: 0.65, vtolExtra: 0.1 }
const OPT: Assump = { ef: 0.3, rho: 280, fm: 0.75, eta: 0.9, dod: 0.9, vmax: 25, ld: 14, etaP: 0.8, vtolExtra: 0.05 }

interface Sol { ok: boolean; auw: number; batKg: number; hoverW: number }

function solveMultirotor(payload: number, wbMm: number, N: number, tMin: number, a: Assump): Sol {
  const D = (wbMm / 1000) * Math.sin(Math.PI / N) * 0.95
  const A = Math.PI * (D / 2) ** 2
  const hoverW = (auw: number) => (N * ((auw * G) / N) ** 1.5) / Math.sqrt(2 * 1.225 * A) / (a.fm * a.eta)
  const bat = (auw: number) => (hoverW(auw) * (tMin / 60)) / a.dod / a.rho
  let auw = Math.max(payload, 0.05)
  for (let i = 0; i < 700; i++, auw *= 1.02) {
    if (auw * (1 - a.ef) - payload - bat(auw) >= 0) return { ok: true, auw, batKg: bat(auw), hoverW: hoverW(auw) }
  }
  return { ok: false, auw: 0, batKg: 0, hoverW: 0 }
}

function solveFixedWing(payload: number, vReq: number, tMin: number, a: Assump, vtol: boolean) {
  const v = Math.max(vReq, 12)
  const bf = (G * v * (tMin / 60)) / (a.ld * a.etaP * a.dod * a.rho)
  const denom = 1 - a.ef - (vtol ? a.vtolExtra : 0) - bf
  if (denom <= 0.02) return { ok: false, auw: 0, spanM: 0, v }
  const auw = Math.max(payload, 0.05) / denom
  const S = (2 * auw * G) / (1.225 * v * v * 1.2)
  return { ok: true, auw, spanM: Math.sqrt(8 * S), v }
}

export interface Feasibility {
  verdict: "가능" | "한계" | "불가"
  platformAdvice?: string
  vReq?: number
  cons?: Sol
  opt?: Sol
  detail: string
  maxTimeOpt?: number
  maxTimeCons?: number
  minSizeOpt?: number
  maxPayloadOpt?: number
}

export function assess(spec: DesignSpec): Feasibility {
  const { payloadKg: P, rangeKm: R, sizeMm: S, flightMin: T, rotors: N } = spec as Required<Pick<DesignSpec, "payloadKg" | "rangeKm" | "sizeMm" | "flightMin">> & DesignSpec
  const vReq = (R * 1000) / (T * 60)
  const mrC = solveMultirotor(P, S, N, T, CONS)
  const mrO = solveMultirotor(P, S, N, T, OPT)
  const okMrC = mrC.ok && vReq <= CONS.vmax
  const okMrO = mrO.ok && vReq <= OPT.vmax
  const fwC = solveFixedWing(P, vReq, T, CONS, spec.platform === "vtol")
  const fwO = solveFixedWing(P, vReq, T, OPT, spec.platform === "vtol")

  const bisect = (f: (x: number) => boolean, lo: number, hi: number) => { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; f(mid) ? (lo = mid) : (hi = mid) } return lo }
  const maxTimeOpt = bisect((t) => solveMultirotor(P, S, N, t, OPT).ok, 1, 600)
  const maxTimeCons = bisect((t) => solveMultirotor(P, S, N, t, CONS).ok, 1, 600)
  const minSizeOpt = bisect((wb) => !solveMultirotor(P, wb, N, T, OPT).ok, 100, 6000)
  const maxPayloadOpt = bisect((p) => solveMultirotor(p, S, N, T, OPT).ok, 0, 300)

  const base: Feasibility = { verdict: "불가", vReq, cons: mrC, opt: mrO, detail: "", maxTimeOpt, maxTimeCons, minSizeOpt, maxPayloadOpt }
  const fwAdv = fwC.ok || fwO.ok ? `고정익/VTOL 구조는 ${fwC.ok ? "보수" : "낙관"} 가정에서 성립 가능(순항 ${fwO.v.toFixed(0)}m/s, 필요 날개폭 ≈ ${(fwC.ok ? fwC : fwO).spanM.toFixed(1)}m — 크기 입력이 날개폭이면 비교 필요)` : undefined

  const explicitMR = spec.platform === "multirotor" && spec.platformExplicit
  if (spec.platform === "multirotor") {
    if (okMrC) return { ...base, verdict: "가능", detail: `보수 가정에서 성립: 추정 총중량 ${mrC.auw.toFixed(1)}kg, 추정 배터리 ${mrC.batKg.toFixed(1)}kg(${((mrC.batKg / mrC.auw) * 100).toFixed(0)}%), 호버링 전력 ≈ ${mrC.hoverW.toFixed(0)}W` }
    if (okMrO) return { ...base, verdict: "한계", detail: `보수 가정에서는 불성립, 낙관 가정(에너지밀도 280Wh/kg, 효율 상향)에서만 성립: 추정 총중량 ${mrO.auw.toFixed(1)}kg, 배터리 ${mrO.batKg.toFixed(1)}kg(${((mrO.batKg / mrO.auw) * 100).toFixed(0)}%)` }
    if ((fwC.ok || fwO.ok) && !explicitMR) return { ...base, verdict: "한계", platformAdvice: fwAdv, detail: `멀티로터로는 성립하지 않음(${vReq > OPT.vmax ? `필요 평균속도 ${vReq.toFixed(1)}m/s가 멀티로터 현실 상한 초과` : "에너지 예산 초과"}). ${fwAdv}` }
    return { ...base, verdict: "불가", platformAdvice: fwAdv, detail: `멀티로터 낙관 가정으로도 성립하지 않음(${mrO.ok ? `필요 평균속도 ${vReq.toFixed(1)}m/s > 상한 ${OPT.vmax}m/s` : "배터리 질량이 가용 질량을 초과"}).` }
  }
  const f = fwC.ok ? fwC : fwO
  if (fwC.ok) return { ...base, verdict: "가능", detail: `보수 가정에서 성립: 추정 총중량 ${fwC.auw.toFixed(1)}kg, 순항 ${fwC.v.toFixed(0)}m/s, 필요 날개폭 ≈ ${fwC.spanM.toFixed(1)}m` }
  if (fwO.ok) return { ...base, verdict: "한계", detail: `낙관 가정에서만 성립: 추정 총중량 ${f.auw.toFixed(1)}kg, 필요 날개폭 ≈ ${f.spanM.toFixed(1)}m` }
  return { ...base, verdict: "불가", detail: "고정익/VTOL 낙관 가정으로도 에너지 예산을 만족하지 못함." }
}

// ── 게이트 ──
function fmt(spec: DesignSpec) {
  const row = (ok: boolean, name: string, val: string, ex: string) => (ok ? `- ✓ ${name}: ${val}` : `- ✗ ${name}: (미입력) — 예: ${ex}`)
  return [
    row(spec.payloadKg !== undefined, "페이로드", spec.payloadKg === 0 ? "없음" : `${spec.payloadKg}kg`, "2kg / 500g / 없음"),
    row(spec.rangeKm !== undefined, "비행가능거리", `${spec.rangeKm}km${spec.rangeNote ? ` (${spec.rangeNote})` : ""}`, "총 10km / 반경 5km"),
    row(spec.sizeMm !== undefined, "크기", `${spec.sizeMm}mm${spec.sizeNote ? ` (${spec.sizeNote})` : ""}`, "휠베이스 600mm / 소형"),
    row(spec.flightMin !== undefined, "비행시간", `${spec.flightMin}분`, "30분 / 1시간"),
  ]
}

export function evaluateDesignGate(userTexts: string[], lastAssistantText = ""): GateResult {
  const empty: GateResult = { active: false, complete: true, spec: { rotors: 4, platform: "multirotor", platformExplicit: false }, missing: [] }
  if (userTexts.length === 0) return empty
  const latest = userTexts[userTexts.length - 1]
  const waiting = lastAssistantText.includes(GATE_MARKER)

  // 설계 의도가 시작된 가장 최근 사용자 발화부터 현재까지를 스펙 출처로 삼는다.
  let start = -1
  for (let i = userTexts.length - 1; i >= 0; i--) if (hasDesignIntent(userTexts[i], countSpecFacts(userTexts[i]))) { start = i; break }
  const active = (start >= 0 && start === userTexts.length - 1) || (waiting && start >= 0)
  if (!active) return empty

  const spec = parseSpec(userTexts.slice(start).join("\n"))
  const missing: string[] = []
  if (spec.payloadKg === undefined) missing.push("페이로드")
  if (spec.rangeKm === undefined) missing.push("비행가능거리")
  if (spec.sizeMm === undefined) missing.push("크기")
  if (spec.flightMin === undefined) missing.push("비행시간")

  if (missing.length) {
    const reply = `**${GATE_MARKER}** 드론 설계·구성 질문은 아래 **4가지가 모두** 있어야 추론할 수 있습니다. 하나라도 비면 근거 없는 설계가 되어 답변을 보류합니다.

${fmt(spec).join("\n")}

빠진 항목(**${missing.join(", ")}**)을 한 줄로 알려 주세요. 복사해서 채우셔도 됩니다:
\`페이로드 __kg, 비행가능거리 __km, 크기(휠베이스) __mm, 비행시간 __분\`

대략값이어도 됩니다(예: "30분 정도"). 값은 이후 모든 계산의 전제가 되며, 제가 임의로 채우지 않습니다.`
    return { active: true, complete: false, spec, missing, reply }
  }

  const fe = assess(spec)
  const inputs = fmt(spec).join("\n")
  if (fe.verdict === "불가") {
    const reply = `**추론상 불가 — 이 조건으로는 설계안을 만들지 않습니다.**

${inputs}

**판정 근거 (물리 한계 추정, 운동량 이론 + 에너지 예산)**
- ${fe.detail}
- 필요 평균 비행속도: ${fe.vReq!.toFixed(1)}m/s (총거리 ${spec.rangeKm}km ÷ ${spec.flightMin}분)
- 이 크기(${spec.sizeMm}mm)·페이로드(${spec.payloadKg}kg)에서 낙관 가정 최대 비행시간 ≈ ${fe.maxTimeOpt!.toFixed(0)}분 (보수 가정 ≈ ${fe.maxTimeCons!.toFixed(0)}분)
- 비행시간 ${spec.flightMin}분을 맞추려면 휠베이스가 낙관 가정에서도 ≈ ${fe.minSizeOpt!.toFixed(0)}mm 이상 필요
- 이 크기·시간에서 낙관 가정 최대 페이로드 ≈ ${fe.maxPayloadOpt!.toFixed(1)}kg
${fe.platformAdvice ? `- ${fe.platformAdvice}\n` : ""}
**어떻게 바꾸면 되나요?** 위 한계 안에서 비행시간을 줄이거나, 크기를 키우거나, 페이로드를 줄이거나, 거리/속도 요구를 낮춰 다시 알려 주세요. (추정 가정: 에너지밀도 180~280Wh/kg, 추력 효율·구성품 질량비는 일반 범위 — 실제 제품으로 확정된 값이 아닙니다.)`
    return { active: true, complete: true, spec, missing, reply }
  }

  const N = spec.rotors
  const auw = fe.verdict === "가능" ? fe.cons!.auw : fe.opt!.ok ? fe.opt!.auw : 0
  const augment = spec.platform === "multirotor" && auw ? `총중량 ${auw.toFixed(1)}kg 축거 ${spec.sizeMm}mm ${N === 6 ? "헥사" : N === 8 ? "옥타" : "쿼드"} 비행시간 ${spec.flightMin}분` : ""
  const block = `<design-gate>
설계 전제(사용자 입력 — 바꾸거나 임의 보정 금지):
${inputs}
사전 실현가능성 판정(엔진, 물리 한계 추정): **${fe.verdict}**
- ${fe.detail}
- 필요 평균속도 ${fe.vReq!.toFixed(1)}m/s${spec.sizeNote ? `; 크기는 ${spec.sizeNote}` : ""}
지침: 판정이 "한계"면 답변 첫머리에 "낙관 가정에서만 성립"임을 밝히고 완화 방안을 함께 제시. 판정이 "가능"이어도 추정 총중량·배터리 질량은 "추정"으로 표기. 4가지 입력과 모순되는 설계는 내지 말 것. 제품 스펙(kV·추력·전류·무게 등)은 위키/카탈로그 원문의 값과 단위·측정조건을 그대로 인용하고 반올림·보간·추정으로 바꾸지 말 것. 근거가 없는 수치는 "확인 필요".
</design-gate>`
  return { active: true, complete: true, spec, missing, augment, block }
}
