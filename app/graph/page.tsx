"use client"

import { useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { DOMAIN_META, type GraphNode, type KnowledgeGraph } from "@/lib/types"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

export default function GraphPage() {
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] })
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [filterDomain, setFilterDomain] = useState("")
  const [dims, setDims] = useState({ w: 800, h: 600 })

  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then(setGraph)
  }, [])

  useEffect(() => {
    const update = () =>
      setDims({ w: window.innerWidth - (selected ? 256 : 0), h: window.innerHeight - 104 })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [selected])

  const filteredNodes = filterDomain
    ? graph.nodes.filter((n) => n.domain === filterDomain)
    : graph.nodes

  const nodeIds = new Set(filteredNodes.map((n) => n.id))
  const filteredLinks = graph.edges
    .filter((e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string))
    .map((e) => ({ source: e.source, target: e.target }))

  const handleNodeClick = useCallback((node: any) => setSelected(node as GraphNode), [])

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
        <h1 className="font-bold text-sm">지식 그래프</h1>
        <select
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800"
        >
          <option value="">전체 도메인</option>
          {Object.entries(DOMAIN_META).map(([d, m]) => (
            <option key={d} value={d}>{m.label}</option>
          ))}
        </select>
        <div className="hidden sm:flex flex-wrap gap-2">
          {Object.entries(DOMAIN_META).map(([d, m]) => (
            <span key={d} className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: m.color }} />
              {m.label}
            </span>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {filteredNodes.length} 노드 · {filteredLinks.length} 엣지
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 그래프 캔버스 */}
        <div className="flex-1 bg-slate-50 dark:bg-slate-900 overflow-hidden">
          <ForceGraph2D
            graphData={{ nodes: filteredNodes.map((n) => ({ ...n })), links: filteredLinks }}
            nodeLabel="name"
            nodeColor={(n: any) => DOMAIN_META[n.domain]?.color || "#94a3b8"}
            nodeRelSize={5}
            linkColor={() => "#cbd5e180"}
            linkWidth={1}
            onNodeClick={handleNodeClick}
            width={dims.w}
            height={dims.h}
            backgroundColor="transparent"
          />
        </div>

        {/* 노드 상세 패널 */}
        {selected && (
          <div className="w-64 shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 overflow-y-auto">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-slate-400 hover:text-slate-600 mb-3 block"
            >
              ✕ 닫기
            </button>
            <div className="text-2xl mb-2">{DOMAIN_META[selected.domain]?.emoji || "📄"}</div>
            <h2 className="font-bold text-sm mb-1">{selected.name}</h2>
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
