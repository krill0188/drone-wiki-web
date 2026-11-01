import lawFile from "../data/ontology/law-claims.json"
import { REGULATORY } from "./kg-plan"

// 법령 조문 원문 인용(3단계). 설계: docs/law-stage3-design.md §4.6~4.8.
// 선정 조문 80건(law-claims.json, 정본 scripts/add-law-claims.py)에서 질문과 맞는 조문을 골라, 서버가 "조문 인용 블록"을 만든다.
// 모델을 부르지 않는다: 조문 원문 + 출처 링크 + 시행일을 코드가 완성본으로 만들고, 적용 여부·법적 결론은 말하지 않는다(환각·유추 차단).
// KG_LAW_TEXT=1 일 때만 쓴다(기본 off, KG_EVENTS·KG_LAW_EVENTS 와 독립). 선정에 없는 조문을 직접 물으면 "수록되어 있지 않습니다"와 법제처 링크로 안내한다.

export const lawTextEnabled = () => process.env.KG_LAW_TEXT === "1"

export interface LawArticle {
  id: string; law_id: string; law_name: string; mst: string; article: string; title: string; text: string
  effective: string; article_effective: string; partial_effective: string[]; url: string; sha256: string; fetched_at: string
}
const ARTICLES = (lawFile as unknown as { claims: LawArticle[] }).claims
export const LAW_ARTICLES: readonly LawArticle[] = ARTICLES
const LAW_ORDER = ["law:aviation-safety-act", "law:aviation-safety-act-decree", "law:aviation-safety-act-rule", "law:aviation-business-act", "law:drone-promotion-act", "law:military-base-act"]
const LAW_NAME = new Map(ARTICLES.map((a) => [a.law_id, a.law_name]))

// 질문에서 법령을 알아보는 표현. 긴 이름을 먼저 본다('항공안전법 시행규칙'이 '항공안전법'으로 잘못 잡히지 않도록).
const LAW_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "law:aviation-safety-act-rule", re: /항공안전법\s*시행규칙|시행규칙/ },
  { id: "law:aviation-safety-act-decree", re: /항공안전법\s*시행령|시행령/ },
  { id: "law:aviation-safety-act", re: /항공안전법/ },
  { id: "law:aviation-business-act", re: /항공사업법/ },
  { id: "law:drone-promotion-act", re: /드론\s*활용의?\s*촉진\s*및\s*기반\s*조성에?\s*관한\s*법률|드론\s*활용\s*촉진법|드론법/ },
  { id: "law:military-base-act", re: /군사기지\s*및\s*군사시설\s*보호법|군사기지법/ },
]
const FULL_NAME_FOR_LINK: Record<string, string> = {
  "law:aviation-safety-act": "항공안전법", "law:aviation-safety-act-decree": "항공안전법 시행령", "law:aviation-safety-act-rule": "항공안전법 시행규칙",
  "law:aviation-business-act": "항공사업법", "law:drone-promotion-act": "드론 활용의 촉진 및 기반조성에 관한 법률", "law:military-base-act": "군사기지 및 군사시설 보호법",
}
const nz = (s: string) => s.replace(/\s+/g, "")
const lawLink = (lawId: string, article: string) => `https://www.law.go.kr/법령/${nz(FULL_NAME_FOR_LINK[lawId])}/${article}`

// 질문 낱말(공백 제거)이 조문 제목에 들어 있으면 가중치를 준다. 조문 단위 질문의 핵심어.
const STRONG: { term: string; w: number; title?: string }[] = [  // title: 질문 낱말과 다른 제목 낱말에 대응시킬 때(예: 처벌 → 제목의 '죄')
  { term: "특별비행승인", w: 12 }, { term: "비행승인", w: 9 }, { term: "조종자증명", w: 9 }, { term: "안전성인증", w: 9 }, { term: "안전교육", w: 9 },
  { term: "전문교육기관", w: 9 }, { term: "변경신고", w: 9 }, { term: "말소신고", w: 9 }, { term: "시험비행", w: 9 }, { term: "과태료", w: 9 },
  { term: "사용사업", w: 9 }, { term: "비행안전구역", w: 9 }, { term: "보호구역", w: 9 }, { term: "드론특별자유화구역", w: 9 }, { term: "드론시범사업구역", w: 9 },
  { term: "보험", w: 9 }, { term: "특례", w: 9 }, { term: "처벌", w: 9, title: "죄" }, { term: "벌금", w: 9, title: "죄" }, { term: "징역", w: 9, title: "죄" }, { term: "사고", w: 9 }, { term: "드론공원", w: 9 }, { term: "드론교통관리", w: 9 }, { term: "긴급비행", w: 9 }, { term: "구조지원", w: 9 }, { term: "준수사항", w: 9 }, { term: "항공보험", w: 9 },
]
// 제목 낱말 중 너무 일반적이라 단독으로 점수를 주지 않는 것
const GENERIC = new Set(["정의", "목적", "청문", "수수료", "권한", "위임", "위탁", "지정", "관리", "운영", "기준", "범위", "등", "및", "의", "관련", "대한", "에서", "적용", "특례", "준용규정"])
// 질문의 일상어를 조문 제목의 법령어로 바꿔 덧붙인다(원문은 그대로 두고 비교용 문자열만 확장).
const SYNONYMS: { re: RegExp; add: string }[] = [
  { re: /드론(?!특|시범|공원|교통|산업|활용|법|사업)|무인기/, add: "초경량비행장치" },
  { re: /드론사업|사업.{0,10}등록|등록.{0,6}사업|사업자\s*등록|사업\s*허가/, add: "사용사업등록" },
  { re: /기체\s*신고|(드론|기체|무인기).{0,8}등록(?!.{0,6}사업)/, add: "초경량비행장치신고" }, // 일상어 '등록'은 법령상 '신고'
  { re: /비행.{0,6}승인|승인.{0,6}비행/, add: "비행승인" },
  { re: /야간|비가시|시야\s*밖|BVLOS|육안.{0,4}벗어/i, add: "특별비행승인" },
]
const THRESHOLD = 9
const MAX_ARTICLES = 8
const MAX_CHARS = 7000
const STALE_DAYS = 7

// ── 본문 검색 보완 경로: 글자 2-gram BM25 ─────────────────────────────────────────────
// 제목 낱말 규칙은 표현이 달라지면 놓친다(2026-11-01 새 질문 14건 중 6건). 한국어는 조사가 붙어 낱말 단위 검색이 약하므로 낱말 안의 글자 2-gram 으로 제목(3배)+본문을 색인한다.
const bigrams = (s: string): string[] => {
  const out: string[] = []
  for (const w of s.toLowerCase().split(/[^가-힣a-z0-9]+/)) for (let i = 0; i + 1 < w.length; i++) out.push(w.slice(i, i + 2))
  return out
}
const BM = (() => {
  const docs = ARTICLES.map((a) => { const tf = new Map<string, number>(); for (const g of [...bigrams(a.title), ...bigrams(a.title), ...bigrams(a.title), ...bigrams(a.text)]) tf.set(g, (tf.get(g) ?? 0) + 1); return { a, tf, len: [...tf.values()].reduce((x, y) => x + y, 0) } })
  const df = new Map<string, number>()
  for (const d of docs) for (const g of d.tf.keys()) df.set(g, (df.get(g) ?? 0) + 1)
  const avg = docs.reduce((x, d) => x + d.len, 0) / docs.length
  return { docs, df, avg, N: docs.length }
})()
const idf = (g: string) => Math.log(1 + (BM.N - (BM.df.get(g) ?? 0) + 0.5) / ((BM.df.get(g) ?? 0) + 0.5))
const BM_MIN_COVERAGE = 0.5, BM_MIN_MATCHED = 5
function bm25Match(nq: string, lawFilter: Set<string> | null): { a: LawArticle; s: number }[] {
  const qg = [...new Set(bigrams(nq))].filter((g) => BM.df.has(g)) // 법령 코퍼스에 아예 없는 2-gram(질문 어미 등)은 제외
  if (qg.length < BM_MIN_MATCHED) return []
  const total = qg.reduce((x, g) => x + idf(g), 0)
  const scored = BM.docs.filter((d) => !lawFilter || lawFilter.has(d.a.law_id)).map((d) => {
    let s = 0, cov = 0, matched = 0
    for (const g of qg) { const f = d.tf.get(g); if (!f) continue; matched++; cov += idf(g); s += idf(g) * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / BM.avg))) }
    return { a: d.a, s, cov: cov / total, matched }
  }).filter((x) => x.cov >= BM_MIN_COVERAGE && x.matched >= BM_MIN_MATCHED).sort((x, y) => y.s - x.s)
  return scored.length ? scored.filter((x) => x.s >= scored[0].s * 0.6) : []
}

export interface LawMatch { articles: LawArticle[]; missing: { lawId: string; article: string }[]; direct: boolean; omitted: number }

function mentionedLaws(q: string): { id: string; at: number }[] {
  const out: { id: string; at: number }[] = []
  let rest = q
  for (const p of LAW_PATTERNS) {
    const m = p.re.exec(rest)
    if (!m) continue
    out.push({ id: p.id, at: m.index })
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length) // 같은 낱말이 짧은 법령 이름으로 다시 잡히지 않게 지운다
  }
  return out.sort((a, b) => a.at - b.at)
}

const LEGAL_CUE = /법|규정|규제|조문|조항|의무|처벌|벌금|허가|승인|신고|등록|자격|증명|제한|금지|과태료|근거|인증|면허|교육|기준|대상/
const LAWISH = /드론|무인기|비행승인|조종자|초경량|비행장치|무인항공|군사기지|비행안전구역|보호구역|특별자유화|시범사업|사용사업/
export const lawGate = (q: string) => REGULATORY.test(q) || LAWISH.test(q)
export function matchLawArticles(question: string): LawMatch | null {
  const q = question.trim()
  const laws = mentionedLaws(q)
  const refs = [...q.matchAll(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g)].map((m) => ({ key: `제${m[1]}조${m[2] ? `의${m[2]}` : ""}`, at: m.index ?? 0 }))
  // ① 직접 지정: 법령 이름이 함께 있고 조 번호가 있으면 그 조문(없으면 '미수록')
  if (laws.length && refs.length) {
    const found: LawArticle[] = [], missing: LawMatch["missing"] = []
    for (const r of refs) {
      const before = laws.filter((l) => l.at < r.at)
      const lawId = (before.length ? before[before.length - 1] : laws[0]).id
      const hit = ARTICLES.find((a) => a.law_id === lawId && a.article === r.key)
      if (hit) { if (!found.includes(hit)) found.push(hit) } else if (!missing.some((m) => m.lawId === lawId && m.article === r.key)) missing.push({ lawId, article: r.key })
    }
    if (found.length || missing.length) return { articles: found.slice(0, MAX_ARTICLES), missing, direct: true, omitted: Math.max(0, found.length - MAX_ARTICLES) }
  }
  // ② 주제 매칭: 법령 질문일 때만(기존 REGULATORY 판정 + 드론 법규 낱말). 공학·설계 질문에는 조문 블록을 붙이지 않는다.
  if (!lawGate(q)) return null
  const qs = LAW_PATTERNS.reduce((acc, p) => acc.replace(p.re, " "), q) // 법령 이름 속 낱말('활용'·'기반조성')이 조문 제목과 겹쳐 점수를 받지 않게 이름 부분은 뺀다
  const nq = nz(qs) + SYNONYMS.filter((x) => x.re.test(q)).map((x) => x.add).join("")
  const lawFilter = laws.length ? new Set(laws.map((l) => l.id)) : null
  const scored = ARTICLES.filter((a) => !lawFilter || lawFilter.has(a.law_id)).map((a) => {
    const nt = nz(a.title).replace(/등$/, "")
    let s = 0
    if (nt.length >= 4 && nq.includes(nt)) s += 12
    for (const st of STRONG) if (nq.includes(st.term) && nz(a.title).includes(st.title ?? st.term)) s = Math.max(s, st.w)
    const toks = a.title.split(/[\s·ㆍ,()]+/).map((t) => t.replace(/(의|을|를|은|는|에|에서|및)$/, "")).filter((t) => t.length >= 2)
    for (const t of new Set(toks)) {
      if (GENERIC.has(t)) { if (lawFilter && nq.includes(t)) s += THRESHOLD; continue }
      if (nq.includes(t)) s += lawFilter && t.length === 2 ? THRESHOLD : t.length >= 4 ? 5 : 4 // 법령을 지정했으면 '벌칙'처럼 두 글자 제목어도 충분한 신호
    }
    return { a, s }
  }).filter((x) => x.s >= THRESHOLD)
  if (!scored.length) {
    if (!LEGAL_CUE.test(q) && !laws.length) return null // 보완 검색은 법령 단서어가 있을 때만(드론 일반 질문이 조문으로 오탐되지 않게)
    const bm = bm25Match(nq, lawFilter)
    return bm.length ? { articles: bm.slice(0, MAX_ARTICLES).map((x) => x.a), missing: [], direct: false, omitted: Math.max(0, bm.length - MAX_ARTICLES) } : null
  }
  const top = Math.max(...scored.map((x) => x.s))
  const picked = scored.filter((x) => x.s >= Math.max(THRESHOLD, top * 0.5)).sort((x, y) => y.s - x.s || LAW_ORDER.indexOf(x.a.law_id) - LAW_ORDER.indexOf(y.a.law_id) || x.a.id.localeCompare(y.a.id, "en", { numeric: true }))
  return { articles: picked.slice(0, MAX_ARTICLES).map((x) => x.a), missing: [], direct: false, omitted: Math.max(0, picked.length - MAX_ARTICLES) }
}

const quote = (t: string) => t.split("\n").map((l) => `> ${l}`).join("\n")
const dayDiff = (from: string, now: Date) => Math.floor((now.getTime() - Date.parse(from)) / 86_400_000)

// 서버가 만드는 조문 인용 블록. 같은 법령끼리 묶고, 글자 수 상한을 넘으면 뒤쪽 조문은 링크 안내로 대신한다.
export function renderLawBlock(m: LawMatch, now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10)
  const byLaw = new Map<string, LawArticle[]>()
  let used = 0, cut = 0
  for (const a of [...m.articles].sort((x, y) => LAW_ORDER.indexOf(x.law_id) - LAW_ORDER.indexOf(y.law_id))) {
    if (used + a.text.length > MAX_CHARS && used > 0) { cut++; continue }
    used += a.text.length
    ;(byLaw.get(a.law_id) ?? byLaw.set(a.law_id, []).get(a.law_id)!).push(a)
  }
  const parts: string[] = []
  for (const [lawId, arts] of byLaw) {
    const eff = arts[0].effective, fetched = arts.map((a) => a.fetched_at).sort()[0]
    const head = `**관련 조문** — ${LAW_NAME.get(lawId)} (시행 ${eff}${eff > today ? " · 시행 예정" : ""} · 수집 ${fetched})`
    const body = arts.map((a) => {
      const notes: string[] = []
      if (a.partial_effective.length) notes.push(`일부는 ${a.partial_effective.join(", ")} 시행`)
      if (a.article_effective !== a.effective) notes.push(`이 조문 시행 ${a.article_effective}`)
      return `${quote(a.text)}\n> \n> 출처: [${a.article} — 법제처](${a.url})${notes.length ? ` · ${notes.join(" · ")}` : ""}`
    })
    const age = dayDiff(fetched, now)
    parts.push([head, ...(age >= STALE_DAYS ? [`⚠ 수집한 지 ${age}일이 지나 최신 개정이 반영되지 않았을 수 있습니다.`] : []), "", body.join("\n\n")].join("\n"))
  }
  const rest = m.omitted + cut
  const intro = "법령 질문이라 모델이 풀어 쓰지 않고, 위키에 수록된 **조문 원문**을 그대로 보여 드립니다. 질문의 상황에 이 조문이 적용되는지, 비행이 가능한지는 판단하지 않습니다."
    + (m.direct ? "" : "\n\n⚠ 조문 번호를 직접 지정하지 않은 질문이라 **관련 있어 보이는 조문을 자동으로 골랐습니다.** 질문과 맞지 않는 조문이 섞이거나 필요한 조문이 빠졌을 수 있으니 출처 링크의 법제처 원문으로 확인하세요.")
  const missing = m.missing.map((x) => `- ${FULL_NAME_FOR_LINK[x.lawId]} ${x.article}은(는) 이 위키에 수록된 조문이 아닙니다(드론 관련 조문만 선별 수록). 법제처 원문: [${x.article}](${lawLink(x.lawId, x.article)})`)
  const tail = `${rest ? `표시하지 못한 관련 조문이 ${rest}건 더 있습니다. 질문을 좁히거나 조문 번호로 물어보세요.\n\n` : ""}<sub>조문 원문이며 법적 자문이 아닙니다. 이 위키는 드론 관련 조문만 선별해 수록하며 별표·시행 이후 개정은 반영하지 못할 수 있습니다. 적용 여부는 법제처 원문과 전문가에게 확인하세요.</sub>`
  return [intro, ...(missing.length ? [missing.join("\n")] : []), ...parts, tail].join("\n\n")
}

export function renderMatch(m: LawMatch, now: Date): { text: string; ids: string[] } { return { text: renderLawBlock(m, now), ids: m.articles.map((a) => a.id) } }

export function lawTextAnswer(question: string, now: Date = new Date()): { text: string; ids: string[] } | null {
  const m = matchLawArticles(question)
  return m ? { text: renderLawBlock(m, now), ids: m.articles.map((a) => a.id) } : null
}
