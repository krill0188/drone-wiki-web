"use client"

import { useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { DOMAIN_META, type GraphNode, type KnowledgeGraph } from "@/lib/types"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

// openwiki 벤치마킹: openwiki visualize는 "인터랙티브 노드 그래프 + 라이브 마크다운
// 리더"를 나란히 보여준다. 이 뷰는 원래 노드 클릭 시 링크 하나만 보여줬는데, 문서
// 미리보기를 그 자리에서 바로 읽을 수 있게 확장했다. 엣지도 openwiki처럼 "문서 간
// 표준 링크"(우리는 [[wikilink]])와 LLM이 추출한 canonical 관계를 색으로 구분한다.
const INTERNAL_LINK_COLOR = "#f97316"
const CANONICAL_EDGE_COLOR = "#94a3b8"

interface PagePreview {
  slug: string
  title: string
  domain: string
  layer: string
  tags: string[]
  contentHtml: string
  updated: string
}

export default function GraphPage() {
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] })
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [preview, setPreview] = useState<PagePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [filterDomain, setFilterDomain] = useState("")
  const [dims, setDims] = useState({ w: 800, h: 600 })

  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then(setGraph)
  }, [])

  useEffect(() => {
    const update = () =>
      setDims({
        w: window.innerWidth - (selected && window.innerWidth >= 640 ? 320 : 0),
        h: window.innerHeight - 104,
      })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [selected])

  useEffect(() => {
    if (!selected) {
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    setPreview(null)
    fetch(`/api/pages/${selected.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPreview)
      .finally(() => setPreviewLoading(false))
  }, [selected])

  const filteredNodes = filterDomain
    ? graph.nodes.filter((n) => n.domain === filterDomain)
    : graph.nodes

  const nodeIds = new Set(filteredNodes.map((n) => n.id))
  const filteredLinks = graph.edges
    .filter((e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string))
    .map((e) => ({ source: e.source, target: e.target, type: e.type }))

  const internalLinkCount = filteredLinks.filter((e) => e.type === "internal-link").length
  const canonicalCount = filteredLinks.length - internalLinkCount

  const handleNodeClick = useCallback((node: any) => setSelected(node as GraphNode), [])

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 44px)" }}>
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
        <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: INTERNAL_LINK_COLOR }} />
            위키 내부 링크 ({internalLinkCount})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: CANONICAL_EDGE_COLOR }} />
            추출된 개념 관계 ({canonicalCount})
          </span>
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {filteredNodes.length} 노드 · {filteredLinks.length} 엣지
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* 그래프 캔버스 */}
        <div className="flex-1 bg-slate-50 dark:bg-slate-900 overflow-hidden">
          <ForceGraph2D
            graphData={{ nodes: filteredNodes.map((n) => ({ ...n })), links: filteredLinks }}
            nodeLabel="name"
            nodeColor={(n: any) => DOMAIN_META[n.domain]?.color || "#94a3b8"}
            nodeRelSize={5}
            linkColor={(l: any) => (l.type === "internal-link" ? `${INTERNAL_LINK_COLOR}cc` : `${CANONICAL_EDGE_COLOR}80`)}
            linkWidth={(l: any) => (l.type === "internal-link" ? 1.4 : 1)}
            onNodeClick={handleNodeClick}
            width={dims.w}
            height={dims.h}
            backgroundColor="transparent"
          />
        </div>

        {/* 노드 상세 + 라이브 미리보기 패널 (openwiki 스타일: 그래프 옆 문서 리더) */}
        {selected && (
          <div className="absolute inset-x-0 bottom-0 max-h-[60%] rounded-t-xl border-t shadow-lg sm:static sm:max-h-none sm:w-80 sm:shrink-0 sm:rounded-none sm:shadow-none sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 overflow-y-auto">
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
            <p className="text-xs text-slate-400 mb-3">{selected.layer}</p>

            {previewLoading && <p className="text-xs text-slate-400">불러오는 중…</p>}
            {!previewLoading && preview && (
              <div
                className="prose prose-slate dark:prose-invert max-w-none text-xs [&_h1]:hidden [&_h2]:text-[13px] [&_p]:mb-2 mb-4 max-h-64 overflow-y-auto pr-1"
                dangerouslySetInnerHTML={{ __html: preview.contentHtml }}
              />
            )}
            {!previewLoading && !preview && (
              <p className="text-xs text-slate-400 mb-4">이 노드는 아직 위키 문서가 없습니다(그래프 전용 개념).</p>
            )}

            <a
              href={`/wiki/${selected.id}`}
              className="block text-center text-sm px-3 py-2 bg-signal-500 hover:bg-signal-500/100 text-white rounded-lg transition-colors"
            >
              전체 문서 보기 →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
