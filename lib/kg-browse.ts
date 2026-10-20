import graphJson from "../data/ontology/graph.json"

// 지식그래프 탐색기용 조회(서버 컴포넌트에서 사용). 사실의 출처는 graph.json 하나뿐이다.
export interface BNode { id: string; type: string; label: string; [k: string]: unknown }
export interface BEdge { s: string; p: string; o: string; [k: string]: unknown }
const G = graphJson as unknown as { nodes: BNode[]; edges: BEdge[]; stats?: unknown }

const byId = new Map(G.nodes.map((n) => [n.id, n]))
const out = new Map<string, BEdge[]>()
const inc = new Map<string, BEdge[]>()
for (const e of G.edges) {
  ;(out.get(e.s) ?? out.set(e.s, []).get(e.s)!).push(e)
  ;(inc.get(e.o) ?? inc.set(e.o, []).get(e.o)!).push(e)
}

export const TYPE_ORDER = ["Manufacturer", "Product", "Rule", "Claim", "Paper", "Class", "Source"] as const
export const TYPE_LABEL: Record<string, string> = { Manufacturer: "제조사", Product: "제품", Rule: "공학 규칙", Claim: "원문 대조 claim", Paper: "논문", Class: "분류", Source: "기타 출처" }
export const REL_LABEL: Record<string, string> = {
  madeBy: "제조사", isA: "분류", powersWith: "함께 구동(ESC≥모터 전류)", packFits: "배터리 셀 수 호환(느슨)", supports: "근거(claim→규칙)", reportedIn: "보고된 논문",
  mentions: "언급한 제품", about: "관련 분류", governs: "지배하는 분류", hasCategory: "분야",
}
export const KIND_LABEL: Record<string, string> = { reported: "논문 보고값", "model-assumption": "모델 가정값", simulation: "시뮬레이션", "cited-secondary": "2차 인용", derived: "파생 계산" }

export function stats() {
  const c = (t: string) => G.nodes.filter((n) => n.type === t).length
  return { manufacturers: c("Manufacturer"), products: c("Product"), rules: c("Rule"), claims: c("Claim"), papers: c("Paper"), edges: G.edges.length }
}

export function getNode(id: string): BNode | undefined {
  return byId.get(id)
}

const hay = (n: BNode) => `${n.label} ${n.id} ${n.attribute ?? ""} ${n.conditions ?? ""} ${n.cls ?? ""} ${n.title ?? ""} ${n.country ?? ""}`.toLowerCase()

// 모든 검색어가 포함된 노드(AND). 유형별로 최대 limit개.
export function search(query: string, limit = 12): { type: string; total: number; nodes: BNode[] }[] {
  const toks = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!toks.length) return []
  const hits = G.nodes.filter((n) => toks.every((t) => hay(n).includes(t)))
  return TYPE_ORDER.map((type) => {
    const all = hits.filter((n) => n.type === type)
    return { type, total: all.length, nodes: all.slice(0, limit) }
  }).filter((g) => g.total > 0)
}

export interface Neighbor { rel: string; dir: "out" | "in"; node: BNode; attrs: Record<string, unknown> }

export function neighbors(id: string): Neighbor[] {
  const res: Neighbor[] = []
  const attrsOf = (e: BEdge) => Object.fromEntries(Object.entries(e).filter(([k]) => !["s", "p", "o"].includes(k)))
  for (const e of out.get(id) ?? []) { const n = byId.get(e.o); if (n) res.push({ rel: e.p, dir: "out", node: n, attrs: attrsOf(e) }) }
  for (const e of inc.get(id) ?? []) { const n = byId.get(e.s); if (n) res.push({ rel: e.p, dir: "in", node: n, attrs: attrsOf(e) }) }
  return res
}

// 관계 종류별로 묶는다(같은 방향·관계는 한 그룹).
export function groupedNeighbors(id: string) {
  const groups = new Map<string, Neighbor[]>()
  for (const nb of neighbors(id)) {
    const key = `${nb.rel}|${nb.dir}`
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(nb)
  }
  return [...groups.entries()].map(([key, list]) => ({ rel: key.split("|")[0], dir: key.split("|")[1] as "out" | "in", list }))
    .sort((a, b) => relRank(a.rel) - relRank(b.rel) || b.list.length - a.list.length)
}

// 의미가 강한 관계를 먼저, 느슨한 호환(packFits)과 분류 목록은 뒤로
const REL_PRIORITY = ["madeBy", "isA", "hasCategory", "powersWith", "supports", "reportedIn", "mentions", "governs", "about", "packFits"]
const relRank = (r: string) => { const i = REL_PRIORITY.indexOf(r); return i < 0 ? 50 : i }

export const NODE_HIDE_KEYS = new Set(["id", "type", "label"])
