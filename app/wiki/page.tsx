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
    <div className="max-w-3xl mx-auto px-4 py-5">
      <h1 className="font-bold text-lg mb-4">드론 위키</h1>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
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

      <p className="text-xs text-slate-400 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
        {filtered.length}개 문서
      </p>

      {/* 목록 */}
      <ul>
        {filtered.map((p) => {
          const meta = DOMAIN_META[p.domain]
          return (
            <li key={p.slug} className="py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="shrink-0">{meta?.emoji || "📄"}</span>
                <Link
                  href={`/wiki/${p.slug}`}
                  className="text-[15px] leading-snug hover:text-cyan-700 dark:hover:text-cyan-400 min-w-0"
                >
                  {p.title}
                </Link>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 ml-6">
                {meta?.label || "미분류"} · {p.layer}
                {p.tags.length > 0 && <> · {p.tags.slice(0, 4).join(", ")}</>}
              </div>
            </li>
          )
        })}
      </ul>

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
