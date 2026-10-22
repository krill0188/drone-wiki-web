import { all, kdb } from "./kdb"
import { CLASS_ALIAS, KO_EN, RULE_ALIAS } from "./kg-vocab"
import { DOMAIN_META } from "./types"

// ontology 우선 질의 계획 (결정론, LLM 없음).
// 순서: domain 식별 → 클래스/개체 연결 → 관계 확장 → claim 수집 → evidence 확인 → (보강) canonical 문서 → 판정.
// 위키 문서는 보강 자료일 뿐이며, 온톨로지에 연결된 개체·관계·claim 없이 위키만 있으면 insufficient_evidence 이다.
// discovery 그래프는 DB에 적재되지 않으므로 이 경로에 들어올 수 없다.

export interface PlanEntity { id: string; label: string; cls: string; alias: string; attributes: Record<string, string | number | null> }
export interface PlanRelation { id: string; subject: string; subjectLabel: string; predicate: string; object: string; objectLabel: string; status: string; confidence: string; attrs: Record<string, unknown> }
export interface PlanClaim { id: string; subject: string; subjectText: string; predicate: string; value: string; unit: string | null; conditions: string | null; origin: string; status: string; confidence: string; contested: boolean; evidenceKind: string; documentPath: string | null; domain: string | null; rules: string[]; classLinked?: boolean }
export interface PlanEvidence { id: string; claimId: string; sourcePath: string; sourceUrl: string; locator: string; quote: string; verified: boolean; method: string; evidenceType: string; resolved: number | null }
export interface PlanPage { path: string; title: string; domain: string | null; confidence: string | null; excerpt: string; supplementary: true; ontologyClass?: string | null }
export interface Plan {
  question: string
  domainFilter: string[]
  domainSource: "explicit" | "keyword" | "none"
  classes: string[]
  entities: PlanEntity[]
  relations: PlanRelation[]
  claims: PlanClaim[]
  evidence: PlanEvidence[]
  pages: PlanPage[]
  limitations: string[]
  excluded: { unverified: number; blocked: number; unreviewedRelations: number }
  suggestions: string[]
  status: "ready" | "insufficient_evidence"
  basis: "ontology" | "ontology-linked" | "wiki-sourced" | "none" // ontology: 개체·관계·검증 claim / ontology-linked: 사람이 승인해 클래스에 연결한 위키 문서 / wiki-sourced: 온톨로지 미연결, 출처 확인된 위키 요약
  confidence: "high" | "medium" | "low"
  contested: boolean
}

// ── domain 식별: 질의 필터로만 쓴다(문서의 domain 값을 쓰거나 바꾸지 않는다) ──
const DOMAIN_KW: Record<string, RegExp> = {
  "flight-control": /px4|ardupilot|비행\s*제어|autopilot|ekf|\bpid\b/i,
  "comms-protocol": /mavlink|dronecan|텔레메트리|프로토콜/i,
  hardware: /배터리|모터|\besc\b|프롭|프로펠러|프레임|pixhawk|하드웨어/i,
  "gcs-software": /qgroundcontrol|mission planner|\bgcs\b|지상\s*관제/i,
  "ops-mission": /임무|bvlos|운용|배달|점검|재난/i,
  regulations: /법규|규정|\bfaa\b|\beasa\b|인증|허가/i,
  "ai-autonomy": /자율|llm|강화\s*학습|딥러닝/i,
  "sensing-perception": /라이다|lidar|radar|레이더|열화상|eo\/ir/i,
  "navigation-gnss-denied": /gnss-denied|gps-denied|\bvio\b|odometry|\buwb\b/i,
  "rf-datalink-engineering": /링크\s*버짓|안테나|manet|\b5g\b|위성\s*통신/i,
  "mechanical-structures": /진동|카본|공력|방열|구조\s*해석/i,
  "electrical-power": /\bbms\b|\bemc\b|전력\s*전자|전원/i,
  "swarm-multiagent": /군집|swarm|멀티\s*에이전트/i,
  "simulation-test": /\bsitl\b|\bhil\b|gazebo|시뮬레이션/i,
  "ros-middleware": /\bros2?\b|\bdds\b|zenoh/i,
  "edge-ai-compute": /jetson|젯슨|tensorrt|엣지\s*ai/i,
  security: /암호|보안|스푸핑|재밍/i,
}

export function detectDomains(question: string, explicit?: string[]): { domains: string[]; source: Plan["domainSource"] } {
  const known = new Set(Object.keys(DOMAIN_META))
  const ex = (explicit ?? []).filter((d) => known.has(d))
  if (ex.length) return { domains: ex, source: "explicit" }
  const found = new Set<string>()
  for (const [id, meta] of Object.entries(DOMAIN_META)) {
    if (new RegExp(`(^|[^a-z-])${id}($|[^a-z-])`, "i").test(question) || (meta.label.length >= 3 && question.includes(meta.label))) found.add(id)
  }
  for (const [id, re] of Object.entries(DOMAIN_KW)) if (re.test(question)) found.add(id)
  // 문서에 쓰이지 않는 상위 개념 때문에 과도하게 좁히지 않도록, 3개 이상 걸리면 필터를 걸지 않는다
  if (found.size === 0 || found.size > 2) return { domains: [], source: "none" }
  return { domains: [...found], source: "keyword" }
}

// ── 별칭 사전(개체 연결) ──
let _aliases: { alias: string; nodeId: string }[] | null = null
function aliasList() {
  if (_aliases) return _aliases
  _aliases = all<{ alias: string; node_id: string }>("SELECT alias, node_id FROM ontology_aliases WHERE length(alias) >= 4").map((r) => ({ alias: r.alias, nodeId: r.node_id })).sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias))
  return _aliases
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function linkEntities(question: string): { id: string; alias: string }[] {
  let q = " " + question.toLowerCase() + " "
  const out: { id: string; alias: string }[] = []
  const seenNodes = new Set<string>()
  const usedAlias = new Set<string>()
  for (const { alias, nodeId } of aliasList()) {
    if (usedAlias.has(alias)) { if (!seenNodes.has(nodeId) && out.filter((o) => o.alias === alias).length < 6) { out.push({ id: nodeId, alias }); seenNodes.add(nodeId) } continue }
    if (alias.length > 80) continue
    const re = new RegExp(`(?<![a-z0-9])${esc(alias)}(?![a-z0-9])`)
    if (!re.test(q)) continue
    usedAlias.add(alias)
    q = q.replace(new RegExp(`(?<![a-z0-9])${esc(alias)}(?![a-z0-9])`, "g"), " ".repeat(alias.length)) // 더 짧은 별칭이 같은 구간에 다시 걸리지 않게
    if (!seenNodes.has(nodeId)) { out.push({ id: nodeId, alias }); seenNodes.add(nodeId) }
    if (out.length >= 12) break
  }
  return out
}

const tokenize = (t: string) => t.toLowerCase().match(/[a-z][a-z0-9\-]{2,}|[가-힣]{2,}/g) ?? []
const STOP = new Set(["알려줘", "알려", "무엇", "어떻게", "대한", "관련", "에서", "얼마", "정보", "the", "and", "for", "with", "논문", "어떤", "무슨", "하는", "하기", "있는", "관한", "위한", "대해", "같은", "되는", "된다", "따라", "변해", "달라", "다른", "있나", "있어", "인가", "일까", "해줘", "보여줘", "근거", "얼마나", "어느", "정도", "무엇인가요", "무엇인지", "무엇이", "인가요", "알려주세요", "설명해줘", "설명해주세요", "차이점", "비교", "종류", "장단점", "개요", "정의", "원리", "뭐야", "뭔가요", "대해서"])

function ftsQuery(question: string): string {
  const toks = tokenize(question).filter((t) => !STOP.has(t))
  const terms = new Set<string>()
  for (const t of toks) {
    terms.add(t)
    for (const [ko, ens] of Object.entries(KO_EN)) if (t.startsWith(ko)) ens.forEach((e) => terms.add(e))
  }
  return [...terms].slice(0, 24).map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ")
}

// ── 관련성 게이트: 흔한 단어(드론·비행…)만 겹친 claim/문서를 근거로 삼지 않는다 ──
const GENERIC_Q = new Set(["드론", "비행", "uav", "uavs", "drone", "drones", "flight", "방법", "역사", "설명", "정리", "특징", "종류", "최신", "동향", "기술", "시스템", "system", "차이", "사용", "대해", "이란", "무엇인가", "연동", "연결", "통합", "적용", "활용", "이용", "구성", "설정", "구현", "선택", "조건", "영향", "현황", "동향", "관련해서", "필요", "필요해", "필요한가", "필요한가요", "있나", "있나요", "있는지", "얼마", "얼마야", "얼마예요", "어디", "어디야", "어디인가", "되나", "되나요", "해야", "하나요", "한가요", "회사", "회사야", "회사인가", "회사인가요", "회사예요", "기업이야", "기업인가", "기업인가요", "자세히", "자세하게", "상세히", "상세하게", "간단히", "간단하게", "간략히", "쉽게", "짧게", "구체적으로", "구체적", "정확히", "정확하게", "비교해서", "비교해", "알려줘", "알려줄래", "알려주세요", "설명해줘", "설명해", "설명해주세요", "차근차근", "한눈에", "요약해서", "요약해줘"])
const PARTICLE = /(을|를|은|는|이|가|의|에|에서|로|으로|과|와|도|만|인|란|이란|에서의|에는|으로는)$/
// 질문 끝의 서술 어미(…이야/…해/…인가요 등)를 떼어 낸다 — '모델이야'·'탐지해'가 위키에 없는 핵심어로 오판되어 거절되던 문제(2026-10-22). 어간이 2자 이상일 때만.
const ENDING = /(이에요|인가요|인가|이야|예요|해요|하나요|하나|할까요|할까|합니까|해)$/
// 요청·문체 표현(…해줘/…주세요/뭐예요/단계별로/자세히)은 주제어가 아니므로 '위키에 없는 핵심어' 판정에서 제외한다(2026-10-22: '자세히'·'단계별'·'정리해줘'·'뭐예요'로 정상 질문이 거절됨).
const REQUEST_WORD = /^[가-힣]+(해줘|해주세요|줘|주세요|세요|뭐야|뭐예요|뭐죠|뭔가요|별로|별|적으로|하게|히)$|^(뭐|뭘|어떻게|어떤|왜|언제)/
const stem = (t: string) => {
  if (!/[가-힣]/.test(t)) return t
  const s = t.replace(PARTICLE, "")
  const e = s.replace(ENDING, "")
  return e.length >= 2 ? e : s
}
const dfCache = new Map<string, number>()
function rareToken(t: string): boolean {
  if (/\d/.test(t) && /[a-z]/i.test(t)) return true // 모델명·고유 표기(MN5008, X650 …)
  if (!dfCache.has(t)) {
    try { dfCache.set(t, all<{ n: number }>("SELECT count(*) n FROM claim_fts WHERE claim_fts MATCH ?", `"${t.replace(/"/g, "")}"`)[0]?.n ?? 0) } catch { dfCache.set(t, 999) }
  }
  const df = dfCache.get(t) ?? 999
  return df >= 1 && df <= 25 // 코퍼스에 아예 없는 단어(df=0)는 희귀가 아니라 '해당 없음'
}
export function contentTokens(question: string, ignore?: Set<string>): { orig: string; variants: string[] }[] {
  return tokenize(question).filter((t) => !STOP.has(t) && !STOP.has(stem(t)) && !GENERIC_Q.has(t) && !GENERIC_Q.has(stem(t)) && !ignore?.has(stem(t))).map((orig) => {
    const st = stem(orig)
    const vs = new Set<string>([st])
    for (const [ko, ens] of Object.entries(KO_EN)) if (st.startsWith(ko)) ens.forEach((e) => vs.add(e))
    return { orig: st, variants: [...vs] }
  }).filter((x) => x.orig.length >= 2)
}
// 텍스트가 질문의 '내용어'를 충분히 덮는지: 내용어의 75% 이상이 맞고, 서로 다른 2개 이상이거나 희귀한 단일 내용어(모델명·고유명)가 맞아야 한다.
// 질문의 핵심 개념(예: '양자')이 어디에도 없는데 나머지 흔한 단어만 겹쳐서 근거처럼 보이는 것을 막는다.
function relevant(question: string, text: string, ignore?: Set<string>): boolean {
  const low = text.toLowerCase()
  const toks = contentTokens(question, ignore)
  if (!toks.length) return false
  let hits = 0, rare = false
  for (const t of toks) {
    const matched = t.variants.filter((v) => low.includes(v))
    if (matched.length) { hits++; if (matched.some((v) => rareToken(v))) rare = true }
  }
  if (toks.length === 1) return hits === 1 && rare
  return hits / toks.length >= 0.75 && (hits >= 2 || rare)
}

// 개념·비교·절차형 질문: 텍스트로만 걸린 논문 claim(예: PX4·ArduPilot이 같이 언급된 지연 시간 측정)을 '차이점'의 근거로 쓰면 오답이 된다
export const REGULATORY = /허가|승인|신고|증명|과태료|벌금|벌칙|규정|규제|법령|시행규칙|항공안전법|등록|면제|자격|금지구역|공역/
const CONCEPTUAL = /차이|비교|vs\.?|versus|무엇|뭐야|뭔가요|이란|설명|개요|정의|원리|기준|절차|방법|종류|장단점|특징|어떻게/i

// 공식 계층에서 클래스와 그 하위 클래스(예: FlightStack → PX4·ArduPilot)
function withDescendants(classes: string[]): Set<string> {
  const out = new Set<string>(classes)
  const rows = all<{ name: string; parent: string | null }>("SELECT name, parent FROM ontology_classes")
  let grew = true
  while (grew) { grew = false; for (const r of rows) if (r.parent && out.has(r.parent) && !out.has(r.name)) { out.add(r.name); grew = true } }
  return out
}

const PRED_RANK: Record<string, number> = { madeBy: 0, isA: 1, powersWith: 2, hasCategory: 3, mentions: 4, packFits: 9 }

export function planQuery(question: string, opts?: { domains?: string[] }): Plan {
  const plan: Plan = {
    question, domainFilter: [], domainSource: "none", classes: [], entities: [], relations: [], claims: [], evidence: [], pages: [], limitations: [],
    excluded: { unverified: 0, blocked: 0, unreviewedRelations: 0 }, suggestions: [], status: "insufficient_evidence", basis: "none", confidence: "low", contested: false,
  }
  if (!kdb()) { plan.limitations.push("지식 DB를 불러오지 못했습니다."); return plan }

  // 1. domain
  const dd = detectDomains(question, opts?.domains)
  plan.domainFilter = dd.domains; plan.domainSource = dd.source

  // domain 필터 정책: 사용자가 명시한 domain만 하드 필터. 질문에서 추정한 domain은 문서 domain 값이 일관되지 않아(예: ROS2 문서가 gcs-software) 필터로 쓰면 정답 문서가 탈락하므로 우선순위 가산으로만 쓴다.
  const hardDomain = plan.domainSource === "explicit" ? plan.domainFilter : []
  // 이미 domain 필터로 반영된 단어(예: '하드웨어')는 내용어 일치 계산에서 뺀다
  const domainWords = new Set(plan.domainFilter.flatMap((d) => (DOMAIN_META[d]?.label ?? "").split(/[^가-힣A-Za-z]+/).filter((w) => w.length >= 2)))

  // 2. 클래스·개체
  const classNames = Object.entries(CLASS_ALIAS).filter(([, re]) => re.test(question)).map(([c]) => c)
  const linked = linkEntities(question)
  for (const l of linked) {
    const n = all<{ id: string; label: string; class_name: string }>("SELECT id, label, class_name FROM ontology_nodes WHERE id = ?", l.id)[0]
    if (!n) continue
    const attrs: PlanEntity["attributes"] = {}
    const p = all("SELECT category, manufacturer_id, url, weight_g, capacity_mah, cells_s, nominal_v, continuous_a, peak_a, platform, numeric_json FROM products WHERE id = ?", n.id)[0]
    if (p) for (const [k, v] of Object.entries(p)) if (v !== null && v !== "") attrs[k] = v as string | number
    const m = all("SELECT country, country_verified, official_url FROM manufacturers WHERE id = ?", n.id)[0]
    if (m) for (const [k, v] of Object.entries(m)) if (v !== null) attrs[k] = v as string | number
    plan.entities.push({ id: n.id, label: n.label, cls: n.class_name, alias: l.alias, attributes: attrs })
  }
  plan.classes = [...new Set([...classNames, ...plan.entities.map((e) => e.cls)])]
  const entityIds = plan.entities.map((e) => e.id)

  // 3. 관계 확장(검증·파생 관계만, 사람 검토 전 'unreviewed'는 제외)
  const asked = new Set(classNames)
  if (entityIds.length) {
    const ph = entityIds.map(() => "?").join(",")
    const rows = all<{ id: string; subject_id: string; predicate: string; object_id: string; status: string; confidence: string; attrs: string | null; sl: string | null; ol: string | null; scls: string | null; ocls: string | null }>(
      `SELECT r.id, r.subject_id, r.predicate, r.object_id, r.status, r.confidence, r.attrs, ns.label sl, no.label ol, ns.class_name scls, no.class_name ocls
       FROM ontology_relations r LEFT JOIN ontology_nodes ns ON ns.id = r.subject_id LEFT JOIN ontology_nodes no ON no.id = r.object_id
       WHERE (r.subject_id IN (${ph}) OR r.object_id IN (${ph})) AND r.predicate IN ('madeBy','isA','hasCategory','powersWith','packFits') AND r.status IN ('verified','derived')`, ...entityIds, ...entityIds)
    const score = (r: (typeof rows)[number]) => {
      const other = entityIds.includes(r.subject_id) ? r.ocls : r.scls
      return (PRED_RANK[r.predicate] ?? 5) + (other && asked.has(other) ? -5 : 0)
    }
    const perPred: Record<string, number> = {}
    const cap: Record<string, number> = { powersWith: 12, packFits: 4 }
    for (const r of rows.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))) {
      perPred[r.predicate] = (perPred[r.predicate] ?? 0) + 1
      if (perPred[r.predicate] > (cap[r.predicate] ?? 6)) continue
      plan.relations.push({ id: r.id, subject: r.subject_id, subjectLabel: r.sl ?? r.subject_id, predicate: r.predicate, object: r.object_id, objectLabel: r.ol ?? r.object_id, status: r.status, confidence: r.confidence, attrs: r.attrs ? JSON.parse(r.attrs) : {} })
    }
    plan.excluded.unreviewedRelations = all<{ n: number }>(`SELECT count(*) n FROM ontology_relations WHERE (subject_id IN (${ph}) OR object_id IN (${ph})) AND status = 'unreviewed'`, ...entityIds, ...entityIds)[0]?.n ?? 0
  }

  // 4. claim 수집: ① 개체에 연결된 것 ② 규칙에 연결된 것 ③ claim 전문검색(비위키 우선, 위키는 보강)
  const claimIds: string[] = []
  const ftsOnly = new Set<string>() // 텍스트 검색으로만 들어온 후보(관련성 게이트 대상). 개체·규칙으로 연결된 claim은 온톨로지 연결이므로 게이트 면제
  const push = (ids: string[]) => { for (const i of ids) if (!claimIds.includes(i)) claimIds.push(i) }
  if (entityIds.length) {
    const ph = entityIds.map(() => "?").join(",")
    push(all<{ id: string }>(`SELECT id FROM claims WHERE subject_id IN (${ph}) ORDER BY id LIMIT 20`, ...entityIds).map((r) => r.id))
    push(all<{ s: string }>(`SELECT substr(subject_id, 7) s FROM ontology_relations WHERE predicate = 'mentions' AND object_id IN (${ph}) ORDER BY 1 LIMIT 20`, ...entityIds).map((r) => r.s))
  }
  // 법령·규제 질문에서는 공학 규칙(예: '고도'→대기밀도 규칙)을 끌어오지 않는다 — 단어만 겹친 공학 claim이 '근거 있음'으로 둔갑하는 것을 막는다
  const ruleIds = REGULATORY.test(question) ? [] : Object.entries(RULE_ALIAS).filter(([, re]) => re.test(question)).map(([r]) => r)
  if (ruleIds.length) {
    const ph = ruleIds.map(() => "?").join(",")
    push(all<{ claim_id: string }>(`SELECT cr.claim_id FROM claim_rules cr JOIN claims c ON c.id = cr.claim_id WHERE cr.rule_id IN (${ph}) ORDER BY (c.evidence_kind = 'reported') DESC, (c.status = 'verified') DESC, c.id LIMIT 14`, ...ruleIds).map((r) => r.claim_id))
  }
  const fq = ftsQuery(question)
  if (fq) {
    try {
      const a = all<{ claim_id: string }>(`SELECT f.claim_id FROM claim_fts f JOIN claims c ON c.id = f.claim_id WHERE claim_fts MATCH ? AND c.origin != 'wiki' ORDER BY bm25(claim_fts) LIMIT 30`, fq).map((r) => r.claim_id)
      const b = all<{ claim_id: string }>(`SELECT f.claim_id FROM claim_fts f JOIN claims c ON c.id = f.claim_id WHERE claim_fts MATCH ? AND c.origin = 'wiki' ORDER BY bm25(claim_fts) LIMIT 30`, fq).map((r) => r.claim_id)
      for (const i of [...a, ...b]) if (!claimIds.includes(i)) ftsOnly.add(i)
      push([...a, ...b])
    } catch { plan.limitations.push("claim 전문검색 질의를 해석하지 못했습니다.") }
  }
  if (claimIds.length) {
    const ph = claimIds.map(() => "?").join(",")
    const rows = all<{ id: string; subject_id: string | null; subject_text: string | null; predicate: string; object_value: string; unit: string | null; conditions: string | null; origin: string; status: string; confidence: string; contested: number; evidence_kind: string; domain: string | null; dpath: string | null }>(
      `SELECT c.id, c.subject_id, c.subject_text, c.predicate, c.object_value, c.unit, c.conditions, c.origin, c.status, c.confidence, c.contested, c.evidence_kind, c.domain, d.path dpath
       FROM claims c LEFT JOIN documents d ON d.id = c.document_id WHERE c.id IN (${ph})`, ...claimIds)
    const byId = new Map(rows.map((r) => [r.id, r]))
    const rulesOf = (id: string) => all<{ rule_id: string }>("SELECT rule_id FROM claim_rules WHERE claim_id = ? ORDER BY rule_id", id).map((r) => r.rule_id)
    for (const id of claimIds) {
      const r = byId.get(id)
      if (!r) continue
      if (r.status === "unverified") { plan.excluded.unverified++; continue }
      if (r.status === "blocked") { plan.excluded.blocked++; continue }
      if (CONCEPTUAL.test(question) && ftsOnly.has(r.id) && r.origin !== "wiki") continue // 개념·비교형 질문에 단어만 겹친 논문 측정값을 근거로 쓰지 않는다
      if (ftsOnly.has(r.id) && !relevant(question, `${r.subject_text ?? ""} ${r.predicate} ${r.object_value} ${r.conditions ?? ""}`, domainWords)) continue
      // domain 필터는 문서에 속한 위키 claim에만 적용한다(온톨로지·논문 claim은 domain이 없다 = 필터 대상이 아님)
      if (hardDomain.length && r.origin === "wiki" && !(r.domain && hardDomain.includes(r.domain))) continue
      plan.claims.push({ id: r.id, subject: r.subject_id ?? "", subjectText: r.subject_text ?? "", predicate: r.predicate, value: r.object_value, unit: r.unit, conditions: r.conditions, origin: r.origin, status: r.status, confidence: r.confidence, contested: !!r.contested, evidenceKind: r.evidence_kind, documentPath: r.dpath, domain: r.domain, rules: rulesOf(r.id) })
    }
    // 비위키(온톨로지·논문) claim이 앞, 위키 요약은 뒤
    plan.claims.sort((a, b) => Number(a.origin === "wiki") - Number(b.origin === "wiki"))
    // 텍스트 검색으로 들어온 것은 비위키 8개·위키 6개까지만(온톨로지 연결 claim은 그대로 유지)
    let nonWikiFts = 0, wikiFts = 0
    plan.claims = plan.claims.filter((c) => !ftsOnly.has(c.id) || (c.origin === "wiki" ? ++wikiFts <= 6 : ++nonWikiFts <= 8)).slice(0, 24)
  }

  // 5. evidence
  if (plan.claims.length) {
    const ph = plan.claims.map(() => "?").join(",")
    plan.evidence = all<{ id: string; claim_id: string; locator: string | null; quote: string; verified: number; method: string | null; etype: string; spath: string | null; surl: string | null; resolved: number | null; ref: string | null }>(
      `SELECT e.id, e.claim_id, e.locator, e.quote, e.verified, e.verification_method method, e.evidence_type etype, s.raw_path spath, s.source_url surl, s.resolved, s.ref
       FROM evidence e JOIN sources s ON s.id = e.source_id WHERE e.claim_id IN (${ph}) ORDER BY e.claim_id, e.id`, ...plan.claims.map((c) => c.id))
      .map((e) => ({ id: e.id, claimId: e.claim_id, sourcePath: e.spath ?? e.ref ?? "", sourceUrl: e.surl ?? "", locator: e.locator ?? "", quote: e.quote.slice(0, 500), verified: !!e.verified, method: e.method ?? "", evidenceType: e.etype, resolved: e.resolved }))
  }

  // 6. canonical 문서 — ① 질문의 핵심어가 제목·경로에 있는 문서 ② 선택된 위키 claim의 문서 ③ domain 필터를 적용한 전문검색. 모두 보강용이며 단독 근거로 쓰는 경우는 7단계 기준을 따른다.
  const pagePaths: string[] = []
  const addPage = (path: string) => { if (!pagePaths.includes(path) && pagePaths.length < 14) pagePaths.push(path) }
  // ① 핵심어가 슬러그·제목에 있는 문서를 단어별로 직접 고른다(비교 질문은 두 대상의 문서를 각각 가져와야 하므로 한 문서에 둘이 함께 있을 필요가 없다).
  //    제목에 너무 많은 문서가 걸리는 일반어(drone·protocol 등)는 건너뛰고, 슬러그 일치를 제목 일치보다 먼저, 신뢰도 high를 먼저 둔다.
  const titleTokens = [...new Set(contentTokens(question, domainWords).flatMap((t) => t.variants).filter((v) => /^[a-z0-9][a-z0-9\-]{2,}$/.test(v)))].slice(0, 8)
  for (const tk of titleTokens) {
    // domain 필터가 있으면 제목 일치 문서에도 그대로 적용한다(위키 문서에 한정되는 필터)
    const domSql = hardDomain.length ? ` AND domain IN (${hardDomain.map(() => "?").join(",")})` : ""
    const soft = plan.domainSource === "keyword" && plan.domainFilter.length ? `(domain IN (${plan.domainFilter.map(() => "?").join(",")})) DESC, ` : ""
    const hits = all<{ path: string; bypath: number }>(`SELECT path, (lower(path) LIKE ?) bypath FROM documents WHERE (lower(title) LIKE ? OR lower(path) LIKE ?)${domSql} ORDER BY bypath DESC, ${soft}(confidence = 'high') DESC, length(path) LIMIT 40`, `%${tk}%`, `%${tk}%`, `%${tk}%`, ...hardDomain, ...(soft ? plan.domainFilter : []))
    if (hits.length > 0 && hits.length < 40) for (const h of hits.slice(0, 3)) addPage(h.path)
  }
  // 질문에 나온 클래스에 사람이 승인해 연결한 문서(documents.ontology_class)를 우선 포함한다(온톨로지 연결 문서)
  const classSet = plan.classes.length ? withDescendants(plan.classes) : new Set<string>()
  if (classSet.size) {
    const ph = [...classSet].map(() => "?").join(",")
    const dom = hardDomain.length ? ` AND domain IN (${hardDomain.map(() => "?").join(",")})` : ""
    for (const r of all<{ path: string }>(`SELECT path FROM documents WHERE ontology_class IN (${ph})${dom} ORDER BY (confidence = 'high') DESC, path LIMIT 8`, ...classSet, ...hardDomain)) addPage(r.path)
  }
  for (const c of plan.claims) if (c.documentPath) addPage(c.documentPath)
  if (fq) {
    try {
      const dom = hardDomain.length ? ` AND domain IN (${hardDomain.map(() => "?").join(",")})` : ""
      const rows = all<{ document_id: string }>(`SELECT document_id FROM document_fts WHERE document_fts MATCH ?${dom} ORDER BY bm25(document_fts) LIMIT 14`, fq, ...hardDomain)
      for (const r of rows) {
        const path = r.document_id.replace(/^doc:/, "")
        const d0 = all<{ title: string; body: string }>("SELECT title, body FROM documents WHERE path = ?", path)[0]
        if (d0 && relevant(question, `${d0.title} ${d0.body.slice(0, 3000)}`, domainWords)) addPage(path)
      }
    } catch { /* FTS 질의 오류는 보강 자료만 빠지는 것이라 무시 */ }
  }
  // 법령·규제 질문은 regulations 문서 안에서 전문검색을 한 번 더 한다(한국어 질문 ↔ 영문 슬러그·제목이라 일반 검색 상위에 못 오르는 법령 문서를 후보에 넣는다)
  if (fq && REGULATORY.test(question) && !hardDomain.length) {
    try {
      for (const r of all<{ document_id: string }>("SELECT document_id FROM document_fts WHERE document_fts MATCH ? AND domain = 'regulations' ORDER BY bm25(document_fts) LIMIT 4", fq)) addPage(r.document_id.replace(/^doc:/, ""))
    } catch { /* 보강 검색 실패는 무시 */ }
  }
  // 문서 순위: 질문 핵심어(한·영 변형)가 제목·경로에 몇 개 나오는지로 매기고, 핵심어가 하나도 없는 문서는 일치 문서가 2개 이상이면 버린다(본문에 우연히 언급만 된 문서가 답변을 흐리는 것을 막음)
  const anchors = contentTokens(question, domainWords)
  // 법령·규제 질문이면 domain이 regulations인 문서를 순위에서만 앞세운다(필터가 아님 — domain 값은 바꾸지도 걸러내지도 않는다)
  const regDocs = REGULATORY.test(question) ? new Set(all<{ path: string }>("SELECT path FROM documents WHERE domain = 'regulations'").map((r) => r.path)) : new Set<string>()
  const claimDocs = new Set(plan.claims.map((c) => c.documentPath).filter((x): x is string => !!x))
  const anchorScore = (path: string) => {
    const r = all<{ title: string; path: string }>("SELECT title, path FROM documents WHERE path = ?", path)[0]
    const hay = `${r?.title ?? ""} ${r?.path ?? ""}`.toLowerCase()
    const base = anchors.filter((t) => t.variants.some((v) => hay.includes(v))).length
    // 인접한 두 질문어를 영어 변형으로 이은 구절(flight controller·flight stack 등)이 제목·경로에 있으면 크게 가산한다 — 일반어 하나(controller)만 겹친 제어이론 문서와 구분
    const toks = tokenize(question).map((w) => stem(w))
    const vs = (w: string) => [w, ...Object.entries(KO_EN).filter(([ko]) => w.startsWith(ko)).flatMap(([, ens]) => ens)]
    let bonus = 0
    for (let i = 0; i + 1 < toks.length; i++) for (const a of vs(toks[i])) for (const b of vs(toks[i + 1])) if (/^[a-z0-9]/.test(a) && /^[a-z0-9]/.test(b) && new RegExp(`${esc(a)}[ \\-_]${esc(b)}`).test(hay)) bonus = 3
    // 질문과 맞는 위키 claim이 속한 문서는 영어 슬러그에 질문어가 없어도(한국어 질문 ↔ 영문 슬러그) 우선한다
    return base + bonus + (claimDocs.has(path) ? 1 : 0) + (regDocs.has(path) ? 2 : 0)
  }
  const scored = pagePaths.map((path, i) => ({ path, s: anchorScore(path), i }))
  const top = Math.max(0, ...scored.map((x) => x.s))
  // 구절 일치(점수 3 이상)가 있으면 그 문서와 점수가 절반 이상인 문서만 남긴다 — 일반어 하나만 겹친 문서가 답변을 흐리지 않게
  const minKeep = top >= 3 ? Math.ceil(top / 2) : 1
  const keep = scored.filter((x) => x.s >= minKeep).length >= 1 && top >= 3 ? scored.filter((x) => x.s >= minKeep) : scored.filter((x) => x.s > 0).length >= 2 ? scored.filter((x) => x.s > 0) : scored
  pagePaths.length = 0
  for (const x of keep.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 5)) pagePaths.push(x.path)
  for (const path of pagePaths) {
    const d = all<{ title: string; domain: string | null; confidence: string | null; body: string; ontology_class: string | null }>("SELECT title, domain, confidence, body, ontology_class FROM documents WHERE path = ?", path)[0]
    if (d) plan.pages.push({ path, title: d.title, domain: d.domain, confidence: d.confidence, excerpt: d.body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 1200), supplementary: true, ontologyClass: d.ontology_class })
  }

  // 7. 판정 — 온톨로지에 연결된 근거가 있어야 답변 가능(위키 단독 근거 금지)
  const groundedClaims = plan.claims.filter((c) => c.origin !== "wiki" && (c.status === "verified" || c.status === "sourced" || c.status === "contested"))
  const hasEntityFacts = plan.entities.length > 0 && (plan.relations.length > 0 || plan.entities.some((e) => Object.keys(e.attributes).length > 0))
  const wikiClaims = plan.claims.filter((c) => c.origin === "wiki")
  plan.contested = plan.claims.some((c) => c.contested)
  const wikiSourced = wikiClaims.filter((c) => c.status === "sourced" || c.status === "contested")
  // 질문의 희귀한 핵심 개념(위키 문서 15개 이하에만 나오는 말)이 선택된 근거 어디에도 없으면, 위키가 그 주제를 다루지 않는 것이므로 거절한다(wiki-sourced·ontology-linked 공통)
  const refuseMissingCore = (): boolean => {
    const hay2 = (plan.pages.map((p) => `${p.title} ${p.path} ${p.excerpt}`).join(" ") + " " + wikiClaims.map((c) => `${c.value}`).join(" ")).toLowerCase()
    // 질문이 가리키는 온톨로지 클래스 이름 자체(예: FlightStack)는 문서에 그 낱말이 없어도 온톨로지가 다루는 개념이므로 빠진 주제로 보지 않는다
    const classWords = new Set(plan.classes.map((c) => c.toLowerCase()))
    // 한국어 합성어('수소연료전지')는 근거에 구성어('연료전지')가 있으면 다룬 것으로 본다(앞·뒤가 같은 3자 이상 낱말, 일반어 제외).
    const hayWords = new Set(hay2.split(/[^0-9a-z가-힣]+/).filter((w) => w.length >= 4 && !GENERIC_Q.has(w)))
    // 구성어가 4자 이상이고 합성어의 절반 이상일 때만('컴퓨터'처럼 흔한 짧은 말이 '양자컴퓨터'를 덮어 주면 안 된다)
    const compoundCovered = (v: string) => v.length >= 5 && /[가-힣]/.test(v) && [...hayWords].some((w) => w !== v && w.length * 2 >= v.length && (v.endsWith(w) || v.startsWith(w)))
    const missingCore = contentTokens(question, domainWords).filter((t) => {
      if (/[가-힣]/.test(t.orig) && (REQUEST_WORD.test(t.orig) || t.variants.some((v) => REQUEST_WORD.test(v)))) return false
      if (t.variants.some((v) => hay2.includes(v) || classWords.has(v) || compoundCovered(v))) return false
      const q = t.variants.map((v) => `"${v.replace(/"/g, "")}"`).join(" OR ")
      let df = 0
      try { df = all<{ n: number }>("SELECT count(*) n FROM document_fts WHERE document_fts MATCH ?", q)[0]?.n ?? 0 } catch { df = 99 }
      return df <= 15
    }).map((t) => t.orig)
    // '역사·연혁·동향' 같은 요청 유형어는 일반어라 위 희귀어 검사에서 빠진다 — 질문이 그 내용을 요구하는데 선택된 근거에 한 번도 없으면 주제는 맞아도 요구한 내용이 없는 것이므로 거절한다
    for (const w of ["역사", "연혁", "history", "동향", "현황"]) if (question.toLowerCase().includes(w) && !hay2.includes(w)) missingCore.push(w)
    if (!missingCore.length) return false
    plan.limitations.push(`위키가 '${missingCore.join("', '")}' 주제를 직접 다루는 문서를 갖고 있지 않아 답변하지 않습니다.`)
    const cls0 = plan.classes[0]
    if (cls0) plan.suggestions = all<{ example_question: string }>("SELECT q.example_question FROM query_candidates q JOIN ontology_nodes n ON n.id = q.node_id WHERE n.class_name = ? ORDER BY q.id LIMIT 3", cls0).map((r) => r.example_question)
    return true
  }
  // 질문이 가리키는 클래스(또는 그 하위 클래스)에 사람이 승인해 연결한 문서가 선택됐는가
  const linkedPages = plan.pages.filter((p) => p.ontologyClass && classSet.has(p.ontologyClass))
  if (!(groundedClaims.length || hasEntityFacts) && linkedPages.length) {
    if (refuseMissingCore()) return plan
    plan.status = "ready"; plan.basis = "ontology-linked"
    plan.confidence = plan.contested ? "low" : linkedPages.some((p) => p.confidence === "high") && wikiSourced.length >= 1 ? "medium" : "low"
    plan.limitations.unshift(`질문의 클래스(${[...new Set(linkedPages.map((p) => p.ontologyClass))].join(", ")})에 사람이 승인해 연결한 위키 문서와 그 출처 확인 요약에 근거한 답변입니다. 수치·인용은 원문 대조가 아니라 위키 요약이므로 신뢰도를 높게 두지 않았습니다.`)
  } else if (groundedClaims.length || hasEntityFacts) {
    plan.status = "ready"; plan.basis = "ontology"
    const hi = groundedClaims.some((c) => c.confidence === "high") || plan.relations.some((r) => r.predicate === "powersWith" && r.confidence === "high")
    const mid = groundedClaims.length > 0 || plan.entities.length > 0
    plan.confidence = plan.contested ? "low" : hi ? "high" : mid ? "medium" : "low"
  } else if (wikiSourced.length >= 1 || (plan.pages.length >= 1 && plan.pages.some((p) => p.confidence === "high" || p.confidence === "medium"))) {
    // 2단계: 온톨로지 개체·관계·검증 claim은 없지만 출처 파일이 확인된 위키 요약이 있다 → 답변하되 '위키 요약 기반'으로 명시하고 신뢰도는 medium을 넘지 않는다
    if (refuseMissingCore()) return plan
    plan.status = "ready"; plan.basis = "wiki-sourced"
    const strongPage = plan.pages.some((p) => p.confidence === "high")
    plan.confidence = plan.contested ? "low" : strongPage && wikiSourced.length >= 2 ? "medium" : "low"
    plan.limitations.unshift("온톨로지의 개체·관계·검증 claim과 연결되지 않은 질문입니다. 아래 답변은 출처 파일이 확인된 위키 요약에 근거하며(원문 인용과 문자 단위로 대조되지는 않음) 신뢰도를 높게 두지 않았습니다.")
  } else {
    plan.limitations.push("질문과 연결된 온톨로지 개체·관계·claim, 출처가 확인된 위키 문서가 없습니다.")
    const cls = plan.classes[0]
    if (cls) plan.suggestions = all<{ example_question: string }>("SELECT q.example_question FROM query_candidates q JOIN ontology_nodes n ON n.id = q.node_id WHERE n.class_name = ? ORDER BY q.id LIMIT 3", cls).map((r) => r.example_question)
  }
  // 질문의 내용어 중 선택된 근거(문서 발췌·claim·개체)에서 한 번도 나오지 않은 말은 숨기지 않고 한계로 알린다(예: '한국' 관련 내용이 없음)
  if (plan.status === "ready") {
    const hay = (plan.pages.map((p) => `${p.title} ${p.path} ${p.excerpt}`).join(" ") + " " + plan.claims.map((c) => `${c.subjectText} ${c.value} ${c.conditions ?? ""}`).join(" ") + " " + plan.entities.map((e) => e.label).join(" ")).toLowerCase()
    const unc = contentTokens(question, domainWords).filter((t) => !t.variants.some((v) => hay.includes(v))).map((t) => t.orig)
    if (unc.length) plan.limitations.push(`질문의 '${unc.slice(0, 4).join("', '")}'에 해당하는 내용은 선택된 근거에서 찾지 못했습니다. 그 부분은 답하지 않습니다.`)
  }
  if (plan.excluded.unverified || plan.excluded.blocked) plan.limitations.push(`근거가 확인되지 않은 claim ${plan.excluded.unverified + plan.excluded.blocked}건은 답변에서 제외했습니다.`)
  if (plan.excluded.unreviewedRelations) plan.limitations.push(`사람 검토 전 관계 ${plan.excluded.unreviewedRelations}건은 사용하지 않았습니다.`)
  if (plan.relations.some((r) => r.predicate === "packFits")) plan.limitations.push("packFits는 셀 수만 비교한 느슨한 호환이라 확정 호환이 아닙니다.")
  if (plan.claims.some((c) => ["model-assumption", "simulation", "cited-secondary"].includes(c.evidenceKind))) plan.limitations.push("일부 claim은 모델 가정값·시뮬레이션·2차 인용이라 실측이 아닙니다.")
  if (plan.claims.some((c) => c.origin === "wiki")) plan.limitations.push("위키 요약 기반 claim은 출처 파일은 확인되지만 원문 인용과 문자 단위로 대조되지 않았습니다.")
  if (plan.domainFilter.length) plan.limitations.push(plan.domainSource === "explicit" ? `domain 필터(지정): ${plan.domainFilter.join(", ")} — 위키 문서에만 적용, 논문·제품 claim은 domain이 없어 포함됩니다.` : `질문에서 식별한 domain(${plan.domainFilter.join(", ")})은 검색 우선순위에만 반영했습니다(문서의 domain 값이 일관되지 않아 필터로 쓰지 않음).`)
  return plan
}
