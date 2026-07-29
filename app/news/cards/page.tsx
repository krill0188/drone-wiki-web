"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { DOMAIN_META } from "@/lib/types"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

const TYPE_OPTIONS = [
  { value: "", label: "전체 최신" },
  { value: "news", label: "📰 뉴스" },
  { value: "release", label: "🚀 릴리즈" },
  { value: "defense", label: "🪖 방산" },
  { value: "gov", label: "🏛️ 정부사업" },
  { value: "job", label: "💼 채용" },
]

const GRADIENTS = [
  "linear-gradient(135deg, #0f172a, #0e7490)",
  "linear-gradient(135deg, #1e293b, #3b82f6)",
  "linear-gradient(135deg, #0f172a, #8b5cf6)",
  "linear-gradient(135deg, #1e293b, #10b981)",
  "linear-gradient(135deg, #0f172a, #ec4899)",
  "linear-gradient(135deg, #1e293b, #f59e0b)",
  "linear-gradient(135deg, #0f172a, #ef4444)",
]

interface CardNewsResult {
  title: string
  cards: { emoji: string; heading: string; body: string }[]
  hashtags: string[]
  newsUsed: { title: string; url: string; type: string }[]
  wikiSources: { slug: string; title: string; domain: string }[]
  subgraph: {
    nodes: { id: string; name: string; domain?: string; seed: boolean }[]
    edges: { source: string; target: string }[]
  }
}

export default function CardNewsPage() {
  const [type, setType] = useState("")
  const [region, setRegion] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<CardNewsResult | null>(null)
  const [graphW, setGraphW] = useState(600)

  useEffect(() => {
    const update = () => setGraphW(Math.min(window.innerWidth - 48, 720))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const generate = async () => {
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/cardnews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, region }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "생성 실패")
      setResult(data)
    } catch (e: any) {
      setError(e.message || "오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
        <Link href="/news" className="hover:text-cyan-600">← 뉴스 목록</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">🎴 AI 카드뉴스</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        최신 뉴스를 위키 지식으로 학습해 SNS 카드뉴스로 만들어드립니다
      </p>

      {/* 생성 컨트롤 */}
      <div className="flex flex-wrap gap-2 items-center mb-8 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800"
        >
          <option value="">국내+해외</option>
          <option value="KR">🇰🇷 국내</option>
          <option value="global">🌏 해외</option>
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg font-semibold text-sm transition-colors"
        >
          {loading ? "생성 중..." : "✨ 카드뉴스 생성"}
        </button>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-4 animate-pulse">🎴</div>
          <p className="text-sm">뉴스를 학습하고 카드를 작성하는 중... (~20초)</p>
        </div>
      )}
      {error && (
        <div className="text-center py-10 text-red-500 text-sm">⚠️ {error}</div>
      )}

      {result && (
        <div className="space-y-10">
          {/* 카드 덱 */}
          <div>
            <h2 className="text-lg font-bold mb-4">{result.title}</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory -mx-4 px-4">
              {result.cards.map((c, i) => (
                <div
                  key={i}
                  className="snap-center shrink-0 w-72 h-72 sm:w-80 sm:h-80 rounded-2xl p-6 flex flex-col justify-between text-white shadow-lg"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                >
                  <div className="text-xs opacity-60 font-mono">{i + 1} / {result.cards.length}</div>
                  <div>
                    <div className="text-4xl mb-3">{c.emoji}</div>
                    <div className="font-extrabold text-xl leading-snug mb-3">{c.heading}</div>
                    <p className="text-sm opacity-90 leading-relaxed">{c.body}</p>
                  </div>
                  <div className="text-xs opacity-50">🛸 DroneWiki</div>
                </div>
              ))}
            </div>
            {result.hashtags.length > 0 && (
              <p className="text-sm text-cyan-600 dark:text-cyan-400 mt-2">
                {result.hashtags.join(" ")}
              </p>
            )}
          </div>

          {/* GraphRAG 시각화 */}
          {result.subgraph.nodes.length > 0 && (
            <div>
              <h3 className="font-bold mb-1">🔵 이 카드뉴스가 학습한 지식 그래프</h3>
              <p className="text-xs text-slate-400 mb-3">
                큰 노드 = 직접 참조한 위키 문서 · 작은 노드 = 연관 개념
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900">
                <ForceGraph2D
                  graphData={{
                    nodes: result.subgraph.nodes.map((n) => ({ ...n })),
                    links: result.subgraph.edges.map((e) => ({ source: e.source, target: e.target })),
                  }}
                  nodeLabel="name"
                  nodeColor={(n: any) => DOMAIN_META[n.domain]?.color || "#94a3b8"}
                  nodeVal={(n: any) => (n.seed ? 8 : 3)}
                  linkColor={() => "#cbd5e180"}
                  width={graphW}
                  height={300}
                  backgroundColor="transparent"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {result.wikiSources.map((s) => {
                  const meta = DOMAIN_META[s.domain]
                  return (
                    <Link
                      key={s.slug}
                      href={`/wiki/${s.slug}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border hover:underline"
                      style={{ borderColor: meta?.color || "#94a3b8", color: meta?.color || "#94a3b8" }}
                    >
                      {meta?.emoji || "📄"} {s.title}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* 참조 뉴스 */}
          <div>
            <h3 className="font-bold mb-3">📎 참조한 뉴스 {result.newsUsed.length}건</h3>
            <ul className="space-y-1.5">
              {result.newsUsed.map((n) => (
                <li key={n.url}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400"
                  >
                    · {n.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
