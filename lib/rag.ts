import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import matter from "gray-matter"
import { expandQueryClassTerms } from "./ontology"

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}

const WIKI_ROOT = resolveWikiRoot()
const LAYER_DIRS = ["concepts", "entities", "comparisons", "queries"]

// Phase 2 하이브리드 검색 상수. venv/embeddings.json은 둘 다 .gitignore
// 대상이라 Vercel 배포본에는 존재하지 않는다 — 즉 로컬 dev(~/2nd/.venv 실존)
// 에서는 자동으로 하이브리드가 켜지고, Vercel에서는 자동으로 기존 키워드
// 전용 방식으로 폴백한다. 별도 환경 분기 코드 없이 파일 존재 여부만으로
// 안전하게 갈린다 — scripts/research-search.py와 동일한 원리.
const VENV_PYTHON = path.join(WIKI_ROOT, ".venv", "bin", "python")
const EMBEDDINGS_PATH = path.join(WIKI_ROOT, ".ua", "embeddings.json")
const EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
const HYBRID_VECTOR_WEIGHT = 0.6
const HYBRID_KEYWORD_WEIGHT = 0.4
const MIN_COSINE_INCLUDE = 0.35

export interface RagSource {
  slug: string
  title: string
  domain: string
  excerpt: string
  score: number
  tags: string[]
}

interface RawDoc {
  slug: string
  path: string
  title: string
  domain: string
  tags: string[]
  content: string
}

// 모듈 레벨 캐시 — 서버리스 콜드스타트당 1회만 디스크를 읽는다(Phase 2).
// 워커가 재사용되는 동안(웜 인스턴스) 매 요청마다 전체 canonical을 다시
// 읽던 문제를 없앤다. 재검증(revalidate) 요구가 없는 정적 스냅샷이므로
// 안전하다 — 배포마다 새 워커가 뜨면 자동으로 새로 로드된다.
let _docsCache: RawDoc[] | null = null

function loadAllDocs(): RawDoc[] {
  if (_docsCache) return _docsCache
  const docs: RawDoc[] = []
  for (const dir of LAYER_DIRS) {
    const dirPath = path.join(WIKI_ROOT, dir)
    if (!fs.existsSync(dirPath)) continue
    for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"))) {
      try {
        const raw = fs.readFileSync(path.join(dirPath, file), "utf-8")
        const { data, content } = matter(raw)
        if (!data.title) continue
        docs.push({
          slug: file.replace(/\.md$/, ""),
          path: `${dir}/${file}`,
          title: String(data.title),
          domain: String(data.domain || ""),
          tags: Array.isArray(data.tags) ? data.tags : [],
          content,
        })
      } catch { /* skip */ }
    }
  }
  _docsCache = docs
  return docs
}

// path -> vector. embeddings.json 없으면 빈 맵(=키워드 전용 폴백).
let _embeddingsCache: Map<string, number[]> | null = null

function loadEmbeddings(): Map<string, number[]> {
  if (_embeddingsCache) return _embeddingsCache
  const map = new Map<string, number[]>()
  try {
    if (fs.existsSync(EMBEDDINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, "utf-8"))
      for (const d of data.docs ?? []) map.set(d.path, d.vector)
    }
  } catch { /* 손상된 파일이어도 키워드 폴백으로 안전하게 넘어간다 */ }
  _embeddingsCache = map
  return map
}

function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// 로컬 dev 전용 — venv가 배포본에 없으므로 Vercel에서는 항상 null을 반환해
// 자동으로 키워드 전용 방식으로 폴백한다(research-search.py와 동일 원리).
function embedQuery(query: string): number[] | null {
  if (!fs.existsSync(VENV_PYTHON)) return null
  const script =
    "import sys, json\n" +
    "from fastembed import TextEmbedding\n" +
    "q = json.load(sys.stdin)\n" +
    `m = TextEmbedding(${JSON.stringify(EMBED_MODEL)})\n` +
    "v = list(m.embed([q]))[0]\n" +
    "print(json.dumps([float(x) for x in v]))\n"
  try {
    const result = spawnSync(VENV_PYTHON, ["-c", script], {
      input: JSON.stringify(query), encoding: "utf-8", timeout: 30000,
    })
    if (result.status !== 0 || !result.stdout?.trim()) return null
    const lines = result.stdout.trim().split("\n")
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return null
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\n\r.,;:!?()[\]{}"'`/\\-]+/)
      .filter((w) => w.length > 1)
  )
}

function keywordScore(queryTokens: Set<string>, doc: RawDoc): number {
  const bodyTokens = tokenize(`${doc.title} ${doc.tags.join(" ")} ${doc.content}`)
  const titleTokens = tokenize(doc.title)
  let hits = 0
  let titleHits = 0
  for (const q of queryTokens) {
    if (bodyTokens.has(q)) hits++
    if (titleTokens.has(q)) titleHits++
  }
  return hits + titleHits * 2
}

// 하이브리드 점수: 임베딩 있으면 0.6*코사인 + 0.4*정규화 키워드,
// 없으면(Vercel 등) 기존 정수 키워드 점수 그대로 — 무회귀 폴백.
function hybridScore(
  kw: number, queryTokens: Set<string>, queryVec: number[] | null,
  doc: RawDoc, embeddings: Map<string, number[]>
): { score: number; cosine: number } {
  const docVec = embeddings.get(doc.path)
  if (!queryVec || !docVec) return { score: kw, cosine: 0 }
  const cos = cosine(queryVec, docVec)
  const kwNorm = kw / Math.max(queryTokens.size, 1)
  return { score: HYBRID_VECTOR_WEIGHT * cos + HYBRID_KEYWORD_WEIGHT * kwNorm, cosine: cos }
}

export function ragSearch(query: string, topK = 5): RagSource[] {
  const docs = loadAllDocs()
  const qTokens = tokenize(query)
  // G3(2026-08-02): 질의가 온톨로지 상위 클래스(예: FlightStack)를 가리키면
  // 하위 클래스명(PX4/ArduPilot)을 검색 토큰에 추가 — GraphRAG(1-hop 이웃
  // 확장)를 넘어 클래스 계층까지 아는 검색으로 확장(ONTOLOGY_GUIDED_GRAPHRAG_PLAN.md G3).
  for (const cls of expandQueryClassTerms(query, WIKI_ROOT)) {
    for (const t of tokenize(cls)) qTokens.add(t)
  }
  const embeddings = loadEmbeddings()
  const queryVec = embeddings.size > 0 ? embedQuery(query) : null

  return docs
    .map((doc) => {
      const kw = keywordScore(qTokens, doc)
      const { score, cosine: cos } = hybridScore(kw, qTokens, queryVec, doc, embeddings)
      return { doc, score, cosine: cos, kw }
    })
    // 키워드 0건이어도 의미 유사도가 충분하면 포함 — 교차언어 검색 목적
    // (예: "군집 비행" 질의로 영문 전용 문서를 찾아내는 것이 Phase 2 목표).
    .filter((x) => x.kw > 0 || x.cosine >= MIN_COSINE_INCLUDE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ doc, score }) => ({
      slug: doc.slug,
      title: doc.title,
      domain: doc.domain,
      excerpt: doc.content.slice(0, 600).replace(/^#[^\n]+\n/, "").trim(),
      score,
      tags: doc.tags,
    }))
}

export interface NewsHit {
  title: string
  url: string
  type: string
  region?: string
  excerpt: string
  score: number
}

// 수집된 최신 뉴스에서 질문 관련 항목 검색 (AI Q&A 근거용)
export function searchNews(query: string, topK = 4): NewsHit[] {
  const feedPath = path.join(WIKI_ROOT, ".ua", "news-feed.json")
  if (!fs.existsSync(feedPath)) return []
  let items: any[] = []
  try {
    items = JSON.parse(fs.readFileSync(feedPath, "utf-8"))
  } catch {
    return []
  }
  const qTokens = tokenize(query)
  return items
    .slice(0, 200)
    .map((it) => {
      const text = `${it.title || ""} ${it.summary || ""}`
      const tokens = tokenize(text)
      let hits = 0
      for (const q of qTokens) if (tokens.has(q)) hits++
      return { it, score: hits }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ it, score }) => ({
      title: String(it.title),
      url: String(it.url),
      type: String(it.type || "news"),
      region: it.region,
      excerpt: String(it.summary || "").slice(0, 200),
      score,
    }))
}

interface GraphNode { id: string; name: string }
interface GraphEdge { source: string; target: string }

function loadGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // G0(2026-08-02): 전용 파일명으로 분리 — 2nd Brain 저장소에 설치된
  // understand-anything 플러그인이 knowledge-graph.json을 코드베이스
  // 구조 그래프 용도로 같은 경로에 쓰고 있어(우연한 파일명 충돌) 우리
  // 드론 지식그래프만 별도 파일로 뗐다. 구 경로는 폴백으로만 유지.
  const candidates = [
    path.join(WIKI_ROOT, ".ua", "drone-knowledge-graph.json"),
    path.join(WIKI_ROOT, ".ua", "knowledge-graph.json"),
    path.join(WIKI_ROOT, "knowledge-graph.json"),
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"))
      return { nodes: raw.nodes ?? [], edges: raw.edges ?? raw.links ?? [] }
    } catch { /* next */ }
  }
  return { nodes: [], edges: [] }
}

// 시드 + 1-hop 이웃으로 유도된 서브그래프 (카드뉴스 GraphRAG 시각화용)
export function getSubgraph(seedSlugs: string[], neighborLimit = 8): {
  nodes: { id: string; name: string; domain?: string; seed: boolean }[]
  edges: GraphEdge[]
} {
  const { nodes, edges } = loadGraph()
  const seedSet = new Set(seedSlugs)
  const neighborIds = new Set<string>()

  for (const e of edges) {
    const src = String(e.source)
    const tgt = String(e.target)
    if (seedSet.has(src) && !seedSet.has(tgt)) neighborIds.add(tgt)
    if (seedSet.has(tgt) && !seedSet.has(src)) neighborIds.add(src)
  }

  const keep = new Set([...seedSet, ...[...neighborIds].slice(0, neighborLimit)])
  const subNodes = nodes
    .filter((n) => keep.has(String(n.id)))
    .map((n: any) => ({ id: String(n.id), name: n.name || n.id, domain: n.domain, seed: seedSet.has(String(n.id)) }))
  const subEdges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)))
  return { nodes: subNodes, edges: subEdges }
}

export function expandGraphNeighbors(seedSlugs: string[], limit = 4): GraphNode[] {
  const { nodes, edges } = loadGraph()
  const seedSet = new Set(seedSlugs)
  const expanded = new Set<string>()

  for (const e of edges) {
    const src = String(e.source)
    const tgt = String(e.target)
    if (seedSet.has(src)) expanded.add(tgt)
    if (seedSet.has(tgt)) expanded.add(src)
  }

  return nodes
    .filter((n) => expanded.has(n.id) && !seedSet.has(n.id))
    .slice(0, limit)
}
