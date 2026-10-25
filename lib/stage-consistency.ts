// 단계 간 일치성 점검(2026-10-25): 같은 설계를 단계마다 다르게 서술하는 문제(배터리 용량·프롭·모터·컴패니언·링크 대역·총중량)를
// 코드가 HW 표(기준)와 비교해 공개한다. 우선순위는 4단계 확정 스펙 > HW 표 > 기획이며, 확정 스펙 구역이 생기기 전에는 HW 표가 기준이다.
// 비교는 보수적이다: 대안·후보로 언급된 것일 수 있으므로 '불일치 후보'로만 표시하고 자동 반려하지 않는다.
import catalogFile from "@/data/ontology/products-catalog.json"
import { modelKeyOf, keysFor } from "./product-match"
import { hwBasics } from "./gates-adapter"
import { finalBasics, parseFinalSpec, parseKv } from "./final-spec"
import { parseTable } from "./stage-validate"

type Row = Record<string, string>
const colOf = (r: Row, re: RegExp) => Object.entries(r).find(([k]) => re.test(k))?.[1] ?? ""
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-*·/()]/g, "")
const num = (s: string) => parseFloat(s.replace(/,/g, ""))

interface CatItem { category: string; name: string; keys: string[] }
const CATALOG: CatItem[] = (catalogFile as { items: { category: string; name: string; manufacturer?: string }[] }).items
  .map((i) => ({ category: i.category, name: i.name, keys: keysFor(i.name, i.manufacturer, modelKeyOf(i.name)).map(norm).filter((k) => k.length >= 5) }))
  .filter((i) => i.keys.length)

const CLASS_TO_CAT: [RegExp, string][] = [[/motor/i, "motor"], [/esc/i, "esc"], [/propeller/i, "propeller"], [/battery/i, "battery"], [/flightcontroller/i, "fc"], [/compute/i, "compute"], [/datalink/i, "datalink"], [/frame/i, "frame"]]
const CAT_LABEL: Record<string, string> = { motor: "모터", esc: "ESC", propeller: "프롭", battery: "배터리", fc: "비행제어기", compute: "컴패니언·연산", datalink: "데이터링크", frame: "프레임" }

const mentioned = (text: string, only?: string): CatItem[] => {
  const n = norm(text)
  return CATALOG.filter((i) => (!only || i.category === only) && i.keys.some((k) => n.includes(k)))
}

export interface Conflict { topic: string; base: string; other: string; note?: string }

export function findStageConflicts(hwMd: string, otherText: string, finalMd?: string): { conflicts: Conflict[]; compared: string[]; baseLabel: string } {
  const conflicts: Conflict[] = [], compared: string[] = []
  // 우선순위: 4단계 확정 스펙 > HW 표 > 기획
  const fspec = finalMd ? parseFinalSpec(finalMd) : null
  const fb = fspec?.found ? finalBasics(fspec) : null
  const baseLabel = fb ? "4단계 확정 스펙(+HW 표)" : "HW 표"
  if (!hwMd.trim() || !otherText.trim()) return { conflicts, compared, baseLabel }

  // 1) 카탈로그 제품: HW 표가 고른 제품(분류별)과 다른 같은 분류 제품이 다른 단계에 나오는가
  const selected = new Map<string, Set<string>>()
  for (const r of parseTable(hwMd, /구성요소/)) {
    const cat = CLASS_TO_CAT.find(([re]) => re.test(colOf(r, /클래스/)))?.[1]
    if (!cat) continue
    const sel = colOf(r, /선정안/)
    if (/후보 없음|미정의|미정/.test(sel) && !mentioned(sel, cat).length) continue
    const items = mentioned(sel, cat)
    if (items.length) selected.set(cat, new Set(items.map((i) => i.name)))
  }
  if (fspec?.found) {
    const F2C: [string, string][] = [["모터", "motor"], ["ESC", "esc"], ["프롭", "propeller"], ["배터리", "battery"], ["FC", "fc"], ["컴패니언 컴퓨터", "compute"], ["통신", "datalink"], ["기체", "frame"]]
    for (const [label, cat] of F2C) { const txt = (fspec.fields as Record<string, string | undefined>)[label]; if (!txt) continue; const items = mentioned(txt, cat); if (items.length) selected.set(cat, new Set(items.map((i) => i.name))) }
  }
  for (const [cat, names] of selected) {
    compared.push(CAT_LABEL[cat])
    const others = mentioned(otherText, cat).filter((i) => !names.has(i.name))
    // 같은 제품군의 변형(이름이 서로 포함)은 같은 제품으로 본다
    const real = others.filter((o) => ![...names].some((n) => norm(n).includes(norm(o.name)) || norm(o.name).includes(norm(n))))
    if (real.length) conflicts.push({ topic: CAT_LABEL[cat], base: [...names].join(" / "), other: real.map((r) => r.name).slice(0, 3).join(", "), note: "HW 표에서 고르지 않은 제품" })
  }

  // 2) 수치: 배터리 S·Ah, 프롭 지름, 모터 KV, 총중량
  const b0 = hwBasics(hwMd)
  const b = { ...b0, cells: fb?.cells ?? b0.cells, ah: fb?.ah ?? b0.ah, propIn: fb?.propIn ?? b0.propIn, kv: fb?.kv ?? b0.kv }
  if (b.cells && b.ah) {
    compared.push("배터리 S·Ah")
    const bad: string[] = []
    for (const m of otherText.matchAll(/(\d{1,2})\s*S\b\s*(?:\(\s*[\d.]+\s*V\s*\))?[\s,×x]*([\d.]+)\s*Ah\b/gi)) {
      const S = num(m[1]), Ah = num(m[2])
      const series = b.cells % S === 0 && Math.abs(Ah - b.ah) / b.ah < 0.05 // 직렬 팩 구성의 일부 표기(6S 16Ah ×2 → 총 12S)
      if ((S !== b.cells || Math.abs(Ah - b.ah) / b.ah > 0.05) && !series) bad.push(`${S}S ${Ah}Ah`)
    }
    for (const m of otherText.matchAll(/(\d{1,2})\s*S\b[\s,×x]*([\d,]{3,6})\s*mAh\b/gi)) {
      const S = num(m[1]), Ah = num(m[2]) / 1000
      const series = b.cells % S === 0 && Math.abs(Ah - b.ah) / b.ah < 0.05
      if ((S !== b.cells || Math.abs(Ah - b.ah) / b.ah > 0.05) && !series) bad.push(`${S}S ${Ah}Ah`)
    }
    if (bad.length) conflicts.push({ topic: "배터리 S·Ah", base: `${b.cells}S ${b.ah}Ah`, other: [...new Set(bad)].join(", ") })
  }
  if (b.propIn) {
    compared.push("프롭 지름")
    const bad: string[] = []
    for (const m of otherText.matchAll(/(\d+(?:\.\d+)?)\s*(?:인치|inch|in\b)/gi)) {
      const ctx = otherText.slice(Math.max(0, (m.index ?? 0) - 16), (m.index ?? 0) + 16)
      if (!/프롭|prop|propeller|블레이드/i.test(ctx)) continue
      const v = num(m[1])
      if (Math.abs(v - b.propIn) > 0.5) bad.push(`${v}인치`)
    }
    if (bad.length) conflicts.push({ topic: "프롭 지름", base: `${b.propIn}인치`, other: [...new Set(bad)].join(", ") })
  }
  if (b.kv) {
    compared.push("모터 KV")
    const bad = [...otherText.matchAll(/KV\s*[:：]?\s*(\d{2,4})\b|(?<![A-Za-z0-9])(\d{2,4})\s*KV\b/gi)].map((m) => num(m[1] ?? m[2])).filter((v) => Math.abs(v - b.kv!) / b.kv! > 0.05)
    if (bad.length) conflicts.push({ topic: "모터 KV", base: `${b.kv}KV`, other: [...new Set(bad)].map((v) => `${v}KV`).join(", ") })
  }
  const baseAuw = /추정 총중량[^|\n]*\|\s*\**\s*([\d.]+)\s*kg/.exec(hwMd.replace(/\*\*/g, ""))
  const auwBase = fb?.auwKg ?? (baseAuw ? num(baseAuw[1]) : null)
  if (auwBase) {
    compared.push("총중량")
    const bv = auwBase
    const bad = [...otherText.replace(/\*\*/g, "").matchAll(/(?:AUW|총중량)[^\d\n]{0,14}([\d.]+)\s*kg/gi)].map((m) => num(m[1])).filter((v) => v > 0 && Math.abs(v - bv) / bv > 0.15)
    if (bad.length) conflicts.push({ topic: "총중량(AUW)", base: `${bv} kg`, other: [...new Set(bad)].map((v) => `${v} kg`).join(", ") })
  }

  // 3) 링크 대역: HW 표의 데이터링크 행에 없는 대역을 링크 문맥에서 쓰는가
  const BAND = /\b(9\d{2}|868)\s*MHz|\b(2\.4|5\.8)\s*GHz/gi
  const familyOf = (s: string) => { const out = new Set<string>(); for (const m of s.matchAll(BAND)) out.add(m[1] ? "900" : m[2]); return out }
  const dl = parseTable(hwMd, /구성요소/).filter((r) => /datalink/i.test(colOf(r, /클래스/))).map((r) => Object.values(r).join(" ")).join(" ")
  const baseBands = familyOf(dl)
  if (baseBands.size) {
    compared.push("링크 대역")
    const otherBands = new Set<string>()
    for (const line of otherText.split("\n")) if (/링크|telemetry|텔레메|통신|영상|datalink|radio|lora|무선/i.test(line)) for (const f of familyOf(line)) otherBands.add(f)
    const extra = [...otherBands].filter((f) => !baseBands.has(f))
    if (extra.length) conflicts.push({ topic: "링크 대역", base: [...baseBands].map((f) => (f === "900" ? "900 MHz대" : `${f} GHz`)).join(", "), other: extra.map((f) => (f === "900" ? "900 MHz대" : `${f} GHz`)).join(", "), note: "HW 표 데이터링크 행에 없는 대역" })
  }
  return { conflicts, compared, baseLabel }
}

export function stageConsistencyNote(hwMd: string, otherText: string, otherLabel: string, finalMd?: string): string {
  const { conflicts, compared, baseLabel } = findStageConflicts(hwMd, otherText, finalMd)
  if (!compared.length) return ""
  if (!conflicts.length) return `\n\n---\n\n## 🔀 단계 간 일치성 점검\n\n- 🟢 ${otherLabel}이(가) ${baseLabel}와 모순되는 부품·수치를 보이지 않습니다 (비교 항목: ${compared.join(", ")}).`
  const rows = conflicts.map((c) => `| ${c.topic} | ${c.base} | ${c.other}${c.note ? ` (${c.note})` : ""} |`)
  return `\n\n---\n\n## 🔀 단계 간 일치성 점검 (코드가 비교 — 기준: ${baseLabel}; 우선순위 4단계 확정 스펙 > HW 표 > 기획)\n\n> ${otherLabel}에서 ${baseLabel}와 다르게 쓴 항목입니다. 대안·후보로 언급한 것일 수 있어 자동 반려하지 않습니다. 확정값은 HW 표가 우선이며, 맞지 않으면 해당 단계를 다시 생성하세요.\n\n| 항목 | ${baseLabel} | ${otherLabel} |\n|---|---|---|\n${rows.join("\n")}\n\n비교한 항목: ${compared.join(", ")}`
}

// 서버가 HW 단계에서 치환(제거)한 부품이 다음 단계 본문에 다시 나오는가. HW 출력 끝의 '서버 치환 N건 …: name: "원래 제안" → 대체' 메모를 읽는다.
export function removedPartsReappear(hwMd: string, otherText: string): string[] {
  const m = /서버 치환\s*\d+건[^:\n]*:\s*([^\n]+)/.exec(hwMd)
  if (!m || !otherText.trim()) return []
  const n = norm(otherText), out: string[] = []
  for (const piece of m[1].split(" ; ")) {
    const orig = /"([^"]+)"/.exec(piece)?.[1]
    if (!orig) continue
    const key = modelKeyOf(orig)
    const kn = key ? norm(key) : ""
    if (kn.length >= 5 && n.includes(kn)) out.push(orig.replace(/\s*\(.*$/, "").trim().slice(0, 60))
  }
  return [...new Set(out)]
}
