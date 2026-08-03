import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { remark } from "remark"
import remarkGfm from "remark-gfm"
import remarkHtml from "remark-html"
import type { WikiPage, Domain, KnowledgeGraph } from "./types"

// Vercel 환경(HOME 없거나 ~/2nd 없음)엔 번들된 data/wiki 사용
function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}
const WIKI_ROOT = resolveWikiRoot()
const LAYER_DIRS = ["concepts", "entities", "comparisons", "queries"]

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toISOString().slice(0, 10)
}

function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g) || []
  return matches.map((m) => m.replace(/\[\[([^\]|]+?)(?:\|.+?)?\]\]/, "$1").trim())
}

export async function getAllPages(): Promise<WikiPage[]> {
  const pages: WikiPage[] = []

  for (const dir of LAYER_DIRS) {
    const dirPath = path.join(WIKI_ROOT, dir)
    if (!fs.existsSync(dirPath)) continue

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"))
    for (const file of files) {
      const slug = file.replace(/\.md$/, "")
      const page = await getPageBySlug(slug, dir)
      if (page) pages.push(page)
    }
  }

  return pages.sort((a, b) => a.title.localeCompare(b.title))
}

export async function getPageBySlug(slug: string, layerDir?: string): Promise<WikiPage | null> {
  let filePath: string | null = null
  let layer: WikiPage["layer"] = "Concepts"

  if (layerDir) {
    const candidate = path.join(WIKI_ROOT, layerDir, `${slug}.md`)
    if (fs.existsSync(candidate)) {
      filePath = candidate
      layer = (layerDir.charAt(0).toUpperCase() + layerDir.slice(1)) as WikiPage["layer"]
    }
  } else {
    for (const dir of LAYER_DIRS) {
      const candidate = path.join(WIKI_ROOT, dir, `${slug}.md`)
      if (fs.existsSync(candidate)) {
        filePath = candidate
        layer = (dir.charAt(0).toUpperCase() + dir.slice(1)) as WikiPage["layer"]
        break
      }
    }
  }

  if (!filePath) return null

  const raw = fs.readFileSync(filePath, "utf-8")
  const { data, content } = matter(raw)

  if (!data.title) return null

  const processed = await remark().use(remarkGfm).use(remarkHtml).process(content)

  return {
    slug,
    title: data.title,
    domain: (data.domain || "") as Domain,
    layer,
    tags: Array.isArray(data.tags) ? data.tags : [],
    content,
    contentHtml: processed.toString(),
    created: data.created ? formatDate(String(data.created)) : "",
    updated: data.updated ? formatDate(String(data.updated)) : "",
    confidence: data.confidence || "medium",
    links: extractWikiLinks(content),
  }
}

export function getKnowledgeGraph(): KnowledgeGraph {
  // G0(2026-08-02) 이후 canonical 그래프는 drone-knowledge-graph.json 전용 파일로
  // 분리됐다(understand-anything 플러그인이 구 knowledge-graph.json을 코드 구조
  // 그래프 용도로 같이 써서 우연히 충돌). 이 함수가 마이그레이션 전 경로에 남아있어서
  // data/wiki(배포 번들)에 구 파일이 아예 없는 Vercel에서는 항상 빈 그래프를
  // 반환하고 있었다 — lib/rag.ts의 loadGraph()와 같은 우선순위로 맞춘다.
  const candidates = [
    path.join(WIKI_ROOT, ".ua", "drone-knowledge-graph.json"),
    path.join(WIKI_ROOT, ".ua", "knowledge-graph.json"),
  ]
  const graphPath = candidates.find((p) => fs.existsSync(p))
  if (!graphPath) return { nodes: [], edges: [] }
  const raw = JSON.parse(fs.readFileSync(graphPath, "utf-8"))

  const nodes = (raw.nodes || [])
    .filter((n: any) => n.domain)
    .map((n: any) => ({
      id: n.id || n.slug || n.name,
      name: n.name || n.title || n.id,
      domain: n.domain || "",
      layer: n.layer || "",
      val: (n.tags?.length || 0) + 1,
    }))

  const nodeIds = new Set(nodes.map((n: any) => n.id))
  const edges = (raw.edges || [])
    .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e: any) => ({ source: e.source, target: e.target, type: e.type }))

  return { nodes, edges }
}
