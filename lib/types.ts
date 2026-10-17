export type Domain =
  | "flight-control"
  | "comms-protocol"
  | "hardware"
  | "gcs-software"
  | "ops-mission"
  | "regulations"
  | "ai-autonomy"
  | "sensing-perception"
  | "navigation-gnss-denied"
  | "ros-middleware"
  | "rf-datalink-engineering"
  | "mechanical-structures"
  | "electrical-power"
  | "swarm-multiagent"
  | "simulation-test"
  | "edge-ai-compute"
  | "security"
  | "vendor-registry"
  | "software-ecosystem"
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

// 사이드바 AI 챗봇에 전달하는, 사용자가 현재 보고 있는 위키 문서 컨텍스트
export interface DocContext {
  slug: string
  title: string
  content: string
  domain: Domain
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
  "sensing-perception": { label: "센싱·인지", color: "#06b6d4", emoji: "👁️" },
  "navigation-gnss-denied": { label: "비GNSS 항법", color: "#0ea5e9", emoji: "🧭" },
  "ros-middleware": { label: "ROS·미들웨어", color: "#22c55e", emoji: "🧩" },
  "rf-datalink-engineering": { label: "RF·데이터링크", color: "#a855f7", emoji: "📶" },
  "mechanical-structures": { label: "기계·구조", color: "#d97706", emoji: "⚙️" },
  "electrical-power": { label: "전기·전원", color: "#eab308", emoji: "🔋" },
  "swarm-multiagent": { label: "군집·멀티에이전트", color: "#f43f5e", emoji: "🐝" },
  "simulation-test": { label: "시뮬레이션·시험", color: "#14b8a6", emoji: "🧪" },
  "edge-ai-compute": { label: "엣지 AI 컴퓨트", color: "#8b5cf6", emoji: "🖥️" },
  "security": { label: "보안", color: "#dc2626", emoji: "🔐" },
  "vendor-registry": { label: "제조사 레지스트리", color: "#64748b", emoji: "🏭" },
  "software-ecosystem": { label: "SW 생태계", color: "#2563eb", emoji: "📦" },
}
