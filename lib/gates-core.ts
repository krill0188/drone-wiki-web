// 하드게이트 코어(2026-10-25): 물리량은 모델이 아니라 이 코드가 계산한다.
// 마스터 제공 drone_gates.py(G0~G8)를 TypeScript로 옮긴 것 — 식과 상수는 원본과 같고, 원본 데모 스펙 두 건의 결과(scripts/test-gates.ts)로 포팅 정확성을 고정한다.
// 판정은 '보수 가정'으로 하고 낙관 가정은 참고값이다. 모든 상수(FM·효율·가용 용량·배선 8%·레일 80%·링크 마진 10dB 등)는 검증된 값이 아닌 가정이다.
export type GateStatus = "PASS" | "FAIL" | "REVIEW"
export interface GateResult { gate: string; status: GateStatus; value: string; rule: string; fix?: string }

const G = 9.80665
export const ASSUMPTIONS = {
  conservative: { fm: 0.55, etaDrive: 0.75, usableLipo: 0.8, usableLiion: 0.85, cruisePowerRatio: 0.95, tempDerate: 0.9 },
  optimistic: { fm: 0.65, etaDrive: 0.85, usableLipo: 0.9, usableLiion: 0.9, cruisePowerRatio: 0.8, tempDerate: 1.0 },
}
type Assump = typeof ASSUMPTIONS.conservative
const CELL_V: Record<string, number> = { lipo: 3.7, liion: 3.6, lihv: 3.85 }

export interface CoreSpec {
  environment?: { altitude_m?: number; temp_c?: number }
  requirements: { auw_max_g?: number; tw_min?: number; endurance_min: number; loiter_min: number }
  mission: { payload_g: number; radius_km: number; cruise_mps: number; wind_mps: number; reserve_frac: number }
  airframe: { n_rotor: number; wheelbase_mm: number; prop_in: number }
  frame_part?: { wheelbase_mm: number; max_prop_in?: number }
  motor: { kv: number; max_thrust_g_datasheet?: number; thrust_limited?: boolean }
  esc: { cont_a: number }
  battery: { chem: string; cells_s: number; capacity_ah: number; voltage_nom_v?: number; energy_wh?: number; mass_g: number; c_cont: number }
  parts: { name: string; mass_g?: number | null; qty?: number }[]
  auw_floor_g?: number // 질량 미상 부품이 있을 때 엔진 추정 AUW를 하한으로 쓴다(과소 추정 방지)
  avionics_loads: { name: string; avg_w: number; peak_w: number; rail: string }[]
  rails?: { name: string; max_w: number }[]
  links?: { name: string; freq_mhz: number; range_km: number; eirp_dbm: number; rx_gain_dbi: number; rx_sens_dbm: number; h_air_m: number; h_gnd_m: number; clutter_m?: number; misc_loss_db?: number; streams_mbps: number[]; hop_factor?: number; phy_rate_mbps: number }[]
}

export const airDensity = (altM: number, tempC: number) => {
  const p = 101325 * (1 - 2.25577e-5 * altM) ** 5.25588
  return p / (287.05 * (tempC + 273.15))
}
const diskArea = (n: number, propIn: number) => n * Math.PI * (propIn * 0.0254 / 2) ** 2
export function hoverPowerW(massKg: number, n: number, propIn: number, rho: number, fm: number, eta: number) {
  const t = massKg * G
  const ideal = t ** 1.5 / Math.sqrt(2 * rho * diskArea(n, propIn))
  return { elec: ideal / (fm * eta), ideal }
}
const staticThrustN = (rpm: number, propIn: number, rho: number, ct = 0.1) => ct * rho * (rpm / 60) ** 2 * (propIn * 0.0254) ** 4
export const fsplDb = (dKm: number, fMhz: number) => 20 * Math.log10(dKm) + 20 * Math.log10(fMhz) + 32.44
export const fresnelR1M = (dKm: number, fGhz: number) => 17.32 * Math.sqrt(((dKm / 2) * (dKm / 2)) / (fGhz * dKm))

export interface GateReport { verdict: "REJECT" | "HOLD" | "ACCEPT"; fail: number; review: number; auwKg: number; rho: number; envelopeKm?: number; hoverW?: number; enduranceMin?: number; whNom?: number; gates: GateResult[] }

export type GateKey = "G0" | "G5" | "G1" | "G2" | "G34" | "G67" | "G8"
export function runGates(s: CoreSpec, only?: Set<GateKey>): GateReport {
  const r: GateResult[] = []
  const add = (gate: string, status: GateStatus, value: string, rule: string, fix = "") => r.push({ gate, status, value, rule, fix })
  const rho = airDensity(s.environment?.altitude_m ?? 0, s.environment?.temp_c ?? 15)
  const cons = ASSUMPTIONS.conservative
  const calc: { vNom?: number; whNom?: number; auwKg?: number; pAv?: number; endCons?: End; endOpt?: End } = {}

  type End = { pH: number; pAv: number; eUse: number; tTransitMin: number; tLoiterMin: number; tHoverTotal: number; ok: boolean }
  const endurance = (a: Assump): End => {
    const f = s.airframe, b = s.battery, mi = s.mission
    const { elec: pH } = hoverPowerW(calc.auwKg!, f.n_rotor, f.prop_in, rho, a.fm, a.etaDrive)
    const pAv = calc.pAv!
    const usable = b.chem === "liion" ? a.usableLiion : a.usableLipo
    const eUse = calc.whNom! * usable * a.tempDerate
    const v = mi.cruise_mps, w = mi.wind_mps, R = mi.radius_km * 1000
    if (v <= w) return { pH, pAv, eUse, tTransitMin: 0, tLoiterMin: 0, tHoverTotal: 0, ok: false }
    const tTransit = R / (v - w) + R / (v + w)
    const eTransit = ((pH * a.cruisePowerRatio + pAv) * tTransit) / 3600
    const eLoiter = eUse - eUse * mi.reserve_frac - eTransit
    return { pH, pAv, eUse, tTransitMin: tTransit / 60, tLoiterMin: (Math.max(0, eLoiter) / (pH + pAv)) * 60, tHoverTotal: (eUse / (pH + pAv)) * 60, ok: true }
  }

  const run = (name: string, fn: () => void, key?: GateKey) => { if (only && key && !only.has(key)) return; try { fn() } catch (e) { add(name, "FAIL", `스펙 필드 누락·계산 오류: ${(e as Error).message}`, "필수 필드 존재") } }

  run("G0 단위·전압 정합", () => {
    const b = s.battery
    const vExpect = b.cells_s * CELL_V[b.chem], vDecl = b.voltage_nom_v ?? vExpect, whCalc = vExpect * b.capacity_ah
    const okV = Math.abs(vDecl - vExpect) / vExpect <= 0.05
    const okWh = b.energy_wh === undefined || Math.abs(b.energy_wh - whCalc) / whCalc <= 0.05
    calc.vNom = vExpect; calc.whNom = whCalc
    add("G0 단위·전압 정합", okV && okWh ? "PASS" : "FAIL", `${b.cells_s}S ${b.chem} → ${vExpect.toFixed(1)} V, ${whCalc.toFixed(1)} Wh (선언 ${+vDecl.toFixed(1)} V${b.energy_wh !== undefined ? `, ${b.energy_wh} Wh` : ""})`, "선언 전압·에너지와 S수×셀전압×Ah 오차 ≤ 5%", okV && okWh ? "" : "전압/Wh 재계산 후 하위 단계 값 전부 갱신")
  }, "G0")
  run("G5 항전 전원 레일", () => {
    const pAvg = s.avionics_loads.reduce((a, l) => a + l.avg_w, 0)
    calc.pAv = pAvg
    const bad: string[] = []
    for (const rail of s.rails ?? []) {
      const peak = s.avionics_loads.filter((l) => l.rail === rail.name).reduce((a, l) => a + l.peak_w, 0)
      if (peak > 0.8 * rail.max_w) bad.push(`${rail.name} 피크 ${peak.toFixed(1)} W > 80% of ${rail.max_w} W`)
    }
    add("G5 항전 전원 레일", bad.length ? "FAIL" : "PASS", `항전 평균 ${pAvg.toFixed(1)} W; ${bad.length ? bad.join("; ") : "레일 여유 충족"}`, "레일별 피크 부하 ≤ 정격의 80%", bad.length ? "전용 BEC 추가 또는 부하 분리" : "")
  }, "G5")
  run("G1 질량 폐합", () => {
    const unknown = s.parts.filter((p) => p.mass_g == null).map((p) => p.name)
    const mParts = s.parts.reduce((a, p) => a + (p.mass_g ?? 0) * (p.qty ?? 1), 0)
    const mMisc = mParts * 0.08
    const sum = mParts + s.battery.mass_g + s.mission.payload_g + mMisc
    const total = Math.max(sum, s.auw_floor_g ?? 0)
    const floored = total > sum
    calc.auwKg = total / 1000
    let status: GateStatus = "PASS", fix = ""
    if (unknown.length) { status = "REVIEW"; fix = `질량 미상 부품: ${unknown.join(", ")}` }
    const target = s.requirements.auw_max_g
    if (target && total > target) { status = "FAIL"; fix = `AUW ${total.toFixed(0)} g > 목표 ${target} g → 목표 상향 또는 부품 경량화` }
    add("G1 질량 폐합", status, `부품 ${mParts.toFixed(0)} + 배터리 ${s.battery.mass_g} + 페이로드 ${s.mission.payload_g} + 배선 ${mMisc.toFixed(0)} = ${sum.toFixed(0)} g${floored ? ` → 질량 미상 부품이 있어 엔진 추정 AUW ${total.toFixed(0)} g를 하한으로 사용` : ""}`, "Σ부품×수량 + 배터리 + 페이로드 + 배선 8% ≤ AUW 목표", fix)
  }, "G1")
  run("G2 형상·프롭 간섭", () => {
    const f = s.airframe, adj = f.wheelbase_mm * Math.sin(Math.PI / f.n_rotor), d = f.prop_in * 25.4, clr = adj - d, need = Math.max(10, 0.08 * d)
    let frameOk = true, fix = ""
    const fr = s.frame_part
    if (fr && Math.abs(fr.wheelbase_mm - f.wheelbase_mm) > 5) { frameOk = false; fix = `선정 프레임 휠베이스 ${fr.wheelbase_mm} mm ≠ 설계 ${f.wheelbase_mm} mm. ` }
    if (fr && f.prop_in > (fr.max_prop_in ?? f.prop_in)) { frameOk = false; fix += `프레임 최대 프롭 ${fr.max_prop_in}in < ${f.prop_in}in. ` }
    if (clr < need) fix += `프롭 ≤ ${((adj - need) / 25.4).toFixed(1)} in 로 축소 또는 휠베이스 확대`
    add("G2 형상·프롭 간섭", clr >= need && frameOk ? "PASS" : "FAIL", `인접 모터 간격 ${adj.toFixed(0)} mm, 프롭 ${d.toFixed(0)} mm, 간극 ${clr.toFixed(0)} mm (필요 ≥ ${need.toFixed(0)})`, "WB·sin(π/n) − D ≥ max(10 mm, 0.08D), 프레임 실물과 설계 일치", fix)
  }, "G2")
  run("G3 추력/중량·G4 전류 여유", () => {
    const f = s.airframe, m = s.motor, auw = calc.auwKg!, twReq = s.requirements.tw_min ?? 2.0, v = calc.vNom!
    let tMax: number, src: string
    if (m.max_thrust_g_datasheet) { tMax = (m.max_thrust_g_datasheet / 1000) * G; src = "데이터시트" }
    else { const rpm = m.kv * v * 0.8; tMax = staticThrustN(rpm, f.prop_in, rho); src = `Ct 근사(rpm≈${rpm.toFixed(0)})` }
    const tw = (tMax * f.n_rotor) / (auw * G)
    const tipMach = (m.kv * v * Math.PI * f.prop_in * 0.0254 / 60) / 343
    let fix = ""
    if (tw < twReq) fix = "KV·전압·프롭 조합 재선정 (추력시험 데이터로 확인)"
    if (tipMach >= 0.7) fix += " 팁 마하 과다 → KV 또는 프롭 축소"
    add("G3 추력/중량", tw >= twReq && tipMach < 0.7 ? "PASS" : "FAIL", `모터당 ${((tMax / G) * 1000).toFixed(0)} gf (${src}), T/W ${tw.toFixed(2)}, 팁마하 ${tipMach.toFixed(2)}`, `T/W ≥ ${twReq}, 무부하 팁 마하 < 0.7`, fix)

    const { elec: pH } = hoverPowerW(auw, f.n_rotor, f.prop_in, rho, cons.fm, cons.etaDrive)
    const tH = (auw * G) / f.n_rotor
    const iMotor = ((pH / f.n_rotor) * (tMax / tH) ** 1.5) / v
    const limited = m.thrust_limited ?? false
    const tOp = limited ? Math.min(tMax, (twReq * auw * G) / f.n_rotor) : tMax
    const iBat = ((pH / f.n_rotor) * (tOp / tH) ** 1.5 / v) * f.n_rotor + (calc.pAv ?? 15) / v
    const cLim = s.battery.c_cont * s.battery.capacity_ah
    const ok = s.esc.cont_a >= 1.2 * iMotor && cLim >= 1.1 * iBat
    let fix2 = ""
    if (s.esc.cont_a < 1.2 * iMotor) fix2 += "ESC 등급 상향. "
    if (cLim < 1.1 * iBat) fix2 += limited ? "고방전 팩 선정" : "고방전 팩 선정, 또는 FC 최대추력 제한 후 motor.thrust_limited=true로 재검증"
    add("G4 전류 여유", ok ? "PASS" : "FAIL", `모터당 풀스로틀 ≈${iMotor.toFixed(1)} A (ESC ${s.esc.cont_a} A), 팩 ${limited ? "운용최대(추력제한)" : "풀스로틀"} ≈${iBat.toFixed(0)} A (허용 ${cLim.toFixed(0)} A)`, "ESC 연속 ≥ 1.2×모터 풀스로틀 전류, 배터리 C×Ah ≥ 1.1×팩 최대전류", fix2)
  }, "G34")
  run("G6 체공시간·G7 임무 프로파일", () => {
    const c = endurance(cons), o = endurance(ASSUMPTIONS.optimistic)
    calc.endCons = c; calc.endOpt = o
    const ok = c.tHoverTotal >= s.requirements.endurance_min
    add("G6 체공시간(호버)", ok ? "PASS" : "FAIL", `보수 ${c.tHoverTotal.toFixed(1)}분 / 낙관 ${o.tHoverTotal.toFixed(1)}분 (호버 ${c.pH.toFixed(0)} W + 항전 ${calc.pAv!.toFixed(0)} W)`, `보수 가정 사용가능 에너지 / (호버+항전) ≥ ${s.requirements.endurance_min}분`, ok ? "" : "배터리 증량(→G1 재검), 항전 전력 절감, 요구 완화")
    const ok2 = c.tLoiterMin >= s.requirements.loiter_min
    add("G7 임무 프로파일", ok2 ? "PASS" : "FAIL", `왕복 이동 ${c.tTransitMin.toFixed(1)}분, 현장 체류 보수 ${c.tLoiterMin.toFixed(1)}분 / 낙관 ${o.tLoiterMin.toFixed(1)}분, 예비 ${Math.round(s.mission.reserve_frac * 100)}%`, `맞바람 포함 왕복 + 예비 후 체류 ≥ ${s.requirements.loiter_min}분`, ok2 ? "" : "반경 축소·순항속도 상향·체류 요구 완화")
  }, "G67")
  run("G8 링크", () => {
    for (const L of s.links ?? []) {
      const d = L.range_km, fspl = fsplDb(d, L.freq_mhz)
      const rx = L.eirp_dbm + L.rx_gain_dbi - fspl - (L.misc_loss_db ?? 3)
      const margin = rx - L.rx_sens_dbm
      const r1 = fresnelR1M(d, L.freq_mhz / 1000)
      const hMid = (L.h_air_m + L.h_gnd_m) / 2 - (L.clutter_m ?? 5)
      const clr = hMid / r1
      const demand = L.streams_mbps.reduce((a, b) => a + b, 0) * (L.hop_factor ?? 1)
      const cap = L.phy_rate_mbps * 0.6
      const fails: string[] = []
      if (margin < 10) fails.push(`링크 마진 ${margin.toFixed(1)} dB < 10`)
      if (clr < 0.6) fails.push(`프레넬 여유 ${clr.toFixed(2)} < 0.6`)
      if (demand > cap) fails.push(`수요 ${demand.toFixed(1)} Mbps > 유효용량 ${cap.toFixed(1)}`)
      add(`G8 링크[${L.name}]`, fails.length ? "FAIL" : "PASS", `FSPL ${fspl.toFixed(1)} dB, 수신 ${rx.toFixed(1)} dBm, 마진 ${margin.toFixed(1)} dB, 프레넬 r1 ${r1.toFixed(1)} m`, "마진 ≥ 10 dB, 중간점 프레넬 여유 ≥ 0.6, 수요×홉계수 ≤ PHY×0.6", fails.join("; "))
    }
  }, "G8")

  const fail = r.filter((x) => x.status === "FAIL").length, review = r.filter((x) => x.status === "REVIEW").length
  let envelopeKm: number | undefined
  const c = calc.endCons
  if (c && c.eUse) {
    const mi = s.mission
    const pCruise = c.pH * cons.cruisePowerRatio + c.pAv, pHover = c.pH + c.pAv
    const eAvail = c.eUse * (1 - mi.reserve_frac)
    const k = 1 / (mi.cruise_mps - mi.wind_mps) + 1 / (mi.cruise_mps + mi.wind_mps)
    envelopeKm = Math.max(0, ((eAvail - (pHover * s.requirements.loiter_min * 60) / 3600) * 3600) / pCruise / k) / 1000
  }
  return { verdict: fail ? "REJECT" : review ? "HOLD" : "ACCEPT", fail, review, auwKg: calc.auwKg ?? 0, rho, envelopeKm, hoverW: calc.endCons?.pH, enduranceMin: calc.endCons?.tHoverTotal, whNom: calc.whNom, gates: r }
}
