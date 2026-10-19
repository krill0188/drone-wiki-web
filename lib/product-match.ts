import catalogFile from "@/data/ontology/products-catalog.json"
import { planMultirotor, type DesignSpec } from "@/lib/design-gate"

// 제품 매칭(2026-10-19): 엔진 계산(planMultirotor)이 낸 필요 추력·에너지를 제조사 공식 페이지에서 수집한
// 실제 제품 카탈로그(data/ontology/products-catalog.json, 수집 폴더 hw-collection/20261019)와 대조해
// 모터 → 배터리 → ESC 후보를 고른다. 규칙: 카탈로그 값은 원문 그대로 인용하고, 없으면 "카탈로그 후보 없음"으로 남긴다.
// 시험표(전압·프롭·스로틀별 전류·추력)가 있는 모터만 전류·전력을 보간해 호버 전력을 구한다 — 그 외는 정격 추력만 비교한다.

interface Num { value: number; unit: string; raw: string; label: string }
interface MotorVariant { name: string; kv: number | null; weight_g: Num | null; max_current_A: Num | null; max_power_W: Num | null; cells: { min: number; max: number; raw: string } | null }
interface TestRow { kv: string | null; voltage_V: number | null; prop: string | null; throttle_pct: number; current_A: number; power_W: number; thrust_g: number; rpm: number }
interface Item {
  id: string; category: string; manufacturer: string; name: string; url: string
  variants?: MotorVariant[]; test_rows?: TestRow[]; max_thrust_kg_page?: number | null
  continuous_A?: number | null; peak_A?: number | null; cells?: { min: number; max: number } | null
  max_thrust_raw?: string | null; specs?: Record<string, string>; diameter_in?: number | null; pitch_in?: number | null; capacity_mAh?: number | null; cells_S?: number | null; nominal_V?: number | null; weight_g?: Num | null; c_rate?: string | null
}
const ITEMS = (catalogFile as { items: Item[] }).items

export interface Cand { category: string; name: string; modelKey: string | null; keys?: string[]; massG: number | null; whPerUnit?: number; capMah?: number; cells?: number; maxThrustG?: number; ratedOnly?: boolean }
export interface MatchData { cands: Cand[]; needWh: number | null; auwKg: number; n: number; maxPropIn: number; maxThrustG: number; hoverG: number; payloadG: number }
export interface MatchResult { block: string; found: boolean; data?: MatchData }

// 선정안 문자열 매칭용 모델 키: 이름에서 처음 나오는 "영문+숫자" 모델 토큰(MN3510, Tekko32 …). 없으면 용량 토큰(4500mah).
const UNITLIKE = /^\d+(\.\d+)?(v|c|s|mah|ah|kv|g|mm|kg|w|a|wh|hz|ghz|mhz|inch|in)$/i
const CONNECTOR = /^(xt|ec|as|qs|jst|dean)\d+/i
export function modelKeyOf(name: string): string | null {
  const toks = name.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean)
  const t = toks.find((x) => /^[a-z]+\d{2,}[a-z0-9]*$/.test(x) && !UNITLIKE.test(x) && !CONNECTOR.test(x) && !/^\d+in\d+$/.test(x) && !/^(kv|ip|am|hd)\d+$/.test(x))
  if (t) return t
  const cap = toks.find((x) => /^\d{3,6}mah$/.test(x))
  return cap ?? toks.find((x) => /\d/.test(x) && x.length >= 4 && !UNITLIKE.test(x)) ?? null
}
// 선정안 문자열 매칭 키 모음: 모델 토큰 + 제품 핵심명(제조사명 제외 앞 두 토큰, 예 "minimesh", "here3", "skynodes")
export function keysFor(name: string, manufacturer: string | undefined, modelKey: string | null): string[] {
  const manu = new Set((manufacturer ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const toks = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  while (toks.length && manu.has(toks[0])) toks.shift()
  const core = toks.slice(0, 2).join("")
  const keys = [modelKey, core.length >= 5 ? core : null].filter((x): x is string => !!x)
  return [...new Set(keys)]
}
const massOf = (i: Item): number | null => (i.weight_g?.value ?? null)

const fmt = (x: number, d = 1) => x.toFixed(d)
const cellsOf = (v: number) => Math.round(v / 3.7)

// 스로틀-추력 시험표에서 목표 추력(g)일 때의 전류·전력을 선형 보간한다. 범위 밖이면 null.
function interp(rows: TestRow[], thrustG: number) {
  const r = [...rows].sort((a, b) => a.thrust_g - b.thrust_g)
  if (r.length < 3) return null
  if (thrustG < r[0].thrust_g * 0.8 || thrustG > r[r.length - 1].thrust_g) return null
  const clamp = thrustG < r[0].thrust_g
  const t = clamp ? r[0].thrust_g : thrustG
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1]
    if (t >= a.thrust_g && t <= b.thrust_g && b.thrust_g > a.thrust_g) {
      const f = (t - a.thrust_g) / (b.thrust_g - a.thrust_g)
      return { currentA: a.current_A + f * (b.current_A - a.current_A), powerW: a.power_W + f * (b.power_W - a.power_W), clamped: clamp }
    }
  }
  const last = r[r.length - 1]
  return { currentA: last.current_A, powerW: last.power_W, clamped: false }
}

interface MotorPick {
  item: Item; variant?: MotorVariant; kv: string; voltage: number; prop: string; cells: number
  hoverW: number; hoverA: number; clamped: boolean; maxA: number; maxThrustG: number; ratedA?: number; weightG?: number
}

// 시험표 프롭 표기("15*5CF", "R17*5.8CF", "G40x13.1")의 지름(인치)
const propDiameter = (p: string) => (/(\d{1,2}(?:\.\d+)?)\s*[*x×]/i.exec(p) ? parseFloat(/(\d{1,2}(?:\.\d+)?)\s*[*x×]/i.exec(p)![1]) : null)

function pickMotors(item: Item, N: number, hoverG: number, maxG: number, maxPropIn: number): MotorPick[] {
  const out: MotorPick[] = []
  const groups = new Map<string, TestRow[]>()
  for (const r of item.test_rows ?? []) {
    if (r.voltage_V == null || !r.prop || r.voltage_V < 6) continue
    const k = `${r.kv}|${r.voltage_V}|${r.prop}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const [key, rows] of groups) {
    const top = rows.reduce((a, b) => (b.throttle_pct > a.throttle_pct ? b : a))
    if (top.thrust_g < maxG) continue
    const it = interp(rows, hoverG)
    if (!it) continue
    const [kv, v, prop] = key.split("|")
    const dia = propDiameter(prop)
    if (dia != null && dia > maxPropIn + 0.5) continue // 축거 안에 들어가는 프롭만
    const variant = item.variants?.find((x) => x.name.toUpperCase().includes(kv.toUpperCase()))
    out.push({ item, variant, kv, voltage: Number(v), prop, cells: cellsOf(Number(v)), hoverW: it.powerW * N, hoverA: it.currentA * N, clamped: it.clamped, maxA: top.current_A, maxThrustG: top.thrust_g, ratedA: variant?.max_current_A?.value, weightG: variant?.weight_g?.value })
  }
  return out
}


// ── 모터·배터리·ESC 외 분류(프레임·페이로드·컴패니언·링크·GNSS): 조건에 맞는 후보를 원문 라벨로 나열한다. 모델은 이 안에서만 고른다. ──
const KEYLAB = /mcu|processor|imu|sensors|firmware|can|uart|weight|mass|wheelbase|payload|power|consumption|resolution|range|frequency|band|tops|dimension|size|interface|latency|bandwidth|data rate|ram|cpu|gpu|flight time|mtow|takeoff/i
function excerpt(it: Item, n = 6): string {
  const sp = it.specs ?? {}
  const keys = Object.keys(sp).filter((k) => KEYLAB.test(k)).slice(0, n)
  const use = keys.length ? keys : Object.keys(sp).slice(0, n)
  return use.map((k) => `${k}: ${String(sp[k]).slice(0, 60)}`).join("; ").slice(0, 330)
}
// 라벨에서 길이(mm)·무게(g)를 읽는다(원문 문자열 → 숫자, 실패하면 null)
function grams(it: Item): number | null {
  for (const [k, v] of Object.entries(it.specs ?? {})) {
    if (!/weight|mass|무게/i.test(k) || /package|shipping|takeoff|payload|max/i.test(k)) continue
    const m = /^\D*?(\d[\d,.]*)\s*(?:±\s*[\d.]+\s*)?(kg|g)\b/i.exec(String(v))
    if (m) return parseFloat(m[1].replace(/,/g, "")) * (m[2].toLowerCase() === "kg" ? 1000 : 1)
  }
  return null
}
function wheelbaseMm(it: Item): number | null {
  for (const [k, v] of Object.entries(it.specs ?? {})) {
    if (!/wheelbase|diagonal|휠베이스|축거/i.test(k)) continue
    const m = /(\d[\d,.]*)\s*(mm|cm|m)\b/i.exec(String(v))
    if (m) return parseFloat(m[1].replace(/,/g, "")) * (m[2].toLowerCase() === "cm" ? 10 : m[2].toLowerCase() === "m" ? 1000 : 1)
  }
  return null
}
function section(title: string, items: Item[], extra?: (i: Item) => string): string[] {
  if (!items.length) return [`\n[${title}] 카탈로그 후보 없음 — 확인 필요`]
  return [`\n[${title}]`, ...items.map((i, k) => `${k + 1}. ${i.manufacturer} ${i.name}${extra ? extra(i) : ""}: ${excerpt(i)} — ${i.url}`)]
}
function otherCategories(spec: DesignSpec, auwKg: number, bestProp: string | null, cands: Cand[]): string[] {
  const out: string[] = []
  const reg = (category: string, items: Item[], mass: (i: Item) => number | null) => items.forEach((i) => cands.push({ category, name: i.name, modelKey: modelKeyOf(i.name), massG: mass(i) }))
  const by = (c: string) => ITEMS.filter((i) => i.category === c && i.specs && Object.keys(i.specs).length)
  const sizeMm = spec.sizeMm!
  // 프레임: 휠베이스 ±35% 이고, 기체 자체 중량(원문 무게)이 추정 총중량의 45% 이하(엔진의 구조·항공전자 질량비 상한)인 것만
  const frameCapG = auwKg * 1000 * 0.45
  const frames = by("frame").map((i) => ({ i, w: wheelbaseMm(i), g: grams(i) })).filter((x) => x.w != null && Math.abs(x.w! - sizeMm) / sizeMm <= 0.35 && x.g != null && x.g! <= frameCapG).sort((a, b) => Math.abs(a.w! - sizeMm) - Math.abs(b.w! - sizeMm)).slice(0, 3).map((x) => x.i)
  reg("frame", frames, grams)
  out.push(...section(`프레임·기체 후보 — 휠베이스 ${Math.round(sizeMm)}mm ±35%, 자체 중량 ≤ ${Math.round(frameCapG)}g(추정 총중량 ${auwKg.toFixed(1)}kg의 45%)`, frames, (i) => ` (자체 중량 ${Math.round(grams(i)!)}g)`))
  if (bestProp) {
    const m = /(\d{1,2}(?:\.\d+)?)\s*[*x×]\s*(\d{1,2}(?:\.\d+)?)/i.exec(bestProp)
    if (m) {
      const d = parseFloat(m[1]), pch = parseFloat(m[2])
      const props = ITEMS.filter((i) => i.category === "propeller" && i.diameter_in != null && Math.abs(i.diameter_in - d) <= 0.6 && (i.pitch_in == null || Math.abs(i.pitch_in - pch) <= 0.8)).slice(0, 3)
      reg("propeller", props, massOf)
      out.push(`\n[프로펠러 후보 — 1순위 모터 시험표 프롭 ${bestProp}(지름 ${d}인치, 피치 ${pch})]`)
      if (!props.length) out.push("카탈로그 후보 없음 — 확인 필요")
      props.forEach((i, k) => out.push(`${k + 1}. ${i.manufacturer} ${i.name}: 지름 ${i.diameter_in}인치, 피치 ${i.pitch_in ?? "미확인"}인치${i.weight_g ? `, 무게 ${i.weight_g.raw}` : ""}${(i as unknown as { recommended_thrust_rpm?: string }).recommended_thrust_rpm ? `, 권장 추력/RPM ${(i as unknown as { recommended_thrust_rpm?: string }).recommended_thrust_rpm}` : ""} — ${i.url}`))
    }
  }
  const payloadG = (spec.payloadKg ?? 0) * 1000
  const cams = by("payload").map((i) => ({ i, g: grams(i) })).filter((x) => x.g != null && x.g! <= payloadG).sort((a, b) => b.g! - a.g!).slice(0, 4).map((x) => x.i)
  reg("payload", cams, grams)
  out.push(...section(`페이로드(카메라·센서 포드) 후보 — 무게 ≤ 페이로드 ${spec.payloadKg}kg(원문 무게 기준)`, cams, (i) => ` (무게 ${Math.round(grams(i)!)}g)`))
  const fcs = by("fc").filter((i) => /px4|ardupilot/i.test(Object.values(i.specs ?? {}).join(" "))).sort((a, b) => (/holybro|cubepilot|ark/i.test(a.manufacturer) ? 0 : 1) - (/holybro|cubepilot|ark/i.test(b.manufacturer) ? 0 : 1)).slice(0, 4)
  reg("fc", fcs, grams)
  out.push(...section("비행제어기(FC) 후보 — PX4/ArduPilot 지원 표기가 있는 것", fcs))
  const comp = by("compute").slice(0, 5)
  reg("compute", comp, grams)
  out.push(...section("컴패니언 컴퓨터 후보", comp))
  const dl = by("datalink")
  const pick = (re: RegExp, n: number) => dl.filter((i) => re.test(i.name)).slice(0, n)
  const links = [...pick(/manet|mesh|streamcaster|doodle|silvus|microhard|mobilicom/i, 3), ...pick(/video|o4|o3|herelink|transmission|hd|walksnail|air unit/i, 2), ...pick(/sik|telemetry|rfd|crossfire|elrs|radio/i, 2)]
  const linkSet = [...new Map(links.map((i) => [i.id, i])).values()]
  reg("datalink", linkSet, grams)
  out.push(...section("데이터링크 후보(MANET·영상·텔레메트리) — 영상은 Mbps급 링크만", linkSet))
  const gnss = by("sensor").filter((i) => /gnss|gps|rtk|f9p|neo-m|zed-f/i.test(i.name)).slice(0, 3)
  reg("sensor", gnss, grams)
  out.push(...section("GNSS 후보", gnss))
  return out
}

function packCandidates(cells: number, needWh: number) {
  const packs = ITEMS.filter((i) => i.category === "battery" && i.cells_S === cells && i.capacity_mAh && i.nominal_V && i.weight_g?.value)
  return packs.flatMap((b) => [1, 2, 3].map((k) => ({ b, k, wh: k * b.nominal_V! * (b.capacity_mAh! / 1000), kg: (k * b.weight_g!.value) / 1000 })))
    .filter((c) => c.wh >= needWh).sort((a, b) => a.kg - b.kg)
}

export function matchProducts(spec: DesignSpec, opts?: { fixed?: Partial<Pick<MotorPick, "cells">> }): MatchResult {
  const plan = planMultirotor(spec)
  if (!plan) return { block: "", found: false }
  const N = spec.rotors
  const hoverG = (plan.auw / N) * 1000
  const maxG = ((2 * plan.auw) / N) * 1000
  const maxPropIn = ((spec.sizeMm! / 1000) * Math.sin(Math.PI / N) * 0.95) / 0.0254
  const cands: Cand[] = []
  const payloadG = (spec.payloadKg ?? 0) * 1000
  let needWhOut: number | null = null
  const motors = ITEMS.filter((i) => i.category === "motor")
  const picks = motors.flatMap((m) => pickMotors(m, N, hoverG, maxG, maxPropIn))
    .filter((p) => !opts?.fixed?.cells || p.cells === opts.fixed.cells)
    .filter((p) => p.ratedA === undefined || p.maxA <= p.ratedA * 1.05)
    .sort((a, b) => a.hoverW - b.hoverW)
  const seen = new Set<string>()
  const distinct = picks.filter((p) => (seen.has(p.item.id + p.kv) ? false : (seen.add(p.item.id + p.kv), true)))
  // 배터리 조합이 실제로 존재하는 모터를 앞에 둔다(같은 셀 수의 팩이 카탈로그에 없으면 그 모터는 현실적 선정이 아님)
  const hasPack = (p: MotorPick) => packCandidates(p.cells, (p.hoverW * (spec.flightMin! / 60)) / plan.dod).length > 0
  const top = [...distinct.slice(0, 12)].sort((a, b) => Number(hasPack(b)) - Number(hasPack(a)) || a.hoverW - b.hoverW).slice(0, 3)

  // 정격 추력만 있는 후보(시험표 없음): 필요 최대추력 이상 중 가장 근접한 것부터. 셀 수·전류·무게는 첫 변형의 페이지 값.
  const ratedOnly = motors.filter((m) => !(m.test_rows?.length) && m.max_thrust_kg_page != null && m.max_thrust_kg_page * 1000 >= maxG)
    .sort((a, b) => a.max_thrust_kg_page! - b.max_thrust_kg_page!).slice(0, 5)

  const head = `필요(엔진 추정, ${plan.label}): 총중량 ${fmt(plan.auw)}kg, 프롭 지름 상한 ≈ ${fmt(maxPropIn, 1)}인치, ${N}로터 → 모터당 호버 추력 ≈ ${fmt(hoverG, 0)}g, 최대추력 ≥ ${fmt(maxG, 0)}g(추력 대비 중량비 2:1)`
  if (!top.length && !ratedOnly.length) {
    return { found: false, block: `<product-match>\n${head}\n결과: 카탈로그(제조사 공식 페이지 수집 ${ITEMS.length}개)에 이 조건을 만족하는 모터 후보 없음 → HW 표의 모터·ESC·프롭·배터리는 "카탈로그 후보 없음 — 확인 필요"로 쓰고, 이름이나 수치를 지어내지 말 것.\n</product-match>` }
  }

  const lines: string[] = [`<product-match>`, head, `아래는 수집 카탈로그(제조사 공식 페이지 원문, 2026-10-19)에서 서버가 고른 후보다. HW 표의 모터·배터리·ESC는 이 목록에서 고르고, 사양 칸의 수치는 아래 값을 그대로 인용하라(근거 칸에 URL). 목록에 없는 부품은 "카탈로그 후보 없음 — 확인 필요".`]
  top.forEach((p) => cands.push({ category: "motor", name: `${p.item.name} ${p.kv}`, modelKey: modelKeyOf(p.item.name), massG: p.weightG ?? null, maxThrustG: p.maxThrustG, cells: p.cells }))
  ratedOnly.forEach((m) => cands.push({ category: "motor", name: m.name, modelKey: modelKeyOf(m.name), massG: m.variants?.[0]?.weight_g?.value ?? null, maxThrustG: (m.max_thrust_kg_page ?? 0) * 1000, ratedOnly: true }))
  if (top.length) {
    lines.push("\n[모터 후보 — 시험표 보간(공식 페이지 추력 시험)]")
    top.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.item.manufacturer} ${p.item.name} / ${p.kv} / ${p.voltage}V(${p.cells}S) / 프롭 ${p.prop}: 100% 스로틀 추력 ${p.maxThrustG}g @ ${p.maxA}A(시험표), 호버 추정 전류 ${fmt(p.hoverA / N)}A·전력 ${fmt(p.hoverW / N, 0)}W/모터(시험표 선형 보간${p.clamped ? ", 최저 시험행 값으로 보수 적용" : ""})${p.weightG ? `, 모터 무게 ${p.weightG}g(${p.variant?.weight_g?.raw})` : ""}${p.ratedA ? `, 정격 전류 ${p.ratedA}A(${p.variant?.max_current_A?.label})` : ", 정격 전류 미확인"} — ${p.item.url}`)
    })
  }
  if (ratedOnly.length) {
    lines.push("\n[참고: 정격 최대추력만 확인(시험표 없음 — 호버 전력 계산 불가, 정격 비교만)]")
    ratedOnly.forEach((m, i) => {
      const v = m.variants?.[0]
      lines.push(`${i + 1}. ${m.manufacturer} ${m.name}: 페이지 표기 최대추력 ${m.max_thrust_raw ?? m.max_thrust_kg_page + "kg"}${v?.kv ? `, KV ${v.kv}` : ""}${v?.cells ? `, ${v.cells.raw}` : ""}${v?.max_current_A ? `, 최대 전류 ${v.max_current_A.raw}` : ""}${v?.weight_g ? `, 무게 ${v.weight_g.raw}` : ""} — ${m.url}`)
    })
  }

  const best = top[0]
  if (best) {
    // 배터리: 시험 전압의 셀 수와 같은 팩에서 필요 에너지를 만족하는 최소 중량 조합(병렬 1~3개)
    const needWh = (best.hoverW * (spec.flightMin! / 60)) / plan.dod
    needWhOut = needWh
    const cand = packCandidates(best.cells, needWh).slice(0, 2)
    lines.push(`\n[배터리 후보 — 1순위 모터 기준 ${best.cells}S, 필요 에너지 ≈ ${fmt(needWh, 0)}Wh = (${N}×${fmt(best.hoverW / N, 0)}W × ${spec.flightMin}분/60) ÷ 방전깊이 ${plan.dod} · 비행제어기·페이로드 전력 별도, 계산값]`)
    if (!cand.length) lines.push(`${best.cells}S 팩 중 병렬 3개 이내로 ${fmt(needWh, 0)}Wh를 만족하는 카탈로그 후보 없음 — 확인 필요`)
    const peakA = N * best.maxA
    cand.forEach((c) => cands.push({ category: "battery", name: c.b.name, modelKey: modelKeyOf(c.b.name), massG: c.b.weight_g!.value, whPerUnit: c.b.nominal_V! * (c.b.capacity_mAh! / 1000), capMah: c.b.capacity_mAh!, cells: c.b.cells_S ?? undefined }))
    cand.forEach((c, i) => {
      const cr = /(\d+(?:\.\d+)?)\s*C\b/i.exec(c.b.c_rate ?? "")
      const maxA = cr ? parseFloat(cr[1]) * (c.b.capacity_mAh! / 1000) * c.k : null
      const dis = maxA == null ? "방전율 환산 불가(페이지 표기: " + (c.b.c_rate ?? "미확인") + ")" : maxA >= peakA ? `방전 가능 전류 ≈ ${fmt(maxA, 0)}A(=${c.b.c_rate}×용량×${c.k}) ≥ 최대 시험전류 합 ${fmt(peakA, 0)}A` : `⚠ 방전 가능 전류 ≈ ${fmt(maxA, 0)}A < 최대 시험전류 합 ${fmt(peakA, 0)}A — 최대 스로틀에서 부족할 수 있음`
      lines.push(`${i + 1}. ${c.b.manufacturer} ${c.b.name} × ${c.k}: ${c.b.nominal_V}V × ${c.b.capacity_mAh}mAh = ${fmt(c.wh, 0)}Wh(계산), 합계 무게 ${fmt(c.kg, 2)}kg(페이지 값 ${c.b.weight_g!.raw}), ${dis} — ${c.b.url}`)
    })
    // ESC: 시험표 100% 전류 이상, 셀 수 포함
    const escs = ITEMS.filter((i) => i.category === "esc" && i.continuous_A && i.continuous_A >= best.maxA && (!i.cells || (i.cells.min <= best.cells && i.cells.max >= best.cells)))
      .sort((a, b) => a.continuous_A! - b.continuous_A!).slice(0, 2)
    escs.forEach((e) => cands.push({ category: "esc", name: e.name, modelKey: modelKeyOf(e.name), massG: null }))
    lines.push(`\n[ESC 후보 — 모터 최대 시험전류 ${best.maxA}A 이상, ${best.cells}S 지원]`)
    if (!escs.length) lines.push("조건을 만족하는 ESC 카탈로그 후보 없음 — 확인 필요")
    escs.forEach((e, i) => lines.push(`${i + 1}. ${e.manufacturer} ${e.name}: 연속 ${e.continuous_A}A${e.peak_A ? ` / 피크 ${e.peak_A}A` : ""}${e.cells ? `, ${e.cells.min}~${e.cells.max}S` : ""} — ${e.url}`))
  }
  lines.push(...otherCategories(spec, plan.auw, top[0]?.prop ?? null, cands))
  lines.push("\n규칙: 위 후보 목록 안에서만 선정하고 선정안 칸에 제품명을, 근거 칸에 URL을 쓴다. 배터리는 표의 '수량(×n)'을 포함해 후보가 제시한 조합 그대로 쓰고, 합계 Wh가 필요 에너지에 못 미치는 단품 구성은 금지. 후보가 없는 분류는 '카탈로그 후보 없음 — 확인 필요'.")
  lines.push("</product-match>")
  const withKeys = cands.map((c) => {
    const it = ITEMS.find((i) => c.name === i.name || c.name.startsWith(i.name))
    return { ...c, keys: keysFor(c.name, it?.manufacturer, c.modelKey) }
  })
  return { found: true, block: lines.join("\n"), data: { cands: withKeys, needWh: needWhOut, auwKg: plan.auw, n: N, maxPropIn, maxThrustG: maxG, hoverG, payloadG } }
}
