import type { MatchData, Cand } from "@/lib/product-match"

// 단계 출력 검증기(2026-10-19): AI가 쓴 마크다운을 코드가 판정한다. "서술은 AI, 판정은 코드" 원칙.
// 검증은 결정론적이며(정규식·표 파싱·카탈로그 대조), 위반이 있으면 라우트가 위반 목록을 주고 한 번 다시 쓰게 한 뒤,
// 그래도 남은 위반은 결과 끝에 "서버 검증 결과"로 그대로 공개한다(숨기지 않는다).

export interface Check { ok: boolean; label: string; detail?: string }
export interface Validation { checks: Check[]; issues: string[] }

type Row = Record<string, string>

// 마크다운 표 → 행 목록(헤더 이름을 키로). 헤더에 requiredHeader 문구가 있는 표만 고른다.
export function parseTable(md: string, requiredHeader: RegExp): Row[] {
  const lines = md.split("\n")
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith("|") || !requiredHeader.test(lines[i])) continue
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
    const head = cells(lines[i])
    const rows: Row[] = []
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith("|"); j++) {
      const c = cells(lines[j])
      rows.push(Object.fromEntries(head.map((h, k) => [h, c[k] ?? ""])))
    }
    return rows
  }
  return []
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-*·]/g, "")
const NONE = /후보 없음|확인 필요|미정의|미정|해당 없음|n\/a/i
const SKIP_ROW = /배선|커넥터|기타|볼트|소모품|케이블|하네스/
const colOf = (r: Row, re: RegExp) => Object.entries(r).find(([k]) => re.test(k))?.[1] ?? ""

// 선정안 텍스트가 카탈로그 후보 중 어느 것과 같은지(모델 키 포함 여부)
function matchCand(sel: string, cands: Cand[]): Cand | undefined {
  const s = norm(sel)
  return cands.find((c) => {
    const keys = c.keys?.length ? c.keys : c.modelKey ? [c.modelKey] : []
    if (!keys.some((k) => s.includes(norm(k)))) return false
    if (c.category === "battery") return c.capMah ? s.includes(String(c.capMah)) : true
    return true
  })
}

function qtyOf(text: string): number {
  const m = /[×x]\s*(\d+)\b/i.exec(text) ?? /(\d+)\s*(?:개|병렬|pcs|ea)\b/i.exec(text) ?? /(\d+)\s*P\b/.exec(text)
  return m ? Math.max(1, parseInt(m[1], 10)) : 1
}

// ── 2단계 HW ──
export function validateHw(md: string, d: MatchData, allow?: (selection: string) => boolean): Validation {
  const checks: Check[] = []
  const issues: string[] = []
  const rows = parseTable(md, /구성요소/)
  if (!rows.length) { const m = "HW 구성요소 표를 찾지 못함"; return { checks: [{ ok: false, label: m }], issues: [m] } }

  // R1 카탈로그 외 제품
  const outside: string[] = []
  let paperBat: number | null = null
  let knownMassG = 0
  const matched: { row: Row; cand: Cand; k: number }[] = []
  for (const r of rows) {
    const name = colOf(r, /구성요소/), sel = colOf(r, /선정안/)
    if (SKIP_ROW.test(name) || !sel) continue
    if (NONE.test(sel)) continue
    const cand = matchCand(sel, d.cands)
    if (!cand && allow?.(sel)) { // 논문 구성품은 카탈로그 밖이어도 허용(출처가 논문)
      if (/배터리|battery/i.test(name)) paperBat = paperBatteryWh(`${sel} ${colOf(r, /사양/)}`)
      continue
    }
    if (!cand) { outside.push(`${name}: "${sel.slice(0, 50)}"`); continue }
    const k = /배터리|battery/i.test(name) ? qtyOf(`${sel} ${colOf(r, /사양/)}`) : /모터|motor/i.test(name) ? d.n : 1
    matched.push({ row: r, cand, k })
    if (cand.massG) knownMassG += cand.massG * k
  }
  // R1b 후보가 있는데 '후보 없음'으로 쓴 행(모델이 목록을 무시): 모터·ESC·배터리는 서버 후보가 있으면 반드시 그중에서 고르거나 논문 구성품이어야 한다
  const hadCand = (cat: string) => d.cands.some((c) => c.category === cat)
  const skipped: string[] = []
  for (const r of rows) {
    const name = colOf(r, /구성요소/), sel = colOf(r, /선정안/)
    if (!/후보 없음/.test(sel)) continue
    const cat = /^(모터|motor)/i.test(name) ? "motor" : /^(esc)/i.test(name) ? "esc" : /^(배터리|battery)/i.test(name) ? "battery" : ""
    if (cat && hadCand(cat)) skipped.push(`${name}(후보 ${d.cands.filter((c) => c.category === cat).slice(0, 2).map((c) => c.name.slice(0, 40)).join(" / ")})`)
  }
  checks.push({ ok: skipped.length === 0, label: "서버 후보가 있는 분류를 '후보 없음'으로 쓰지 않음", detail: skipped.length ? skipped.join(" ; ") : undefined })
  if (skipped.length) issues.push(`서버가 후보를 제시했는데 '카탈로그 후보 없음'으로 썼다: ${skipped.join(" ; ")}. <product-match>의 해당 [후보] 목록에서 골라 쓴다.`)
  checks.push({ ok: outside.length === 0, label: "선정안은 모두 카탈로그 후보이거나 '후보 없음'", detail: outside.length ? `카탈로그 후보에 없는 선정: ${outside.join(" / ")}` : undefined })
  if (outside.length) issues.push(`카탈로그 후보에 없는 제품을 선정했다(목록 밖 제품 금지, 없으면 '카탈로그 후보 없음 — 확인 필요'로 쓴다): ${outside.join(" / ")}`)

  // R2 배터리 에너지
  const bat = matched.find((m) => m.cand.category === "battery")
  if (d.needWh != null) {
    if (!bat && paperBat != null) {
      const ok = paperBat >= d.needWh * 0.98
      checks.push({ ok, label: `논문 배터리 에너지 ≥ 엔진 필요 ${d.needWh.toFixed(0)}Wh`, detail: `논문 구성 ${paperBat.toFixed(0)}Wh(셀수×3.7V×용량×수량, 계산)` })
      if (!ok) issues.push(`논문 배터리 ${paperBat.toFixed(0)}Wh가 엔진 필요 에너지 ${d.needWh.toFixed(0)}Wh에 못 미친다. 논문 구성을 바꾸지 말고 표 아래에 이 차이(논문 구성으로는 입력 조건을 만족하지 못함)를 그대로 공개한다.`)
    } else if (bat && bat.cand.whPerUnit) {
      const wh = bat.cand.whPerUnit * bat.k
      const ok = wh >= d.needWh * 0.98
      checks.push({ ok, label: `배터리 에너지 ≥ 필요 ${d.needWh.toFixed(0)}Wh`, detail: `${bat.cand.name} × ${bat.k} = ${wh.toFixed(0)}Wh(전압×용량, 계산)` })
      if (!ok) issues.push(`배터리 에너지 부족: ${bat.cand.name} × ${bat.k} = ${wh.toFixed(0)}Wh < 필요 ${d.needWh.toFixed(0)}Wh. 후보 목록이 제시한 수량 조합(×n)을 그대로 쓰거나 '카탈로그 후보 없음'으로 쓴다.`)
    } else if (!rows.some((r) => /배터리|battery/i.test(colOf(r, /구성요소/)) && NONE.test(colOf(r, /선정안/)))) {
      checks.push({ ok: false, label: "배터리 선정 없음" })
      issues.push("배터리 행이 후보 목록의 제품이 아니다. 후보 조합을 그대로 쓴다.")
    }
  }

  // R3 알려진 부품 질량 합 ≤ 추정 총중량 × 1.15
  const cap = d.auwKg * 1000 * 1.15
  const massOk = knownMassG <= cap
  checks.push({ ok: massOk, label: `카탈로그 값으로 확인되는 부품 질량 합 ≤ 추정 총중량 ${d.auwKg.toFixed(1)}kg의 115%`, detail: `확인된 부품 질량 합 ${(knownMassG / 1000).toFixed(2)}kg (프레임·FC 등 미확인 부품 제외)` })
  if (!massOk) issues.push(`선정한 부품 질량 합 ${(knownMassG / 1000).toFixed(2)}kg이 추정 총중량 ${d.auwKg.toFixed(1)}kg의 115%를 넘는다. 더 가벼운 후보를 고르거나 '후보 없음'으로 쓴다.`)

  // R4 페이로드 질량 ≤ 입력 페이로드
  const pl = matched.find((m) => m.cand.category === "payload")
  if (pl?.cand.massG) {
    const ok = pl.cand.massG <= d.payloadG
    checks.push({ ok, label: "페이로드 질량 ≤ 입력 페이로드", detail: `${pl.cand.name} ${pl.cand.massG}g vs ${d.payloadG}g` })
    if (!ok) issues.push(`페이로드 ${pl.cand.name}(${pl.cand.massG}g)이 입력 페이로드 ${d.payloadG}g를 넘는다.`)
  }

  // R5 프롭 지름 ≤ 상한
  const prop = rows.find((r) => /프로펠러|propeller|프롭/i.test(colOf(r, /구성요소/)))
  if (prop && !NONE.test(colOf(prop, /선정안/))) {
    const m = /(\d{1,2}(?:\.\d+)?)\s*(?:인치|inch|in\b|"|[*x×]\d)/i.exec(`${colOf(prop, /선정안/)} ${colOf(prop, /사양/)}`)
    if (m) {
      const dia = parseFloat(m[1])
      const ok = dia <= d.maxPropIn + 0.5
      checks.push({ ok, label: `프롭 지름 ≤ 상한 ${d.maxPropIn.toFixed(1)}인치`, detail: `선정 ${dia}인치` })
      if (!ok) issues.push(`프롭 지름 ${dia}인치가 축거 기준 상한 ${d.maxPropIn.toFixed(1)}인치를 넘는다.`)
    }
  }

  // R6 ESC 연속 전류 ≥ 모터 최대 시험전류 (rules.json C02, Dai 2019 식 66 — 여유 계수는 논문에 없다)
  const esc = matched.find((m) => m.cand.category === "esc")
  const mot = matched.find((m) => m.cand.category === "motor")
  if (esc?.cand.contA != null && mot?.cand.maxA != null) {
    const ok = esc.cand.contA >= mot.cand.maxA
    checks.push({ ok, label: "ESC 연속 전류 ≥ 모터 최대 시험전류", detail: `${esc.cand.name} ${esc.cand.contA}A vs ${mot.cand.name} ${mot.cand.maxA}A` })
    if (!ok) issues.push(`ESC ${esc.cand.name}의 연속 전류 ${esc.cand.contA}A가 모터 최대 시험전류 ${mot.cand.maxA}A보다 작다. 후보 목록의 ESC 중에서 고른다.`)
  }
  return { checks, issues }
}

// 논문 배터리 선정안 문자열("4S 6750 mAh LiPo ×2")에서 공칭 에너지 계산: 셀수 × 3.7V × 용량 × 수량
function paperBatteryWh(t: string): number | null {
  const sc = /(\d{1,2})\s*S\b/i.exec(t), mah = /(\d{3,6})\s*mAh/i.exec(t)
  if (!sc || !mah) return null
  return parseInt(sc[1], 10) * 3.7 * (parseInt(mah[1], 10) / 1000) * qtyOf(t)
}

// HW 표에서 확정된(카탈로그 일치) 제품 모델 키들
export function hwKeys(hwMd: string, d: MatchData): string[] {
  const out: string[] = []
  for (const r of parseTable(hwMd, /구성요소/)) {
    const c = matchCand(colOf(r, /선정안/), d.cands)
    if (c?.modelKey) out.push(c.modelKey)
  }
  return out
}

// HW 표의 배터리 에너지가 충분한지(기술스펙 검증 단계에서 재사용)
export function hwEnergyOk(hwMd: string, d: MatchData): { ok: boolean; wh: number | null } {
  if (d.needWh == null) return { ok: true, wh: null }
  for (const r of parseTable(hwMd, /구성요소/)) {
    if (!/배터리|battery/i.test(colOf(r, /구성요소/))) continue
    const c = matchCand(colOf(r, /선정안/), d.cands)
    if (c?.whPerUnit) { const wh = c.whPerUnit * qtyOf(`${colOf(r, /선정안/)} ${colOf(r, /사양/)}`); return { ok: wh >= d.needWh * 0.98, wh } }
  }
  return { ok: false, wh: null }
}

// ── 3단계 SW: 실행 위치는 HW 표의 실제 구성요소여야 한다 ──
export function validateSw(md: string, hwMd: string): Validation {
  const checks: Check[] = []
  const issues: string[] = []
  const sw = parseTable(md, /실행 위치/)
  const hw = parseTable(hwMd, /구성요소/)
  if (!sw.length) { const m = "SW 구성요소 표를 찾지 못함"; return { checks: [{ ok: false, label: m }], issues: [m] } }
  const hwNames = hw.flatMap((r) => [colOf(r, /구성요소/), colOf(r, /선정안/)]).filter(Boolean).map(norm)
  const GROUND = /지상|gcs|클라우드|서버|노트북|pc\b|ground|cloud/i
  const bad: string[] = []
  for (const r of sw) {
    const loc = colOf(r, /실행 위치/)
    if (!loc || GROUND.test(loc)) continue
    const n = norm(loc)
    const ok = hwNames.some((h) => h.length >= 3 && (n.includes(h) || h.includes(n)))
    if (!ok) bad.push(`${colOf(r, /구성요소/)} → "${loc.slice(0, 40)}"`)
  }
  checks.push({ ok: bad.length === 0, label: "SW 실행 위치는 HW 표의 구성요소", detail: bad.length ? bad.join(" / ") : undefined })
  if (bad.length) issues.push(`SW 실행 위치가 HW 스펙 표에 없는 하드웨어다(HW 표의 구성요소 이름을 그대로 써라): ${bad.join(" / ")}`)
  return { checks, issues }
}

// ── 4단계 기술 스펙: 체공시간 판정이 에너지 계산과 모순되지 않는가 ──
export function validateTechspec(md: string, hwMd: string, d: MatchData): Validation {
  const checks: Check[] = []
  const issues: string[] = []
  const e = hwEnergyOk(hwMd, d)
  // 판정은 표 행 또는 글머리 줄 어느 형식으로 써도 잡는다
  const rows = parseTable(md, /요구|항목/).filter((r) => /비행시간|체공|endurance/i.test(Object.values(r).join(" ")))
  const lineHit = md.split("\n").find((l) => /비행시간|체공/.test(l) && /(충족|위험|불가|미달|부족)/.test(l) && !l.trim().startsWith("|"))
  if ((rows.length || lineHit) && e.wh != null) {
    const txt = rows.length ? Object.values(rows[0]).join(" ") : lineHit!
    const claimsOk = /충족/.test(txt) && !/위험|불가|미달|부족/.test(txt)
    const ok = !(claimsOk && !e.ok)
    checks.push({ ok, label: "체공시간 판정이 배터리 에너지 계산과 일치", detail: `HW 배터리 ${e.wh.toFixed(0)}Wh vs 필요 ${d.needWh?.toFixed(0)}Wh → ${e.ok ? "충분" : "부족"}` })
    if (!ok) issues.push(`체공시간을 '충족'으로 판정했지만 HW 배터리 ${e.wh.toFixed(0)}Wh는 필요 ${d.needWh?.toFixed(0)}Wh에 못 미친다. '위험/불충족'으로 판정하고 해소 방안을 쓴다.`)
  }
  const keys = hwKeys(hwMd, d)
  const missing = keys.filter((k) => !md.toLowerCase().includes(k))
  const ok2 = keys.length === 0 || missing.length / keys.length <= 0.4
  checks.push({ ok: ok2, label: "확정 기술 스펙이 HW 선정 제품을 반영", detail: missing.length ? `미반영: ${missing.join(", ")}` : undefined })
  if (!ok2) issues.push(`기술 스펙이 HW 스펙의 선정 제품(${missing.join(", ")})을 반영하지 않았다.`)
  return { checks, issues }
}

// ── 5단계 아키텍처 ──
export function validateArchitecture(md: string, hwMd: string, d: MatchData): Validation {
  const checks: Check[] = []
  const issues: string[] = []
  const mm = /```mermaid\s*\n([\s\S]*?)```/.exec(md)
  const headerOk = !!mm && /^\s*(graph|flowchart)\s+(TD|TB|LR|RL|BT)/i.test(mm[1])
  const labelsOk = !!mm && !/\[[^\]]*\([^\])]*\)[^\]]*\]/.test(mm[1].replace(/\[".*?"\]/g, ""))
  checks.push({ ok: headerOk, label: "mermaid 다이어그램 존재·헤더 형식" })
  if (!headerOk) issues.push("mermaid 코드블록이 없거나 'graph TD' 등 헤더가 없다.")
  checks.push({ ok: labelsOk || !mm, label: "mermaid 노드 라벨에 괄호 미사용(렌더 오류 방지)", detail: labelsOk ? undefined : "[...] 라벨 안에 ( ) 가 있으면 렌더가 깨진다. 라벨을 \"큰따옴표\"로 감싸라." })
  if (mm && !labelsOk) issues.push('mermaid 노드 라벨 [ ... ] 안에 괄호가 있다. 라벨 전체를 큰따옴표 "..." 로 감싸라.')
  const keys = hwKeys(hwMd, d)
  const lower = md.toLowerCase()
  const missing = keys.filter((k) => !lower.includes(k))
  const ok = keys.length === 0 || missing.length / keys.length <= 0.4
  checks.push({ ok, label: "아키텍처가 HW 선정 제품을 반영", detail: missing.length ? `미반영: ${missing.join(", ")}` : undefined })
  if (!ok) issues.push(`아키텍처가 HW 선정 제품(${missing.join(", ")})을 모듈에 반영하지 않았다.`)
  return { checks, issues }
}

// ── 6단계 코드·로드맵 ──
export function validateImplementation(md: string, archMd: string): Validation {
  const checks: Check[] = []
  const issues: string[] = []
  const mods = parseTable(archMd, /모듈/).map((r) => colOf(r, /모듈/)).filter(Boolean)
  const fences = (md.match(/```/g) ?? []).length
  checks.push({ ok: fences >= 2 && fences % 2 === 0, label: "코드블록이 열고 닫힘" })
  if (!(fences >= 2 && fences % 2 === 0)) issues.push("코드블록(```)이 없거나 짝이 맞지 않는다.")
  if (mods.length) {
    const lower = norm(md)
    const miss = mods.filter((m) => !lower.includes(norm(m).slice(0, Math.max(4, Math.min(10, norm(m).length)))))
    const ok = miss.length / mods.length <= 0.3
    checks.push({ ok, label: "아키텍처 모듈이 코드 스켈레톤에 대응", detail: miss.length ? `미대응: ${miss.join(", ")}` : undefined })
    if (!ok) issues.push(`아키텍처 모듈 중 코드 스켈레톤에 없는 것: ${miss.join(", ")}. 모듈명을 그대로 파일·클래스명에 반영한다.`)
  }
  const road = /로드맵|마일스톤/.test(md)
  checks.push({ ok: road, label: "개발 로드맵 포함" })
  if (!road) issues.push("개발 로드맵 섹션이 없다.")
  return { checks, issues }
}

export function renderValidation(v: Validation, retried: boolean): string {
  const lines = v.checks.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`)
  const fail = v.checks.filter((c) => !c.ok).length
  return `\n\n---\n\n## 서버 검증 결과 (코드 판정${retried ? " · 위반 1회 자동 재작성 후" : ""})\n${lines.join("\n")}\n\n${fail ? `⚠ 미해결 위반 ${fail}건 — 위 ❌ 항목은 이 결과에서 해소되지 않았다. 반려 사유에 참고해 다시 생성하거나 컨셉 조건을 조정하라.` : "모든 자동 검증 항목 통과."}`
}
