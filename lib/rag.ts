import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import matter from "gray-matter"
import { expandQueryClassTerms, describeOntologyClass } from "./ontology"

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}

const WIKI_ROOT = resolveWikiRoot()
const LAYER_DIRS = ["concepts", "entities", "comparisons", "queries"]
// raw/ 원문(Layer 1, 미검증 증거) 중 RAG 검색 대상에 포함할 하위 디렉터리(2026-09-04).
// career-quiz/는 드론과 무관한 커리어 퀴즈 콘텐츠라 제외, papers/files/는 PDF 첨부
// 바이너리(로컬 전용·git 미추적)라 애초에 .md가 없어 별도 제외 불필요 — 그래도
// 재귀 스캔 비용을 아끼려 아래 RAW_EXCLUDE_DIRS로 명시 제외한다.
const RAW_DIRS = ["raw/papers", "raw/articles", "raw/youtube", "raw/videos", "raw/releases"]
const RAW_EXCLUDE_DIRS = new Set(["files"]) // raw/papers/files/ — PDF 첨부, .md 없음

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
  properties?: Record<string, string>
  // canonical: daily-ingest가 검증·컴파일한 위키 문서(신뢰 계층).
  // raw: 원문 그대로(Layer 1, 사람 검토 전) — 답변에 쓸 때 출처 표시가 더 필요하다.
  origin: "canonical" | "raw"
}

interface RawDoc {
  slug: string
  path: string
  title: string
  domain: string
  tags: string[]
  content: string
  properties: Record<string, string>
  origin: "canonical" | "raw"
}

// raw/ frontmatter는 canonical과 스키마가 다르다(SCHEMA.md "raw/ Frontmatter") —
// title/domain이 없는 파일이 흔하다(예: raw/articles 41개 중 20개가 title 누락,
// raw/papers 124개 중 103개가 domain 누락, 대신 papers/<domain-subdir>/ 로 표현됨).
// canonical의 "title 없으면 스킵" 규칙을 그대로 적용하면 raw 절반이 사라지므로
// 폴백을 둔다.
function deriveTitle(data: Record<string, unknown>, content: string, filename: string): string {
  if (data.title) return String(data.title)
  const heading = content.match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ")
}

function deriveDomain(data: Record<string, unknown>, relPath: string): string {
  if (data.domain) return String(data.domain)
  // raw/papers/<domain>/file.md — 서브디렉터리 이름 자체가 domain 택소노미 값인
  // 경우가 많다. 단 _unclassified/는 "아직 분류 안 됨" 버킷이라 진짜 도메인이
  // 아니므로 빈 값으로 취급한다(UI에 가짜 도메인 배지가 뜨는 것 방지).
  const m = relPath.match(/^raw\/papers\/([^/]+)\//)
  return m && m[1] !== "_unclassified" ? m[1] : ""
}

// 2026-08-20 팔란티어 온톨로지 Link 보강(apply-kinetic-rules.py)으로 entities/
// frontmatter에 추가된 구조화 속성. RAG의 excerpt는 본문(content)만 슬라이스해
// frontmatter를 통째로 버리므로, 이 필드들이 있으면 AI Q&A/드론빌더 답변에
// 실제로 반영되지 않는 문제가 있었다(실측: "Pixhawk 6X 무게" 질문에 AI가
// "지식베이스에 없음"으로 답변) — 화이트리스트로 필요한 것만 골라 컨텍스트에
// 태워 보낸다(임의 필드 노출 방지, 새 속성 추가 시 여기에만 추가하면 됨).
const ONTOLOGY_PROPERTY_KEYS = [
  "ontology_class", "ontology_subclass", "ontology_status",
  "manufacturer", "weightKg", "weightG", "maxPayloadKg", "batteryWh",
  "dimensionsMm", "mcu", "representative_model", "sensorType", "resolutionMp",
  "imuArray", "deploymentLocation", "parameterCount", "aiModelClass",
]

// raw 문서 전용 인용 정보 — canonical의 ontology 속성과는 성격이 달라(구조화
// 스펙이 아니라 출처 추적용) 별도 화이트리스트로 둔다. 논문은 source(arXiv 등
// URL)·authors가 있어 실제 인용 가능한 근거가 된다.
const RAW_CITATION_KEYS = ["source", "source_url", "authors", "published", "channel"]

function extractRawCitation(data: Record<string, unknown>): Record<string, string> {
  const props: Record<string, string> = {}
  for (const key of RAW_CITATION_KEYS) {
    const v = data[key]
    if (v !== undefined && v !== null && v !== "") props[key] = String(v)
  }
  return props
}

function extractOntologyProperties(data: Record<string, unknown>, wikiRoot: string): Record<string, string> {
  const props: Record<string, string> = {}
  for (const key of ONTOLOGY_PROPERTY_KEYS) {
    const v = data[key]
    if (v !== undefined && v !== null && v !== "") props[key] = String(v)
  }
  // 서브섬션 추론: ontology_class가 있으면 class-hierarchy.json으로 조상
  // 체인을 계산해 함께 태운다 — "이 문서=ComputeUnit"이라는 사실뿐 아니라
  // "ComputeUnit은 PhysicalEntity의 하위개념"이라는 추론 결과까지 답변 근거로.
  if (props.ontology_class) {
    const chain = describeOntologyClass(props.ontology_class, wikiRoot)
    if (chain) props.ontology_subsumption = chain
  }
  return props
}

// 모듈 레벨 캐시 — 서버리스 콜드스타트당 1회만 디스크를 읽는다(Phase 2).
// 워커가 재사용되는 동안(웜 인스턴스) 매 요청마다 전체 canonical을 다시
// 읽던 문제를 없앤다. 재검증(revalidate) 요구가 없는 정적 스냅샷이므로
// 안전하다 — 배포마다 새 워커가 뜨면 자동으로 새로 로드된다.
let _docsCache: RawDoc[] | null = null

// raw/papers는 도메인별 하위 디렉터리로 중첩돼 있어(concepts/entities 등 canonical
// 4계층과 달리 flat이 아님) 재귀 스캔이 필요하다.
function walkMarkdownFiles(dirPath: string, relBase: string): { relPath: string; filename: string }[] {
  const out: { relPath: string; filename: string }[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (RAW_EXCLUDE_DIRS.has(entry.name)) continue
      out.push(...walkMarkdownFiles(path.join(dirPath, entry.name), `${relBase}/${entry.name}`))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push({ relPath: `${relBase}/${entry.name}`, filename: entry.name })
    }
  }
  return out
}

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
          properties: extractOntologyProperties(data, WIKI_ROOT),
          origin: "canonical",
        })
      } catch { /* skip */ }
    }
  }

  for (const dir of RAW_DIRS) {
    const dirPath = path.join(WIKI_ROOT, dir)
    if (!fs.existsSync(dirPath)) continue
    for (const { relPath, filename } of walkMarkdownFiles(dirPath, dir)) {
      try {
        const raw = fs.readFileSync(path.join(WIKI_ROOT, relPath), "utf-8")
        const { data, content } = matter(raw)
        // slug 충돌 방지 — raw는 canonical과 파일명 네임스페이스가 분리돼 있지 않다.
        const slug = `raw-${relPath.replace(/^raw\//, "").replace(/\.md$/, "").replace(/\//g, "-")}`
        docs.push({
          slug,
          path: relPath,
          title: deriveTitle(data, content, filename),
          domain: deriveDomain(data, relPath),
          tags: Array.isArray(data.tags) ? data.tags : [],
          content,
          properties: extractRawCitation(data),
          origin: "raw",
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

// 질의마다 답변이 비슷해지는 원인 중 하나 — 콘텐츠가 몰린 "허브" 문서(예:
// Pixhawk/PX4류)가 키워드 겹침이 커서 서로 다른 질문에도 반복적으로 top-K를
// 독점하는 현상. 순위는 그대로 신뢰하되, 같은 domain이 결과 절반을 넘게
// 차지하지 않도록 그리디하게 골라 담아 매 응답의 근거 자료 자체를 다양화한다.
// (diversify: false면 기존 동작 그대로 — 상위 호출부에서 옵트인.)
function selectDiverse<T extends { doc: RawDoc; score: number }>(ranked: T[], topK: number): T[] {
  const maxPerDomain = Math.max(2, Math.ceil(topK / 3))
  const domainCount: Record<string, number> = {}
  const selected: T[] = []
  const skipped: T[] = []
  for (const item of ranked) {
    const d = item.doc.domain || "unknown"
    if ((domainCount[d] ?? 0) >= maxPerDomain) {
      skipped.push(item)
      continue
    }
    domainCount[d] = (domainCount[d] ?? 0) + 1
    selected.push(item)
    if (selected.length >= topK) return selected
  }
  // 도메인 상한 때문에 topK를 못 채웠으면 밀려난 것들로 부족분을 채운다
  // (원래 순위 그대로 — 다양성 우선이 결과 개수를 줄이지는 않는다).
  for (const item of skipped) {
    if (selected.length >= topK) break
    selected.push(item)
  }
  return selected
}

export function ragSearch(query: string, topK = 5, opts?: { diversify?: boolean }): RagSource[] {
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

  const ranked = docs
    .map((doc) => {
      const kw = keywordScore(qTokens, doc)
      const { score, cosine: cos } = hybridScore(kw, qTokens, queryVec, doc, embeddings)
      return { doc, score, cosine: cos, kw }
    })
    // 키워드 0건이어도 의미 유사도가 충분하면 포함 — 교차언어 검색 목적
    // (예: "군집 비행" 질의로 영문 전용 문서를 찾아내는 것이 Phase 2 목표).
    .filter((x) => x.kw > 0 || x.cosine >= MIN_COSINE_INCLUDE)
    .sort((a, b) => b.score - a.score)

  const picked = opts?.diversify ? selectDiverse(ranked, topK) : ranked.slice(0, topK)

  return picked.map(({ doc, score }) => ({
    slug: doc.slug,
    title: doc.title,
    domain: doc.domain,
    excerpt: doc.content.slice(0, 600).replace(/^#[^\n]+\n/, "").trim(),
    score,
    tags: doc.tags,
    properties: Object.keys(doc.properties).length ? doc.properties : undefined,
    origin: doc.origin,
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

interface GraphNode { id: string; name: string; domain?: string }
interface GraphEdge { source: string; target: string; type?: string }

export function loadGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
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
