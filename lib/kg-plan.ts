import { all, kdb } from "./kdb"
import { CLASS_ALIAS, KO_EN, RULE_ALIAS } from "./kg-vocab"
import { DOMAIN_META } from "./types"

// ontology 우선 질의 계획 (결정론, LLM 없음).
// 순서: domain 식별 → 클래스/개체 연결 → 관계 확장 → claim 수집 → evidence 확인 → (보강) canonical 문서 → 판정.
// 위키 문서는 보강 자료일 뿐이며, 온톨로지에 연결된 개체·관계·claim 없이 위키만 있으면 insufficient_evidence 이다.
// discovery 그래프는 DB에 적재되지 않으므로 이 경로에 들어올 수 없다.

export interface PlanEntity { id: string; label: string; cls: string; alias: string; attributes: Record<string, string | number | null> }
export interface PlanRelation { id: string; subject: string; subjectLabel: string; predicate: string; object: string; objectLabel: string; status: string; confidence: string; attrs: Record<string, unknown> }
export interface PlanClaim { id: string; subject: string; subjectText: string; predicate: string; value: string; unit: string | null; conditions: string | null; origin: string; status: string; confidence: string; contested: boolean; evidenceKind: string; documentPath: string | null; domain: string | null; rules: string[] }
export interface PlanEvidence { id: string; claimId: string; sourcePath: string; sourceUrl: string; locator: string; quote: string; verified: boolean; method: string; evidenceType: string; resolved: number | null }
export interface PlanPage { path: string; title: string; domain: string | null; confidence: string | null; excerpt: string; supplementary: true }
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
const STOP = new Set(["알려줘", "알려", "무엇", "어떻게", "대한", "관련", "에서", "얼마", "정보", "the", "and", "for", "with", "논문", "어떤", "무슨", "하는", "하기", "있는", "관한", "위한", "대해", "같은", "되는", "된다", "따라", "변해", "달라", "다른", "있나", "있어", "인가", "일까", "해줘", "보여줘", "근거", "얼마나", "어느", "정도"])

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
const GENERIC_Q = new Set(["드론", "비행", "uav", "uavs", "drone", "drones", "flight", "방법", "역사", "설명", "정리", "특징", "종류", "최신", "동향", "기술", "시스템", "system", "차이", "사용", "대해", "이란", "무엇인가"])
const PARTICLE = /(을|를|은|는|이|가|의|에|에서|로|으로|과|와|도|만|인|란|이란|에서의|에는|으로는)$/
const stem = (t: string) => (/[가-힣]/.test(t) ? t.replace(PARTICLE, "") : t)
const dfCache = new Map<string, number>()
function rareToken(t: string): boolean {
  if (/\d/.test(t) && /[a-z]/i.test(t)) return true // 모델명·고유 표기(MN5008, X650 …)
  if (!dfCache.has(t)) {
    try { dfCache.set(t, all<{ n: number }>("SELECT count(*) n FROM claim_fts WHERE claim_fts MATCH ?", `"${t.replace(/"/g, "")}"`)[0]?.n ?? 0) } catch { dfCache.set(t, 999) }
  }
  const df = dfCache.get(t) ?? 999
  return df >= 1 && df <= 25 // 코퍼스에 아예 없는 단어(df=0)는 희귀가 아니라 '해당 없음'
}
function contentTokens(question: string, ignore?: Set<string>): { orig: string; variants: string[] }[] {
  return tokenize(question).filter((t) => !STOP.has(t) && !GENERIC_Q.has(t) && !GENERIC_Q.has(stem(t)) && !ignore?.has(stem(t))).map((orig) => {
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

const PRED_RANK: Record<string, number> = { madeBy: 0, isA: 1, powersWith: 2, hasCategory: 3, mentions: 4, packFits: 9 }

export function planQuery(question: string, opts?: { domains?: string[] }): Plan {
  const plan: Plan = {
    question, domainFilter: [], domainSource: "none", classes: [], entities: [], relations: [], claims: [], evidence: [], pages: [], limitations: [],
    excluded: { unverified: 0, blocked: 0, unreviewedRelations: 0 }, suggestions: [], status: "insufficient_evidence", confidence: "low", contested: false,
  }
  if (!kdb()) { plan.limitations.push("지식 DB를 불러오지 못했습니다."); return plan }

  // 1. domain
  const dd = detectDomains(question, opts?.domains)
  plan.domainFilter = dd.domains; plan.domainSource = dd.source

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
  const ruleIds = Object.entries(RULE_ALIAS).filter(([, re]) => re.test(question)).map(([r]) => r)
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
      if (ftsOnly.has(r.id) && !relevant(question, `${r.subject_text ?? ""} ${r.predicate} ${r.object_value} ${r.conditions ?? ""}`, domainWords)) continue
      // domain 필터는 문서에 속한 위키 claim에만 적용한다(온톨로지·논문 claim은 domain이 없다 = 필터 대상이 아님)
      if (plan.domainFilter.length && r.origin === "wiki" && !(r.domain && plan.domainFilter.includes(r.domain))) continue
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

  // 6. canonical 문서 — 선택된 위키 claim의 문서 + domain 필터를 적용한 전문검색(보강용)
  const pagePaths = new Set(plan.claims.filter((c) => c.documentPath).map((c) => c.documentPath as string))
  if (fq) {
    try {
      const dom = plan.domainFilter.length ? ` AND domain IN (${plan.domainFilter.map(() => "?").join(",")})` : ""
      const rows = all<{ document_id: string }>(`SELECT document_id FROM document_fts WHERE document_fts MATCH ?${dom} ORDER BY bm25(document_fts) LIMIT 14`, fq, ...plan.domainFilter)
      for (const r of rows) {
        const path = r.document_id.replace(/^doc:/, "")
        const d0 = all<{ title: string; body: string }>("SELECT title, body FROM documents WHERE path = ?", path)[0]
        if (d0 && pagePaths.size < 6 && relevant(question, `${d0.title} ${d0.body.slice(0, 3000)}`, domainWords)) pagePaths.add(path)
      }
    } catch { /* FTS 질의 오류는 보강 자료만 빠지는 것이라 무시 */ }
  }
  for (const path of [...pagePaths].slice(0, 6)) {
    const d = all<{ title: string; domain: string | null; confidence: string | null; body: string }>("SELECT title, domain, confidence, body FROM documents WHERE path = ?", path)[0]
    if (d) plan.pages.push({ path, title: d.title, domain: d.domain, confidence: d.confidence, excerpt: d.body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 600), supplementary: true })
  }

  // 7. 판정 — 온톨로지에 연결된 근거가 있어야 답변 가능(위키 단독 근거 금지)
  const groundedClaims = plan.claims.filter((c) => c.origin !== "wiki" && (c.status === "verified" || c.status === "sourced" || c.status === "contested"))
  const hasEntityFacts = plan.entities.length > 0 && (plan.relations.length > 0 || plan.entities.some((e) => Object.keys(e.attributes).length > 0))
  const wikiClaims = plan.claims.filter((c) => c.origin === "wiki")
  plan.contested = plan.claims.some((c) => c.contested)
  if (groundedClaims.length || hasEntityFacts) {
    plan.status = "ready"
    const hi = groundedClaims.some((c) => c.confidence === "high") || plan.relations.some((r) => r.predicate === "powersWith" && r.confidence === "high")
    const mid = groundedClaims.length > 0 || plan.entities.length > 0
    plan.confidence = plan.contested ? "low" : hi ? "high" : mid ? "medium" : "low"
  } else {
    plan.limitations.push(wikiClaims.length || plan.pages.length
      ? "위키 문서에만 근거가 있고 온톨로지의 개체·관계·검증 claim과 연결되지 않아 확정 답변을 만들지 않습니다."
      : "질문과 연결된 온톨로지 개체·관계·claim이 없습니다.")
    const cls = plan.classes[0]
    if (cls) plan.suggestions = all<{ example_question: string }>("SELECT q.example_question FROM query_candidates q JOIN ontology_nodes n ON n.id = q.node_id WHERE n.class_name = ? ORDER BY q.id LIMIT 3", cls).map((r) => r.example_question)
  }
  if (plan.excluded.unverified || plan.excluded.blocked) plan.limitations.push(`근거가 확인되지 않은 claim ${plan.excluded.unverified + plan.excluded.blocked}건은 답변에서 제외했습니다.`)
  if (plan.excluded.unreviewedRelations) plan.limitations.push(`사람 검토 전 관계 ${plan.excluded.unreviewedRelations}건은 사용하지 않았습니다.`)
  if (plan.relations.some((r) => r.predicate === "packFits")) plan.limitations.push("packFits는 셀 수만 비교한 느슨한 호환이라 확정 호환이 아닙니다.")
  if (plan.claims.some((c) => ["model-assumption", "simulation", "cited-secondary"].includes(c.evidenceKind))) plan.limitations.push("일부 claim은 모델 가정값·시뮬레이션·2차 인용이라 실측이 아닙니다.")
  if (plan.claims.some((c) => c.origin === "wiki")) plan.limitations.push("위키 요약 기반 claim은 출처 파일은 확인되지만 원문 인용과 문자 단위로 대조되지 않았습니다.")
  if (plan.domainFilter.length) plan.limitations.push(`domain 필터(${plan.domainSource === "explicit" ? "지정" : "질문에서 식별"}): ${plan.domainFilter.join(", ")} — 위키 문서에만 적용, 논문·제품 claim은 domain이 없어 포함됩니다.`)
  return plan
}
