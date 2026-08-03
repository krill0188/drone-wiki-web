import fs from "fs"
import path from "path"
import { loadGraph } from "./rag"

// canonical 그래프(concepts/entities 위키 문서 기반, update-graph.sh가 생성)와
// discovery 그래프(raw/ 원문에서 LangChain LLMGraphTransformer가 자동 추출,
// ~/2nd/scripts/extract-knowledge-graph.py가 생성 — 사람이 아직 검토하지 않은
// 미검증 레이어)를 함께 탐색해 서로 다른 주제(비행제어·통신·하드웨어·GCS·운용·
// 법규·AI 등, 특정 두 영역으로 한정하지 않음) 사이의 연결 경로를 찾아내는
// GraphRAG 레이어. 벡터/키워드 검색(ragSearch)이 준 시드 슬러그에서
// 출발해 멀티홉으로 그래프를 확장한다 — 단일 문서 검색으로는 못 찾는, 여러
// 문서를 가로지르는 개념 간 관계를 LLM 컨텍스트로 제공하는 것이 목적이다.

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}
const WIKI_ROOT = resolveWikiRoot()

type Origin = "canonical" | "discovery"

interface DiscoveryNode {
  id: string
  name: string
  domain?: string
  ontologyClass?: string | null
  status?: string
  sources?: string[]
}

interface DiscoveryEdge {
  source: string
  target: string
  type: string
  confidence?: string
}

interface CombinedNode {
  id: string
  name: string
  origin: Origin
  // 도메인/주제 신호 — canonical은 domain(flight-control 등), discovery는
  // domain이 늘 비어있으므로 ontologyClass(Technology/Protocol/Regulation 등)로
  // 대체한다. "드론 vs AI" 같은 특정 축이 아니라 실제 주제가 갈리는 모든 개념
  // 쌍을 연결고리 후보로 잡기 위한 범용 신호다.
  topic: string
}

interface CombinedEdge {
  source: string
  target: string
  type: string
  origin: Origin
}

export interface GraphRagResult {
  block: string
  usedDiscovery: boolean
}

// discovery 그래프는 사람 검토 전 별도 레이어(README의 Evidence → Canonical
// Memory → Discovery → Human Decision 4계층 원칙) — 없어도(파일 미존재) 조용히
// 빈 그래프로 폴백한다. canonical RAG 동작에는 영향을 주지 않는다.
function loadDiscoveryGraph(): { nodes: DiscoveryNode[]; edges: DiscoveryEdge[] } {
  const p = path.join(WIKI_ROOT, ".ua", "discovery-knowledge-graph.json")
  if (!fs.existsSync(p)) return { nodes: [], edges: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"))
    return { nodes: raw.nodes ?? [], edges: raw.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

// discovery 노드(LLM이 자유 형식으로 지은 이름, 예: "Ardupilot")를 canonical
// 노드(위키 슬러그의 사람이 쓴 제목, 예: "ArduPilot")에 매칭한다. 두 그래프의
// ID 네임스페이스가 완전히 다르므로(파일 슬러그 vs LLM 생성 이름), 이 매칭
// 없이는 두 그래프가 절대 서로 연결되지 않는다 — 여기가 "다리"를 놓는 지점이다.
function resolveDiscoveryToCanonical(
  discoveryNodes: DiscoveryNode[],
  canonicalNodes: { id: string; name: string }[]
): Map<string, string> {
  const canonicalIndex = canonicalNodes.map((n) => ({ id: n.id, norm: normalizeName(n.name || n.id) }))
  const map = new Map<string, string>()
  for (const dn of discoveryNodes) {
    const dnorm = normalizeName(dn.name)
    if (dnorm.length < 3) continue
    let best: { id: string; norm: string } | null = null
    for (const cn of canonicalIndex) {
      if (!cn.norm) continue
      const matches = cn.norm === dnorm || (dnorm.length >= 4 && (cn.norm.includes(dnorm) || dnorm.includes(cn.norm)))
      if (matches && (!best || cn.norm.length < best.norm.length)) best = cn
    }
    if (best) map.set(dn.id, best.id)
  }
  return map
}

function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\n\r.,;:!?()[\]{}"'`/\\-]+/)
    .filter((w) => w.length > 1)
}

// 쿼리 토큰과 discovery 노드 이름이 겹치면 시드로 채택 — 위키에 아직 문서가
// 없는 AI/기술 용어(예: "SLAM", "EKF")를 질문에 직접 언급했을 때도 그래프
// 탐색의 출발점이 되게 하기 위함이다(ragSearch만으로는 위키 문서가 없으면
// 이런 개념을 시드로 잡을 수 없다).
function findDiscoverySeeds(query: string, nodes: DiscoveryNode[], limit = 6): string[] {
  const qTokens = new Set(tokenizeQuery(query))
  const scored = nodes
    .map((n) => {
      const nameTokens = tokenizeQuery(n.name)
      let hits = 0
      for (const t of nameTokens) if (qTokens.has(t)) hits++
      return { id: n.id, hits }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
  return scored.map((x) => x.id)
}

function bfsSubgraph(
  seedIds: string[],
  adjacency: Map<string, { edge: CombinedEdge; neighbor: string }[]>,
  nodeById: Map<string, CombinedNode>,
  maxHops = 2,
  maxNodes = 25
): { nodeIds: string[]; edges: CombinedEdge[] } {
  const visited = new Set<string>(seedIds.filter((id) => nodeById.has(id)))
  const collectedEdges: CombinedEdge[] = []
  const edgeKeys = new Set<string>()
  let cursor = [...visited]
  let hop = 0
  while (hop < maxHops && cursor.length > 0 && visited.size < maxNodes) {
    const next: string[] = []
    for (const id of cursor) {
      for (const { edge, neighbor } of adjacency.get(id) ?? []) {
        const key = `${edge.source}|${edge.target}|${edge.type}`
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key)
          collectedEdges.push(edge)
        }
        if (!visited.has(neighbor) && visited.size < maxNodes) {
          visited.add(neighbor)
          next.push(neighbor)
        }
      }
    }
    cursor = next
    hop++
  }
  return { nodeIds: [...visited], edges: collectedEdges }
}

function formatConnections(
  edges: CombinedEdge[],
  nodeById: Map<string, CombinedNode>
): { lines: string[]; hasUnverified: boolean } {
  // 서로 다른 주제/도메인을 잇는 엣지("다리")를 우선 노출한다 — 드론↔AI 한 쌍이
  // 아니라 flight-control↔regulations, comms-protocol↔ai-autonomy 등 실제로
  // 갈리는 모든 주제 조합이 대상이다. 둘 다 topic을 모르면(둘 다 discovery에서
  // ontologyClass도 없는 경우 등) origin 차이로라도 폴백해 다리를 잡는다.
  const bridges = edges.filter((e) => {
    const s = nodeById.get(e.source)
    const t = nodeById.get(e.target)
    if (!s || !t) return false
    if (s.topic && t.topic) return s.topic !== t.topic
    return s.origin !== t.origin
  })
  const rest = edges.filter((e) => !bridges.includes(e))
  const ordered = [...bridges, ...rest].slice(0, 20)

  const lines: string[] = []
  let hasUnverified = false
  for (const e of ordered) {
    const s = nodeById.get(e.source)
    const t = nodeById.get(e.target)
    if (!s || !t) continue
    const sTag = s.origin === "discovery" ? " [AI 추출·미검증]" : ""
    const tTag = t.origin === "discovery" ? " [AI 추출·미검증]" : ""
    if (s.origin === "discovery" || t.origin === "discovery") hasUnverified = true
    lines.push(`- ${s.name}${sTag} --[${e.type}]--> ${t.name}${tTag}`)
  }
  return { lines, hasUnverified }
}

/**
 * 벡터/키워드 검색(ragSearch)이 찾은 canonical 시드 슬러그 + 쿼리와 직접
 * 매칭되는 discovery 개념을 출발점으로, canonical/discovery 그래프를 함께
 * 2홉 탐색해 개념 간 연결 경로를 시스템 프롬프트용 텍스트 블록으로 만든다.
 */
export function graphRagSearch(query: string, canonicalSeedSlugs: string[]): GraphRagResult {
  const canonical = loadGraph()
  const discovery = loadDiscoveryGraph()
  if (canonical.nodes.length === 0 && discovery.nodes.length === 0) {
    return { block: "", usedDiscovery: false }
  }

  const resolution = resolveDiscoveryToCanonical(discovery.nodes, canonical.nodes)

  const nodeById = new Map<string, CombinedNode>()
  for (const n of canonical.nodes) {
    nodeById.set(n.id, { id: n.id, name: n.name, origin: "canonical", topic: n.domain || "" })
  }
  // resolution으로 canonical에 매칭된 discovery 노드는 canonical id로 흡수(같은
  // 개체로 취급) — 못 찾은 것만 "disc:" 네임스페이스로 별도 노드가 된다.
  const discoveryIdOf = (id: string) => resolution.get(id) ?? `disc:${id}`
  for (const n of discovery.nodes) {
    const mapped = discoveryIdOf(n.id)
    if (!nodeById.has(mapped)) {
      nodeById.set(mapped, { id: mapped, name: n.name, origin: "discovery", topic: n.domain || n.ontologyClass || "" })
    }
  }

  const edges: CombinedEdge[] = [
    ...canonical.edges.map((e) => ({ source: e.source, target: e.target, type: e.type || "wikilink", origin: "canonical" as const })),
    ...discovery.edges.map((e) => ({
      source: discoveryIdOf(e.source),
      target: discoveryIdOf(e.target),
      type: e.type,
      origin: "discovery" as const,
    })),
  ]

  const adjacency = new Map<string, { edge: CombinedEdge; neighbor: string }[]>()
  for (const e of edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue
    if (!adjacency.has(e.source)) adjacency.set(e.source, [])
    adjacency.get(e.source)!.push({ edge: e, neighbor: e.target })
    if (!adjacency.has(e.target)) adjacency.set(e.target, [])
    adjacency.get(e.target)!.push({ edge: e, neighbor: e.source })
  }

  const discoverySeeds = findDiscoverySeeds(query, discovery.nodes, 6).map(discoveryIdOf)
  const seeds = [...new Set([...canonicalSeedSlugs, ...discoverySeeds])].filter((id) => nodeById.has(id))
  if (seeds.length === 0) return { block: "", usedDiscovery: false }

  const subgraph = bfsSubgraph(seeds, adjacency, nodeById, 2, 25)
  const { lines, hasUnverified } = formatConnections(subgraph.edges, nodeById)
  if (lines.length === 0) return { block: "", usedDiscovery: false }

  const block = `<graph-connections>
그래프 탐색으로 발견된 개념 간 연결고리 — 특정 두 영역에 국한되지 않고, 문서 하나만
봐서는 안 보이는 모든 주제(비행제어·통신·하드웨어·GCS·운용·법규·AI 등)를 가로지르는 관계:
${lines.join("\n")}
${hasUnverified ? "\n※ [AI 추출·미검증] 표시 항목은 raw 원문에서 LLM이 자동 추출했고 아직 사람이 검토하지 않았다 — 참고 정황으로만 쓰고 확정된 사실처럼 단정하지 말 것." : ""}
</graph-connections>`

  return { block, usedDiscovery: hasUnverified }
}
