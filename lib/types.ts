export type Domain =
  | "flight-control"
  | "comms-protocol"
  | "hardware"
  | "gcs-software"
  | "ops-mission"
  | "regulations"
  | "ai-autonomy"
  | ""

export interface WikiPage {
  slug: string
  title: string
  domain: Domain
  layer: "Concepts" | "Entities" | "Comparisons" | "Queries"
  tags: string[]
  content: string
  contentHtml: string
  created: string
  updated: string
  confidence: "high" | "medium" | "low"
  links: string[]
}

export interface GraphNode {
  id: string
  name: string
  domain: Domain
  layer: string
  val?: number
}

export interface GraphEdge {
  source: string
  target: string
  type?: string
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const DOMAIN_META: Record<string, { label: string; color: string; emoji: string }> = {
  "flight-control":  { label: "비행 제어",    color: "#3b82f6", emoji: "🛩️" },
  "comms-protocol":  { label: "통신 프로토콜", color: "#8b5cf6", emoji: "📡" },
  "hardware":        { label: "하드웨어",      color: "#f59e0b", emoji: "🔧" },
  "gcs-software":    { label: "GCS 소프트웨어",color: "#10b981", emoji: "💻" },
  "ops-mission":     { label: "운용 임무",     color: "#ef4444", emoji: "🎯" },
  "regulations":     { label: "법규 규정",     color: "#6b7280", emoji: "⚖️" },
  "ai-autonomy":     { label: "AI 자율",      color: "#ec4899", emoji: "🤖" },
}
