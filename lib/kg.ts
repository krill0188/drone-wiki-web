import graphJson from "../data/ontology/graph.json"

// 지식그래프 질의 — 답변의 사실(제품·제조사·호환·규칙·검증 claim)은 여기서만 나온다.
// graph.json은 scripts/build-graph.py가 사양 필드·원문 대조 claim으로 만든 결정론 산출물이다.
// 모델은 이 블록을 서술만 하고, 블록에 없는 사실은 "지식그래프에 없음"으로 답한다.

interface KNode { id: string; type: string; label: string; [k: string]: unknown }
interface KEdge { s: string; p: string; o: string; [k: string]: unknown }
const G = graphJson as unknown as { nodes: KNode[]; edges: KEdge[] }

const byId = new Map(G.nodes.map((n) => [n.id, n]))
const out = new Map<string, KEdge[]>()
const inc = new Map<string, KEdge[]>()
for (const e of G.edges) {
  ;(out.get(e.s) ?? out.set(e.s, []).get(e.s)!).push(e)
  ;(inc.get(e.o) ?? inc.set(e.o, []).get(e.o)!).push(e)
}

const CLASS_ALIAS: Record<string, RegExp> = {
  Motor: /모터|motor/i, ESC: /\besc\b|변속기|전자변속/i, Propeller: /프롭|프로펠러|propeller/i, Battery: /배터리|전지|battery|lipo|리튬/i,
  Frame: /프레임|기체 골격|frame|airframe/i, FlightController: /비행\s*제어기|\bfc\b|flight controller|픽스호크|pixhawk/i,
  CompanionComputer: /컴패니언|온보드\s*컴퓨터|임베디드|jetson|젯슨|라즈베리|raspberry|companion/i, DataLink: /데이터\s*링크|통신|텔레메트리|datalink|radio|lte|5g/i,
  Sensor: /센서|라이다|lidar|카메라|camera|gnss|imu/i, Payload: /페이로드|탑재물|짐벌|payload/i,
}
const RULE_ALIAS: Record<string, RegExp> = {
  R01: /호버|hover|정지\s*비행|소모\s*전력|figure of merit|효율/i, R03: /추력|thrust|추력\s*대\s*중량/i, R04: /디스크\s*로딩|disk loading/i,
  R05: /에너지\s*밀도|wh\/kg|비행\s*시간|체공|endurance|배터리\s*용량/i, R06: /구조\s*(질량|비)|기체\s*무게|empty mass/i, R07: /최고\s*속도|최대\s*속도|max speed/i,
  R08: /고정익|양항비|l\/d|vtol/i, C04: /순항|전진\s*비행|forward flight|cruise/i, C02: /esc.*(전류|정격)|전류\s*정격/i, C03: /고도|공기\s*밀도|altitude/i,
}

const mfrOf = (id?: string) => byId.get((out.get(id ?? "") ?? []).find((e) => e.p === "madeBy")?.o ?? "")?.label ?? "?"
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ")
const GENERIC = new Set(["series", "module", "kit", "brushless", "motor", "battery", "propeller", "frame", "drone", "developer", "version", "lipo", "esc", "the", "and", "with", "for", "pro", "mini", "flight", "controller", "computer", "camera", "sensor", "lidar", "radio", "system"])

// 제품명에서 제조사명·괄호를 빼고 2~3단어 구를 만든다(build-graph.py와 같은 기준).
function phrases(n: KNode): string[] {
  const mfr = byId.get((out.get(n.id) ?? []).find((e) => e.p === "madeBy")?.o ?? "")?.label ?? ""
  const w = norm(n.label.replace(/\(.*?\)/g, " ")).replace(norm(mfr), " ").match(/[a-z0-9][a-z0-9\-.]*/g) ?? []
  // 숫자+영문이 섞인 4자 이상 단일 모델명(x650, mn5008, mid-360)도 구로 쓴다 — 길이 비교로 모호성은 걸러진다
  const res: string[] = w.filter((x) => x.length >= 4 && /\d/.test(x) && /[a-z]/.test(x) && !/^\d+(gb|mb|mah|kv|mm|in)$/.test(x))
  for (const k of [2, 3]) for (let i = 0; i + k <= w.length; i++) {
    const g = w.slice(i, i + k)
    if (!g.some((x) => /[a-z]/.test(x) && !GENERIC.has(x))) continue
    const ph = g.join(" ")
    if (ph.length >= 6) res.push(ph)
  }
  return res
}
const PRODUCT_PHRASES = G.nodes.filter((n) => n.type === "Product").map((n) => ({ n, ph: phrases(n) }))

export interface KgResult { block: string; empty: boolean; facts: { id: string; text: string; source?: string }[]; matched: string[]; table?: string }

export function queryKG(question: string): KgResult {
  const q = norm(question)
  const matched = new Set<string>()
  const has = (re: string) => new RegExp(`(?<![a-z0-9])${re.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(q)

  // 1) 제품: 가장 긴 구가 유일하게 맞는 제품만(모호하면 제외)
  const prodHits = PRODUCT_PHRASES.map(({ n, ph }) => ({ n, best: ph.filter(has).sort((a, b) => b.length - a.length)[0] })).filter((x) => x.best)
  const top = Math.max(0, ...prodHits.map((x) => x.best!.length))
  const products = prodHits.filter((x) => x.best!.length === top).slice(0, 6).map((x) => x.n)
  // 2) 제조사
  const mfrs = G.nodes.filter((n) => n.type === "Manufacturer" && n.label.length >= 3 && has(norm(n.label)))
  // 3) 클래스·규칙
  const classes = Object.entries(CLASS_ALIAS).filter(([, re]) => re.test(question)).map(([c]) => `class:${c}`)
  const rules = Object.entries(RULE_ALIAS).filter(([, re]) => re.test(question)).map(([r]) => `rule:${r}`)

  const facts: KgResult["facts"] = []
  const seen = new Set<string>()
  const add = (id: string, text: string, source?: string) => { if (!seen.has(id + text)) { seen.add(id + text); facts.push({ id, text, source }) } }
  const claimLine = (cid: string) => {
    const c = byId.get(cid)
    if (!c) return
    const paper = (out.get(cid) ?? []).find((e) => e.p === "reportedIn")?.o ?? ""
    add(cid, `${c.label}${c.unit ? ` ${c.unit}` : ""} — 조건: ${c.conditions || "-"} (${c.source}, ${c.locator || ""}) 원문: "${String(c.quote ?? "").slice(0, 220)}"`, paper)
  }

  for (const p of products) {
    matched.add(p.id)
    const mfr = (out.get(p.id) ?? []).find((e) => e.p === "madeBy")?.o
    add(p.id, `제품 ${p.label} — 제조사 ${byId.get(mfr ?? "")?.label ?? "?"}, 클래스 ${p.cls}${p.url ? `, 공식 페이지 ${p.url}` : ""}`)
    // 질문이 지목한 클래스(예: "맞는 ESC")의 상대 제품을 먼저, 그다음 엄격한 관계(powersWith)를 느슨한 관계(packFits)보다 먼저
    const asked = new Set(classes.map((c) => c.slice(6)))
    const otherCls = (e: KEdge) => String(byId.get(e.s === p.id ? e.o : e.s)?.cls ?? "")
    const comp = [...(out.get(p.id) ?? []), ...(inc.get(p.id) ?? [])]
      .filter((e) => e.p === "powersWith" || e.p === "packFits")
      .sort((a, b) => Number(asked.has(otherCls(b))) - Number(asked.has(otherCls(a))) || Number(b.p === "powersWith") - Number(a.p === "powersWith"))
      .slice(0, 8)
    for (const e of comp) {
      const other = byId.get(e.s === p.id ? e.o : e.s)
      const why = e.p === "powersWith" ? `ESC 연속 ${e.contA}A ≥ 모터 최대 ${e.motorMaxA}A, ESC 셀 범위 ${e.escCells} / 모터 ${e.motorCells} → 함께 쓸 수 있는 셀 ${e.sharedCells}` : `셀 ${e.cells}S가 허용 범위 안(셀 수만 비교한 느슨한 호환)`
      add(`${e.s}|${e.p}|${e.o}`, `호환: ${byId.get(e.s)?.label} —${e.p}→ ${byId.get(e.o)?.label} (${why})`)
      if (other) matched.add(other.id)
    }
    for (const e of inc.get(p.id) ?? []) if (e.p === "mentions") claimLine(e.s)
  }
  for (const m of mfrs.slice(0, 4)) {
    matched.add(m.id)
    const prods = (inc.get(m.id) ?? []).filter((e) => e.p === "madeBy").map((e) => byId.get(e.s)!).filter(Boolean)
    add(m.id, `제조사 ${m.label} — 지식그래프 등록 제품 ${prods.length}개: ${prods.slice(0, 8).map((p) => `${p.label}(${p.cls})`).join(", ")}${prods.length > 8 ? " 외" : ""}`)
  }
  for (const r of rules) {
    const n = byId.get(r)
    if (!n) continue
    matched.add(r)
    add(r, `규칙 ${n.label} — 구현 ${n.status}, 근거 상태 ${n.sourceStatus}`)
    for (const e of inc.get(r) ?? []) if (e.p === "supports") claimLine(e.s)
  }
  // 클래스만 걸린 질문: 그 클래스에 관한 검증 claim(about)과 등록 제품 수
  for (const c of classes) {
    matched.add(c)
    const prods = (inc.get(c) ?? []).filter((e) => e.p === "isA").length
    add(c, `클래스 ${c.slice(6)} — 등록 제품 ${prods}개`)
    if (!products.length && !mfrs.length) for (const e of (inc.get(c) ?? []).filter((e) => e.p === "about").slice(0, 8)) claimLine(e.s)
  }

  // 호환 표는 코드가 완성해 제공한다 — 모델이 표를 다시 쓰다 셀 범위·전류를 틀리는 문제를 막는다(2026-10-19 E2E에서 확인).
  let table = ""
  const target = products.find((p) => ["Motor", "ESC"].includes(String(p.cls)))
  if (target) {
    const rows = [...(out.get(target.id) ?? []), ...(inc.get(target.id) ?? [])].filter((e) => e.p === "powersWith")
    if (rows.length) {
      const motorSide = target.cls === "Motor"
      const head = motorSide ? "| ESC | 제조사 | 연속전류 | ESC 셀 범위 | 모터 셀 범위 | 함께 쓸 수 있는 셀 | 출처 |" : "| 모터 | 제조사 | 모터 최대전류 | 모터 셀 범위 | ESC 셀 범위 | 함께 쓸 수 있는 셀 | 출처 |"
      table = [head, "|---|---|---|---|---|---|---|", ...rows.slice(0, 20).map((e) => {
        const o = byId.get(motorSide ? e.s : e.o)
        return motorSide
          ? `| ${o?.label} | ${mfrOf(o?.id)} | ${e.contA}A | ${e.escCells} | ${e.motorCells} | ${e.sharedCells} | [KG:${o?.id}] |`
          : `| ${o?.label} | ${mfrOf(o?.id)} | ${e.motorMaxA}A | ${e.motorCells} | ${e.escCells} | ${e.sharedCells} | [KG:${o?.id}] |`
      })].join("\n")
    }
  }

  const limited = facts.slice(0, 40)
  const block = limited.length
    ? `<knowledge-graph>
지식그래프(제조사 공식 사양 + 원문 대조된 논문 claim + 공학 규칙)에서 질문과 연결된 사실이다. 각 줄의 [KG:id]를 인용 표기로 쓴다.
${limited.map((f) => `[KG:${f.id}] ${f.text}`).join("\n")}${table ? `\n\n[호환 표 — 코드가 생성한 완성본. 답변에 이 표를 한 글자도 바꾸지 말고 그대로 붙여 넣는다]\n${table}` : ""}
</knowledge-graph>`
    : `<knowledge-graph>
(질문과 연결된 노드가 지식그래프에 없음)
</knowledge-graph>`
  return { block, empty: limited.length === 0, facts: limited, matched: [...matched], table }
}

// 프롬프트에 넣는 그래프 규모 요약(위키 문서 지도 대신). 무엇이 그래프에 있고 없는지 모델이 알게 한다.
export function kgSummary(): string {
  const c = (t: string) => G.nodes.filter((n) => n.type === t).length
  const e = (p: string) => G.edges.filter((x) => x.p === p).length
  return `<kg-scope>
지식그래프 범위: 제조사 ${c("Manufacturer")}, 제품 ${c("Product")}(클래스 ${c("Class")}종), 공학 규칙 ${c("Rule")}, 원문 대조 claim ${c("Claim")}(논문 ${c("Paper")}편).
관계: 제조(madeBy) ${e("madeBy")}, ESC-모터 구동 호환 ${e("powersWith")}, 배터리 셀 호환 ${e("packFits")}, claim→규칙 ${e("supports")}, claim→제품 언급 ${e("mentions")}.
범위 밖: 역사·정책·뉴스·일반 개념 설명은 그래프에 없다.
</kg-scope>`
}
