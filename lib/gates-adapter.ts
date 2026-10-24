// 빌더 단계 문서(HW 표) → 하드게이트 입력 어댑터 + 결과 표시 블록 (2026-10-25).
// 원칙: 표·본문에 적힌 수치만 읽는다(없는 값은 지어내지 않는다). 읽지 못한 입력은 '확인 필요'로 남기고, 그 게이트는 건너뛴다.
// 모델이 본문에 쓴 총중량·호버 전력·필요 에너지는 코드 계산값과 비교해 크게 어긋나면 공개한다.
import { parseTable } from "./stage-validate"
import { runGates, ASSUMPTIONS, type CoreSpec, type GateKey, type GateReport } from "./gates-core"
import { planMultirotor, type DesignSpec } from "./design-gate"
import { finalBasics, parseFinalSpec } from "./final-spec"

type Row = Record<string, string>
const colOf = (r: Row, re: RegExp) => Object.entries(r).find(([k]) => re.test(k))?.[1] ?? ""
const clean = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/\*\*/g, "")
const num = (s: string) => parseFloat(s.replace(/,/g, ""))
const NONE = /후보 없음|재?확인 필요|미정의|미정/

interface Parsed {
  rotors?: number; propIn?: number; kv?: number; thrustG?: number; escA?: number
  cells?: number; ah?: number; chem: string; batMassG?: number; batText: string
  payloadG: number; frameMm?: number
  parts: { name: string; mass_g: number | null; qty: number; bound?: boolean }[]
  boundNames: string[]
  avFoundW: number
  link?: { freqMhz?: number; txDbm?: number }
}

// 질량 표기: '이하(≤)' 상한값은 정확한 질량이 아니므로 '미상'으로 취급한다(합산하지 않음).
const massOf = (t: string): { g: number; bound: boolean } | null => {
  const tot = /총\s*([\d.]+)\s*(kg|g)\b/i.exec(t)
  const m = tot ?? /(?:무게|질량|중량)\s*[:：]?\s*([≤≥≈~약<>]?)\s*([\d.,]+)\s*(kg|g)\b/i.exec(t)
  if (!m) return null
  const [val, unit, sign] = tot ? [tot[1], tot[2], ""] : [m[2], m[3], m[1]]
  const g = num(val) * (unit.toLowerCase() === "kg" ? 1000 : 1)
  return Number.isFinite(g) && g > 0 ? { g, bound: sign === "≤" || sign === "<" } : null
}

function parseHw(hwMd: string, spec: DesignSpec): Parsed {
  const pushPart = (o: Parsed, name: string, m: { g: number; bound: boolean } | null, qty: number) => {
    if (m?.bound) o.boundNames.push(name)
    o.parts.push({ name, mass_g: m && !m.bound ? m.g : null, qty, bound: m?.bound })
  }
  const out: Parsed = { chem: "lipo", batText: "", payloadG: (spec.payloadKg ?? 0) * 1000, parts: [], boundNames: [], avFoundW: 0 }
  for (const r of parseTable(hwMd, /구성요소/)) {
    const name = clean(colOf(r, /구성요소/)), cls = colOf(r, /클래스/), sel = clean(colOf(r, /선정안/)), sp = clean(colOf(r, /핵심 사양|사양/))
    const t = `${sel}\n${sp}`
    const qty = Math.max(1, parseInt(/[×x]\s*(\d+)\b/i.exec(`${name} ${sel}`)?.[1] ?? /(\d+)\s*(?:개|쌍)/.exec(name)?.[1] ?? "1", 10))
    if (/motor/i.test(cls)) {
      out.rotors = qty > 1 ? qty : out.rotors
      const th = /(?:max\s*thrust|최대\s*추력)[^\d\n]{0,14}([\d.]+)\s*(kgf|kg|gf|g|N)\b/i.exec(t)
      if (th) { const v = num(th[1]), u = th[2].toLowerCase(); out.thrustG = u === "n" ? (v / 9.80665) * 1000 : u.startsWith("kg") ? v * 1000 : v }
      const kv = /KV\s*[:：]?\s*(\d{2,4})|(\d{2,4})\s*KV/i.exec(t); if (kv) out.kv = num(kv[1] ?? kv[2])
      pushPart(out, name, massOf(sp), qty)
    } else if (/esc/i.test(cls)) {
      const a = /(?:정격|연속)?\s*전류[^\d\n]{0,8}([\d.]+)\s*A\b/.exec(t) ?? /(\d+)\s*A\b/.exec(sel); if (a) out.escA = num(a[1])
      pushPart(out, name, massOf(sp), qty)
    } else if (/propeller/i.test(cls)) {
      const p = /(\d+(?:\.\d+)?)\s*(?:인치|inch|in\b|")/i.exec(sel) ?? /지름[^\d\n]{0,6}([\d.]+)/.exec(sp); if (p) out.propIn = num(p[1])
      pushPart(out, name, massOf(sp), qty)
    } else if (/battery/i.test(cls)) {
      out.batText = t
      const s = /총\s*(\d{1,2})\s*S\b/.exec(t) ?? /(\d{1,2})\s*S\b/.exec(t); if (s) out.cells = num(s[1])
      const ah = /([\d.]+)\s*Ah\b/i.exec(t); const mah = /([\d.]+)\s*mAh\b/i.exec(t)
      if (ah) out.ah = num(ah[1]); else if (mah) out.ah = num(mah[1]) / 1000
      if (/li-?ion|리튬\s*이온|21700|18650/i.test(t)) out.chem = "liion"; else if (/\bHV\b|lihv/i.test(t)) out.chem = "lihv"
      const m = massOf(sp); if (m) out.batMassG = m.g
    } else if (/payload/i.test(cls)) {
      // 페이로드 질량은 사용자 입력(4필수항목)을 쓴다
    } else if (/frame/i.test(cls)) {
      const wb = /휠베이스\s*([\d,]+)\s*mm/.exec(t); if (wb) out.frameMm = num(wb[1])
      pushPart(out, name, massOf(sp), 1)
    } else if (/datalink/i.test(cls)) {
      const f = /([\d.]+)\s*GHz/i.exec(t); if (f) out.link = { ...out.link, freqMhz: num(f[1]) * 1000 }
      const d = /\(\s*(\d+(?:\.\d+)?)\s*dBm\s*\)/.exec(t); if (d) out.link = { ...out.link, txDbm: num(d[1]) }
      pushPart(out, name, massOf(sp), qty)
    } else {
      pushPart(out, name, massOf(sp), qty)
      const w = /(?:전력|소비)[^\d\n]{0,6}([\d.]+)(?:\s*[~-]\s*([\d.]+))?\s*W\b/.exec(sp); if (w) out.avFoundW += num(w[2] ?? w[1])
    }
  }
  return out
}

export interface GateNoteInput { spec: DesignSpec; hwMd: string; compareText?: string; finalSpecMd?: string }

function claim(text: string, re: RegExp): number | null { const m = re.exec(text.replace(/\*\*/g, "")); return m ? num(m[1]) : null }

export function buildGateNote({ spec, hwMd, compareText = "", finalSpecMd = "" }: GateNoteInput): string {
  if (!hwMd.trim()) return ""
  const p = parseHw(hwMd, spec)
  // 우선순위: 4단계 확정 스펙 > HW 표 > 기획. 확정 스펙이 읽히면 그 값으로 덮어쓰고 출처를 기록한다.
  const fin = finalSpecMd ? finalBasics(parseFinalSpec(finalSpecMd)) : {}
  const src: Record<string, string> = {}
  const FIN = "doc:4단계 확정 스펙", HWT = "doc:HW 표"
  const pick = <T,>(key: string, hwVal: T | undefined, finVal: T | undefined): T | undefined => { if (finVal !== undefined) { src[key] = FIN; return finVal } if (hwVal !== undefined) src[key] = HWT; return hwVal }
  p.cells = pick("cells", p.cells, fin.cells); p.ah = pick("ah", p.ah, fin.ah); p.propIn = pick("propIn", p.propIn, fin.propIn)
  p.kv = pick("kv", p.kv, fin.kv); p.escA = pick("escA", p.escA, fin.escA); p.batMassG = pick("batMassG", p.batMassG, fin.batMassG)
  if (p.thrustG !== undefined) src.thrustG = HWT
  const missing: string[] = []
  const rotors = p.rotors ?? spec.rotors
  const only = new Set<GateKey>(["G1"])
  if (p.cells && p.ah) { only.add("G0"); only.add("G5") } else missing.push("배터리 S수·용량(Ah)")
  if (p.propIn && spec.sizeMm) only.add("G2"); else missing.push("프롭 지름(인치) 또는 휠베이스")
  if (!p.escA) missing.push("ESC 연속 전류(A)")
  if (!p.thrustG && !p.kv) missing.push("모터 최대추력 또는 KV")
  if (p.cells && p.ah && p.propIn && p.escA && (p.thrustG || p.kv)) only.add("G34")
  if (p.cells && p.ah && p.propIn && spec.flightMin) { only.add("G67") }
  const unknownMass = p.parts.filter((x) => x.mass_g == null).map((x) => x.name)
  const plan = planMultirotor(spec)
  const batMassG = p.batMassG ?? 0
  if (p.batMassG == null) missing.push("배터리 질량")
  const core: CoreSpec = {
    environment: { altitude_m: spec.altitudeM ?? 0, temp_c: 15 },
    requirements: { auw_max_g: spec.maxAuwKg ? spec.maxAuwKg * 1000 : undefined, tw_min: 2.0, endurance_min: spec.flightMin ?? 0, loiter_min: 0 },
    mission: { payload_g: p.payloadG, radius_km: (spec.rangeKm ?? 0) / 2, cruise_mps: 10, wind_mps: 5, reserve_frac: 0.2 },
    airframe: { n_rotor: rotors, wheelbase_mm: spec.sizeMm ?? p.frameMm ?? 0, prop_in: p.propIn ?? 0 },
    motor: { kv: p.kv ?? 0, max_thrust_g_datasheet: p.thrustG, thrust_limited: false },
    esc: { cont_a: p.escA ?? 0 },
    battery: { chem: p.chem, cells_s: p.cells ?? 0, capacity_ah: p.ah ?? 0, mass_g: batMassG, c_cont: 0 },
    parts: p.parts.map((x) => ({ name: x.name, mass_g: x.mass_g, qty: x.qty })),
    avionics_loads: [{ name: "항전 합계(미상 시 가정 15 W)", avg_w: Math.max(15, p.avFoundW), peak_w: Math.max(15, p.avFoundW), rail: "assumed" }],
    auw_floor_g: unknownMass.length && plan ? plan.auw * 1000 : undefined,
  }
  // 배터리 C-rate는 문서에 보통 없다 → 전류 한계 판정은 ESC 쪽만 보도록 큰 값(판정 제외 표시)
  core.battery.c_cont = 1e6
  let rep: GateReport
  try { rep = runGates(core, only) } catch { return "" }
  if (!rep.gates.length) return ""

  const mark = (s: string) => (s === "PASS" ? "🟢 통과" : s === "FAIL" ? "🔴 불합격" : "🟡 확인 필요")
  const lines: string[] = []
  lines.push("\n\n---\n\n## 🧮 서버 계산 게이트 (코드가 계산 — 모델이 본문에 쓴 수치와 별개)\n")
  lines.push(`> 보수 가정(FM ${ASSUMPTIONS.conservative.fm}·구동효율 ${ASSUMPTIONS.conservative.etaDrive}·가용용량 ${Math.round(ASSUMPTIONS.conservative.usableLipo * 100)}%·온도 보정 ${ASSUMPTIONS.conservative.tempDerate})으로 판정한 **1차 근사**이며 실측 전 확정이 아닙니다. 가정: 순항 10 m/s·맞바람 5 m/s·예비 20%·항전 15 W(문서에 없을 때).`)
  lines.push("\n| 게이트 | 판정 | 계산값 | 기준 |\n|---|---|---|---|")
  for (const g of rep.gates) {
    if (g.gate.startsWith("G4")) {
      // 배터리 C-rate는 입력이 없어 판정에서 제외 — ESC 여유만 본다(C×Ah 항은 무한대 처리)
      lines.push(`| ${g.gate} | ${mark(g.status)} | ${g.value.replace(/, 팩 .*$/, "")} | ESC 연속 ≥ 1.2×모터 풀스로틀 전류 (배터리 C-rate는 문서에 없어 제외) |`)
    } else lines.push(`| ${g.gate} | ${mark(g.status)} | ${g.value}${g.fix ? ` — ${g.fix}` : ""} | ${g.rule} |`)
  }
  const diffs: string[] = []
  // 코드 계산값은 '알려진 질량의 합(+엔진 추정 하한)'에서 나온 하한이므로, 본문이 그보다 작을 때만 불일치로 공개한다.
  const cmp = (label: string, said: number | null, code: number | undefined, unit: string, tol = 0.2) => {
    if (said == null || code == null || !Number.isFinite(code) || code <= 0) return
    const d = (code - said) / code
    if (d > tol) diffs.push(`- 🔴 ${label}: 본문 ${said.toLocaleString()}${unit} < 코드 계산 하한 ${Math.round(code).toLocaleString()}${unit} (본문이 ${Math.round(d * 100)}% 적게 씀)`)
  }
  if (compareText) {
    cmp("총중량(AUW)", claim(compareText, /추정 총중량[^|\n]*\|\s*([\d.]+)\s*kg/), rep.auwKg, "kg", 0.15)
    cmp("호버링 전력", claim(compareText, /호버링 전력[^|\n]*\|\s*[≈~]?\s*([\d,]+)\s*W/), rep.hoverW, "W", 0.2)
  }
  if (diffs.length) lines.push("\n**본문 수치 대조** (모델이 쓴 숫자가 코드 계산과 크게 다름)\n" + diffs.join("\n"))
  if (rep.envelopeKm !== undefined && rep.fail) lines.push(`\n가능 영역(보수 가정): 요구 체류를 유지하며 갈 수 있는 최대 반경 ≈ ${rep.envelopeKm.toFixed(1)} km`)
  const review: string[] = []
  if (missing.length) review.push(`읽지 못해 건너뛴 입력: ${[...new Set(missing)].join(", ")}`)
  if (unknownMass.length) review.push(`질량 미상 부품(엔진 추정 총중량을 하한으로 사용): ${unknownMass.join(", ")}`)
  if (p.boundNames.length) review.push(`질량이 '이하(≤)' 상한값으로만 적혀 합산에서 제외: ${p.boundNames.join(", ")}`)
  if (p.link?.freqMhz && p.link.txDbm !== undefined && spec.rangeKm) {
    // 링크: 수신 감도는 문서에 없으므로 '마진 10 dB를 위해 필요한 수신 감도'를 계산해 공개한다(안테나 이득 미상 → 0 dBi 가정)
    const fspl = 20 * Math.log10(Math.max(0.1, spec.rangeKm / 2)) + 20 * Math.log10(p.link.freqMhz) + 32.44
    const need = p.link.txDbm - fspl - 3 - 10
    review.push(`링크: ${p.link.freqMhz / 1000} GHz·${spec.rangeKm / 2} km에서 자유공간 손실 ${fspl.toFixed(1)} dB → 마진 10 dB를 확보하려면 수신 감도 ≤ ${need.toFixed(0)} dBm 필요(송신 ${p.link.txDbm} dBm, 안테나 0 dBi·기타 손실 3 dB 가정). 데이터시트 감도로 확인하세요`)
  }
  if (review.length) lines.push("\n**확인 필요**\n" + review.map((x) => `- 🟡 ${x}`).join("\n"))
  // 입력 출처: 문서에서 가져온 값은 doc:, 가정한 값은 assumption:으로 표시한다
  const rowsSrc: string[] = []
  const add = (name: string, value: string | number | undefined, source: string | undefined) => { if (value !== undefined && source) rowsSrc.push(`| ${name} | ${value} | ${source} |`) }
  add("배터리 S·Ah", p.cells && p.ah ? `${p.cells}S ${p.ah}Ah` : undefined, src.cells ?? src.ah)
  add("배터리 질량", p.batMassG !== undefined ? `${p.batMassG} g` : undefined, src.batMassG)
  add("프롭 지름", p.propIn !== undefined ? `${p.propIn}인치` : undefined, src.propIn)
  add("모터 KV", p.kv, src.kv)
  add("모터 최대추력", p.thrustG !== undefined ? `${p.thrustG} gf` : undefined, src.thrustG)
  add("ESC 연속 전류", p.escA !== undefined ? `${p.escA} A` : undefined, src.escA)
  add("휠베이스", spec.sizeMm !== undefined ? `${spec.sizeMm} mm` : undefined, spec.sizeMm !== undefined ? "doc:사용자 입력(기체 크기)" : undefined)
  add("페이로드", spec.payloadKg !== undefined ? `${spec.payloadKg} kg` : undefined, spec.payloadKg !== undefined ? "doc:사용자 입력" : undefined)
  add("요구 비행시간", spec.flightMin !== undefined ? `${spec.flightMin}분` : undefined, spec.flightMin !== undefined ? "doc:사용자 입력" : undefined)
  add("총중량 하한", plan ? `${(plan.auw * 1000).toFixed(0)} g` : undefined, plan ? "doc:엔진 계산(사용자 4입력으로 산출한 추정 전제)" : undefined)
  add("항전 전력", `${Math.max(15, p.avFoundW)} W`, p.avFoundW > 15 ? HWT : "assumption:문서에 합계가 없어 보수 기본값 15 W")
  add("순항속도 / 맞바람 / 예비", "10 m/s / 5 m/s / 20%", "assumption:문서에 없어 소형 멀티로터 일반 보수값(가정)")
  if (rowsSrc.length) lines.push("\n**입력 출처** (우선순위: 4단계 확정 스펙 > HW 표 > 기획)\n\n| 입력 | 값 | 출처 |\n|---|---|---|\n" + rowsSrc.join("\n"))
  lines.push(`\n종합: 불합격 ${rep.fail}건 · 확인 필요 ${rep.review + review.length ? "있음" : "없음"} — 국내 규정(무게 종별·주파수)은 코드가 판정하지 않으며 사람이 확인해야 합니다.`)
  return lines.join("\n")
}

// 단계 간 일치성 점검용: HW 표에서 읽은 기본 값(배터리 S·Ah, 프롭, KV, 링크 대역 등)
export function hwBasics(hwMd: string) {
  return parseHw(hwMd, { rotors: 4, platform: "multirotor", platformExplicit: true })
}
