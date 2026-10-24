// 4단계 '확정 기술 스펙 요약' 파서(2026-10-25): 우선순위 4단계 확정 스펙 > HW 표 > 기획. 수치를 '추출'만 한다(계산 없음).
// 형식: `1. **모터**: 제품명 · KV 135 · 4개` 처럼 번호(또는 -) + **라벨**: 값. 형식이 깨지면 기술 스펙 단계를 다시 쓰게 한다.
export const FINAL_LABELS = ["기체", "모터", "ESC", "프롭", "배터리", "총중량(AUW)", "FC", "컴패니언 컴퓨터", "통신", "페이로드"] as const
export type FinalLabel = (typeof FINAL_LABELS)[number]

const ALIAS: [RegExp, FinalLabel][] = [
  [/^기체|프레임|frame/i, "기체"], [/^모터|motor/i, "모터"], [/^esc/i, "ESC"], [/^프롭|propeller|prop/i, "프롭"], [/^배터리|battery/i, "배터리"],
  [/총중량|auw|mtow/i, "총중량(AUW)"], [/^fc|비행제어/i, "FC"], [/컴패니언|companion|연산/i, "컴패니언 컴퓨터"], [/^통신|링크|datalink/i, "통신"], [/페이로드|payload/i, "페이로드"],
]
const num = (s: string) => parseFloat(s.replace(/,/g, ""))
const UNDECIDED = /^\s*(미정|없음|해당 없음|n\/a|-)\s*$/i

export interface FinalSpec { found: boolean; fields: Partial<Record<FinalLabel, string>>; section: string }

export function parseFinalSpec(md: string): FinalSpec {
  const m = /확정 기술 스펙[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/.exec(md)
  const section = m ? m[1] : ""
  const fields: FinalSpec["fields"] = {}
  for (const line of section.split("\n")) {
    const mm = /^\s*(?:\d+\.|[-*])\s*\*\*(.+?)\*\*\s*[:：]\s*(.+)$/.exec(line)
    if (!mm) continue
    const label = ALIAS.find(([re]) => re.test(mm[1].trim()))?.[1]
    if (label && !fields[label]) fields[label] = mm[2].trim()
  }
  return { found: Object.keys(fields).length > 0, fields, section }
}

export interface FinalBasics {
  cells?: number; ah?: number; batMassG?: number; propIn?: number; kv?: number; escA?: number; auwKg?: number; wheelbaseMm?: number; payloadKg?: number
  motorName?: string; companion?: string; linkText?: string
}
export function finalBasics(fs: FinalSpec): FinalBasics {
  const f = fs.fields, out: FinalBasics = {}
  const val = (k: FinalLabel) => (f[k] && !UNDECIDED.test(f[k]!) ? f[k]! : undefined)
  const bat = val("배터리")
  if (bat) {
    const s = /총\s*(\d{1,2})\s*S\b/i.exec(bat) ?? /(\d{1,2})\s*S\b/i.exec(bat); if (s) out.cells = num(s[1])
    const ah = /([\d.]+)\s*Ah\b/i.exec(bat), mah = /([\d,]{3,6})\s*mAh\b/i.exec(bat)
    if (ah) out.ah = num(ah[1]); else if (mah) out.ah = num(mah[1]) / 1000
    const ms = /(?:질량|무게)\s*[:：]?\s*[≈~약]?\s*([\d.,]+)\s*(kg|g)\b/i.exec(bat) ?? /([\d.,]+)\s*(kg)\b/i.exec(bat)
    if (ms) out.batMassG = num(ms[1]) * (ms[2].toLowerCase() === "kg" ? 1000 : 1)
  }
  const prop = val("프롭"); if (prop) { const p = /(\d+(?:\.\d+)?)\s*(?:인치|inch|in\b|")/i.exec(prop); if (p) out.propIn = num(p[1]) }
  const mot = val("모터"); if (mot) { const k = /KV\s*[:：]?\s*(\d{2,4})|(\d{2,4})\s*KV/i.exec(mot); if (k) out.kv = num(k[1] ?? k[2]); out.motorName = mot.split(/[·,(]/)[0].trim() }
  const esc = val("ESC"); if (esc) { const a = /(\d+)\s*A\b/.exec(esc); if (a) out.escA = num(a[1]) }
  const auw = val("총중량(AUW)"); if (auw) { const a = /([\d.]+)\s*kg/i.exec(auw); if (a) out.auwKg = num(a[1]) }
  const fr = val("기체"); if (fr) { const w = /([\d,]{3,5})\s*mm/i.exec(fr); if (w) out.wheelbaseMm = num(w[1]) }
  const pl = val("페이로드"); if (pl) { const a = /([\d.]+)\s*kg/i.exec(pl); if (a) out.payloadKg = num(a[1]) }
  out.companion = val("컴패니언 컴퓨터"); out.linkText = val("통신")
  return out
}

// 구조 게이트: 번호+**라벨**: 값 형식의 항목이 5개 미만이면 형식이 깨진 것으로 본다.
export function finalSpecStructureIssue(md: string): string | null {
  const fs = parseFinalSpec(md)
  const n = Object.keys(fs.fields).length
  if (n >= 5) return null
  return `'## 5. 확정 기술 스펙 요약'이 형식(번호 + **라벨**: 값)을 따르지 않는다(읽은 항목 ${n}개, 최소 5개). 기체·모터·ESC·프롭·배터리·총중량(AUW)·FC·컴패니언 컴퓨터·통신·페이로드를 "1. **모터**: 제품명 · KV · 개수" 형식으로 한 줄씩 써라`
}
