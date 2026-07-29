import fs from "fs"
import path from "path"
import matter from "gray-matter"

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}

const WIKI_ROOT = resolveWikiRoot()
const LAYER_DIRS = ["concepts", "entities", "comparisons", "queries"]

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
  title: string
  domain: string
  tags: string[]
  content: string
}

function loadAllDocs(): RawDoc[] {
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
          title: String(data.title),
          domain: String(data.domain || ""),
          tags: Array.isArray(data.tags) ? data.tags : [],
          content,
        })
      } catch { /* skip */ }
    }
  }
  return docs
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\n\r.,;:!?()[\]{}"'`/\\-]+/)
      .filter((w) => w.length > 1)
  )
}

function tfidfScore(queryTokens: Set<string>, doc: RawDoc): number {
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

export function ragSearch(query: string, topK = 5): RagSource[] {
  const docs = loadAllDocs()
  const qTokens = tokenize(query)
  return docs
    .map((doc) => ({ doc, score: tfidfScore(qTokens, doc) }))
    .filter((x) => x.score > 0)
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

interface GraphNode { id: string; name: string }
interface GraphEdge { source: string; target: string }

function loadGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const candidates = [
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
