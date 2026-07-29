"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { DOMAIN_META, type WikiPage } from "@/lib/types"

function WikiList() {
  const searchParams = useSearchParams()
  const [pages, setPages] = useState<WikiPage[]>([])
  const [query, setQuery] = useState("")
  const [domain, setDomain] = useState(searchParams.get("domain") || "")
  const [layer, setLayer] = useState("")

  useEffect(() => {
    fetch("/api/pages").then((r) => r.json()).then(setPages)
  }, [])

  const filtered = pages.filter((p) => {
    const matchQ = !query || p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
    const matchD = !domain || p.domain === domain
    const matchL = !layer || p.layer === layer
    return matchQ && matchD && matchL
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">드론 위키</h1>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목·태그 검색..."
          className="flex-1 min-w-[180px] border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">전체 도메인</option>
          {Object.entries(DOMAIN_META).map(([d, m]) => (
            <option key={d} value={d}>{m.emoji} {m.label}</option>
          ))}
        </select>
        <select
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <option value="">전체 레이어</option>
          <option value="Concepts">Concepts</option>
          <option value="Entities">Entities</option>
          <option value="Comparisons">Comparisons</option>
          <option value="Queries">Queries</option>
        </select>
      </div>

      <p className="text-sm text-slate-400 mb-4">{filtered.length}개 문서</p>

      {/* 목록 */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const meta = DOMAIN_META[p.domain]
          return (
            <Link
              key={p.slug}
              href={`/wiki/${p.slug}`}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md hover:border-cyan-400 dark:hover:border-cyan-500 transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-lg">{meta?.emoji || "📄"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                  {p.layer}
                </span>
              </div>
              <div className="font-semibold text-sm mb-1 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-2">
                {p.title}
              </div>
              <div className="text-xs text-slate-400 mb-2">{meta?.label}</div>
              <div className="flex flex-wrap gap-1">
                {p.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <div className="text-4xl mb-4">🔍</div>
          <p>검색 결과가 없습니다</p>
        </div>
      )}
    </div>
  )
}

export default function WikiPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-slate-400">로딩 중...</div>}>
      <WikiList />
    </Suspense>
  )
}
