import fs from "fs"
import path from "path"
import { loadGraph } from "./rag"

// discovery 그래프(raw/ 문서에서 LLM이 자동 추출한 미검증 개념/관계, 2nd Brain의
// Evidence → Canonical Memory → Discovery → Human Decision 4계층 원칙에서
// "Discovery" 단계)를 사람이 한 건씩 검토해서 canonical 위키 문서(concepts/
// entities/*.md)로 승격하는 도구. concepts/entities/*.md에 실제로 새 파일을
// 쓰기 때문에 배포된 공개 사이트(Vercel)에서는 절대 동작하면 안 된다 — 로컬
// 개발 환경(마스터의 머신) 전용이다.

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}
export const WIKI_ROOT = resolveWikiRoot()

const DISCOVERY_PATH = path.join(WIKI_ROOT, ".ua", "discovery-knowledge-graph.json")
const REVIEW_STATE_PATH = path.join(WIKI_ROOT, ".ua", "discovery-review-state.json")

export interface DiscoveryNode {
  id: string
  name: string
  domain?: string
  ontologyClass?: string | null
  sources?: string[]
}

export interface DiscoveryEdge {
  source: string
  target: string
  type: string
}

export interface ReviewStateEntry {
  status: "promoted" | "rejected"
  slug?: string
  layer?: string
  at: string
}

export type ReviewState = Record<string, ReviewStateEntry>

export interface ReviewItem {
  id: string
  name: string
  ontologyClass: string
  sources: string[]
  outgoing: { name: string; type: string }[]
  incoming: { name: string; type: string }[]
}

// Vercel(process.env.VERCEL이 항상 설정됨)에서는 항상 false — 파일 쓰기 API는
// 이 값을 반드시 확인하고 false면 거부해야 한다.
export function isReviewWritable(): boolean {
  return !process.env.VERCEL
}

export function loadDiscoveryGraph(): { nodes: DiscoveryNode[]; edges: DiscoveryEdge[] } {
  if (!fs.existsSync(DISCOVERY_PATH)) return { nodes: [], edges: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(DISCOVERY_PATH, "utf-8"))
    return { nodes: raw.nodes ?? [], edges: raw.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

export function loadReviewState(): ReviewState {
  if (!fs.existsSync(REVIEW_STATE_PATH)) return {}
  try {
    return JSON.parse(fs.readFileSync(REVIEW_STATE_PATH, "utf-8"))
  } catch {
    return {}
  }
}

export function saveReviewState(state: ReviewState): void {
  fs.mkdirSync(path.dirname(REVIEW_STATE_PATH), { recursive: true })
  fs.writeFileSync(REVIEW_STATE_PATH, JSON.stringify(state, null, 2))
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

// lib/graphrag.ts의 resolveDiscoveryToCanonical과 같은 휴리스틱 — 이미 canonical
// 위키 문서가 있는 개념은 중복 승격 후보에서 제외한다.
function alreadyCanonical(name: string, canonicalNames: string[]): boolean {
  const n = normalizeName(name)
  if (n.length < 3) return true
  for (const c of canonicalNames) {
    if (!c) continue
    if (c === n || (n.length >= 4 && (c.includes(n) || n.includes(c)))) return true
  }
  return false
}

export function getPendingReviewItems(): ReviewItem[] {
  const { nodes, edges } = loadDiscoveryGraph()
  if (nodes.length === 0) return []

  const canonical = loadGraph()
  const canonicalNames = canonical.nodes.map((n) => normalizeName(n.name || n.id))
  const reviewState = loadReviewState()
  const byId = new Map(nodes.map((n) => [n.id, n]))

  return nodes
    .filter((n) => !reviewState[n.id])
    .filter((n) => !alreadyCanonical(n.name, canonicalNames))
    .map((n) => {
      const outgoing = edges
        .filter((e) => e.source === n.id)
        .map((e) => ({ name: byId.get(e.target)?.name ?? e.target, type: e.type }))
        .slice(0, 8)
      const incoming = edges
        .filter((e) => e.target === n.id)
        .map((e) => ({ name: byId.get(e.source)?.name ?? e.source, type: e.type }))
        .slice(0, 8)
      return {
        id: n.id,
        name: n.name,
        ontologyClass: n.ontologyClass || "Concept",
        sources: n.sources ?? [],
        outgoing,
        incoming,
      }
    })
    // 연결이 많은(그래프에서 중요한) 개념을 먼저 검토하도록 정렬
    .sort((a, b) => b.outgoing.length + b.incoming.length - (a.outgoing.length + a.incoming.length))
}

export function readSourceExcerpt(relPath: string, maxChars = 1500): string {
  const full = path.join(WIKI_ROOT, relPath)
  if (!fs.existsSync(full)) return ""
  try {
    const raw = fs.readFileSync(full, "utf-8")
    const body = raw.startsWith("---") ? raw.slice(raw.indexOf("\n---", 3) + 4) : raw
    return body.trim().slice(0, maxChars)
  } catch {
    return ""
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
