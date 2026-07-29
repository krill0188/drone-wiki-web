"use client"

import { useEffect, useRef, useState } from "react"
import { DOMAIN_META, type GraphNode, type GraphEdge, type KnowledgeGraph } from "@/lib/types"

export default function GraphPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] })
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [filterDomain, setFilterDomain] = useState("")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then((data) => {
      setGraph(data)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded || !containerRef.current) return

    const filtered = filterDomain
      ? { nodes: graph.nodes.filter((n) => n.domain === filterDomain), edges: graph.edges }
      : graph

    import("react-force-graph-2d").then(({ default: ForceGraph2D }) => {
      const { createRoot } = require("react-dom/client")
      const root = (containerRef.current as any).__fgRoot ||
        (() => {
          const r = createRoot(containerRef.current!)
          ;(containerRef.current as any).__fgRoot = r
          return r
        })()

      const nodeIds = new Set(filtered.nodes.map((n) => n.id))
      const edges = filtered.edges.filter((e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string))

      root.render(
        ForceGraph2D({
          graphData: { nodes: filtered.nodes.map((n) => ({ ...n })), links: edges },
          nodeLabel: "name",
          nodeColor: (n: any) => DOMAIN_META[n.domain]?.color || "#94a3b8",
          nodeRelSize: 5,
          linkColor: () => "#cbd5e1",
          linkWidth: 1,
          onNodeClick: (node: any) => setSelected(node as GraphNode),
          width: containerRef.current!.clientWidth,
          height: containerRef.current!.clientHeight,
        })
      )
    })
  }, [loaded, graph, filterDomain])

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 className="font-bold text-sm">지식 그래프</h1>
        <select
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800"
        >
          <option value="">전체 도메인</option>
          {Object.entries(DOMAIN_META).map(([d, m]) => (
            <option key={d} value={d}>{m.emoji} {m.label}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2 ml-2">
          {Object.entries(DOMAIN_META).map(([d, m]) => (
            <span key={d} className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
              {m.label}
            </span>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">{graph.nodes.length} 노드 · {graph.edges.length} 엣지</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 그래프 */}
        <div ref={containerRef} className="flex-1 bg-slate-50 dark:bg-slate-900" />

        {/* 선택된 노드 패널 */}
        {selected && (
          <div className="w-64 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 overflow-y-auto">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-slate-400 hover:text-slate-600 mb-3"
            >
              ✕ 닫기
            </button>
            <div className="text-2xl mb-2">{DOMAIN_META[selected.domain]?.emoji || "📄"}</div>
            <h2 className="font-bold mb-1">{selected.name}</h2>
            <div
              className="inline-block text-xs px-2 py-0.5 rounded-full text-white mb-3"
              style={{ background: DOMAIN_META[selected.domain]?.color || "#94a3b8" }}
            >
              {DOMAIN_META[selected.domain]?.label || selected.domain}
            </div>
            <p className="text-xs text-slate-400 mb-4">{selected.layer}</p>
            <a
              href={`/wiki/${selected.id}`}
              className="block text-center text-sm px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
            >
              위키 보기 →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
